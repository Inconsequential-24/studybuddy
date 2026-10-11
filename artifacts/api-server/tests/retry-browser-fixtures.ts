/**
 * CLI fixtures for signed-in browser tests. No test routes or auth bypasses are
 * installed in the app. Run `guard` before seeding and keep it alive until
 * cleanup: it holds the ingestion worker's advisory lock to prevent paid calls.
 * `ready`/`failed` simulate the external analysis result, not the retry request.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool, tutorClassrooms, tutorPageJobs } from "@workspace/db";
import { pageJobs } from "../src/lib/tutor-ingestion";
import type { Concept, Room, SourcePage } from "../src/lib/tutor-types";

const PREFIX = "Retry browser fixture ";
const [command, value] = process.argv.slice(2);
const failure = { code: "unverified_sources", message: "Fixture citations could not be verified." };

function evidence(room: Room, page: number, withVisuals = false) {
  let offset = 0;
  const document = room.documents.find((candidate) => {
    offset += candidate.pageCount;
    return page <= offset;
  });
  if (!document) throw new Error(`No document contains global page ${page}`);
  const localPage = page - (offset - document.pageCount);
  const source: SourcePage = {
    documentId: document.id, page, localPage,
    text: `Verified fixture evidence on page ${page}.`, figures: [], tables: [],
  };
  if (withVisuals) {
    source.figures.push({
      id: `p${page}-figure-1`, caption: `Fixture figure on page ${page}`,
      description: `A retained diagram associated with global page ${page}.`,
      labels: [`Figure label ${page}`], relationships: [],
    });
    source.tables.push({
      id: `p${page}-table-1`, caption: `Fixture table on page ${page}`,
      rows: [["Page", "Evidence"], [String(page), `Table evidence ${page}`]],
    });
  }
  const concept: Concept = {
    id: `${room.id}-concept-${page}`, title: `Fixture concept ${page}`,
    summary: source.text,
    refs: [
      { page, kind: "text", quote: source.text },
      ...source.figures.map((figure) => ({ page, kind: "figure" as const, sourceId: figure.id, quote: figure.caption })),
      ...source.tables.map((table) => ({ page, kind: "table" as const, sourceId: table.id, quote: table.caption })),
    ],
    pageRefs: [page], mastery: 25, estimatedMinutes: 8, reviewDue: false,
  };
  return { source, concepts: [concept] };
}

function makeRoom(id: string, documents: Room["documents"], ready: boolean, pages: number[], failedPage: number) {
  const totalPages = documents.reduce((sum, document) => sum + document.pageCount, 0);
  const room: Room = {
    id, name: PREFIX + id, subject: "Browser regression", documents,
    concepts: [], status: ready ? "ready" : "needs-attention",
    coverage: {
      pages: totalPages, mappedPages: pages.length,
      figures: 0, tables: 0, concepts: 0,
      flaggedPages: ready ? [] : [failedPage],
      failedPages: ready ? 0 : 1, pendingPages: 0, processingPages: 0,
      failures: ready ? [] : [{ page: failedPage, ...failure, attempts: 3 }],
    },
    updatedAt: new Date().toISOString(),
  };
  const results = pages.map((page) => evidence(room, page, documents.length > 1 && page !== 1));
  room.concepts = results.flatMap((result) => result.concepts);
  room.coverage.figures = results.reduce((count, result) => count + result.source.figures.length, 0);
  room.coverage.tables = results.reduce((count, result) => count + result.source.tables.length, 0);
  room.coverage.concepts = room.concepts.length;
  return { room, results };
}

async function load(id: string) {
  const [row] = await db.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, id));
  if (!row || !(row.data as Room).name.startsWith(PREFIX)) throw new Error("Not a browser fixture");
  return row;
}

async function main() {
  if (command === "guard") {
    const client = await pool.connect();
    const lock = await client.query("SELECT pg_try_advisory_lock($1) AS acquired", [74201931]);
    if (!lock.rows[0].acquired) throw new Error("Worker is busy; try guard again after it finishes");
    console.log("Fixture worker guard ready");
    await new Promise<void>((resolve) => {
      process.once("SIGTERM", resolve);
      process.once("SIGINT", resolve);
    });
    await client.query("SELECT pg_advisory_unlock($1)", [74201931]);
    client.release();
    return;
  }
  if (!value) throw new Error("Usage: retry-browser-fixtures.ts guard | seed/seed-ready/seed-multi <ownerId> | read/ready/failed/cleanup <classroomId>");
  if (command === "seed" || command === "seed-ready" || command === "seed-multi") {
    const ready = command === "seed-ready";
    const id = randomUUID();
    const documents: Room["documents"] = command === "seed-multi"
      ? [
          { id: randomUUID(), name: "fixture-intro.pdf", pageCount: 1, objectPath: `/objects/retry-browser-${id}-a` },
          { id: randomUUID(), name: "fixture-middle.pdf", pageCount: 2, objectPath: `/objects/retry-browser-${id}-b` },
          { id: randomUUID(), name: "fixture-final.pdf", pageCount: 1, objectPath: `/objects/retry-browser-${id}-c` },
        ]
      : [{ id: randomUUID(), name: "isolated-fixture.pdf", pageCount: 2, objectPath: `/objects/retry-browser-${id}` }];
    const totalPages = documents.reduce((sum, document) => sum + document.pageCount, 0);
    const failedPage = command === "seed-multi" ? 3 : totalPages;
    const successPages = Array.from({ length: totalPages }, (_, index) => index + 1)
      .filter((page) => ready || page !== failedPage);
    const { room, results } = makeRoom(id, documents, ready, successPages, failedPage);
    const sources = results.map((result) => result.source);
    await db.transaction(async (tx) => {
      await tx.insert(tutorClassrooms).values({ id, ownerId: value, data: room, sourceMap: sources });
      await tx.insert(tutorPageJobs).values(pageJobs(room, sources).map((job) => {
        const result = results.find((candidate) => candidate.source.page === job.page);
        if (result) return { ...job, result, attempts: 1, totalAttempts: 1 };
        return { ...job, status: "failed", failure, attempts: 3, totalAttempts: 3 };
      }));
    });
    console.log(JSON.stringify({ id, ownerId: value }));
    return;
  }
  if (command === "cleanup") {
    const [row] = await db.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, value));
    if (row && !(row.data as Room).name.startsWith(PREFIX)) throw new Error("Not a browser fixture");
    if (row) await db.delete(tutorClassrooms).where(eq(tutorClassrooms.id, value));
    return;
  }
  const row = await load(value);
  if (command === "read") {
    const jobs = await db.select().from(tutorPageJobs).where(eq(tutorPageJobs.classroomId, value));
    console.log(JSON.stringify({ ...row, jobs }));
    return;
  }
  if (command !== "ready" && command !== "failed") throw new Error("Unknown fixture command");
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, value)).for("update");
    const room = current.data as Room;
    if (room.status !== "processing") throw new Error("Click the real retry button before advancing the fixture");
    const jobs = await tx.select().from(tutorPageJobs).where(eq(tutorPageJobs.classroomId, value));
    const failedJob = jobs.find((job) => job.status === "failed");
    if (!failedJob) throw new Error("Fixture has no failed page to advance");
    const result = evidence(room, failedJob.page, room.documents.length > 1);
    const succeeded = command === "ready";
    await tx.update(tutorPageJobs).set({
      status: succeeded ? "succeeded" : "failed", attempts: succeeded ? 1 : 3,
      totalAttempts: failedJob.totalAttempts + (succeeded ? 1 : 3),
      result: succeeded ? result : null, failure: succeeded ? null : failure,
    }).where(eq(tutorPageJobs.id, failedJob.id));
    if (succeeded) {
      room.concepts.push(...result.concepts);
      room.concepts.sort((a, b) => a.pageRefs[0]! - b.pageRefs[0]!);
    }
    const remainingJobs = jobs.map((job) => job.id === failedJob.id
      ? { ...job, status: succeeded ? "succeeded" : "failed", result: succeeded ? result : null }
      : job);
    const successfulResults = remainingJobs
      .filter((job) => job.status === "succeeded")
      .sort((a, b) => a.page - b.page)
      .map((job) => job.id === failedJob.id ? result : job.result as { source: SourcePage; concepts: Concept[] });
    const failedJobs = remainingJobs.filter((job) => job.status === "failed");
    room.coverage = {
      ...room.coverage,
      mappedPages: successfulResults.length,
      figures: successfulResults.reduce((count, item) => count + item.source.figures.length, 0),
      tables: successfulResults.reduce((count, item) => count + item.source.tables.length, 0),
      concepts: room.concepts.length, pendingPages: 0, processingPages: 0,
      flaggedPages: failedJobs.map((job) => job.page), failedPages: failedJobs.length,
      failures: failedJobs.map((job) => ({ page: job.page, ...failure, attempts: 3 })),
    };
    room.status = failedJobs.length ? "needs-attention" : "ready";
    room.updatedAt = new Date().toISOString();
    await tx.update(tutorClassrooms).set({ data: room,
      sourceMap: succeeded ? successfulResults.map((item) => item.source) : row.sourceMap,
    }).where(eq(tutorClassrooms.id, value));
  });
}

try { await main(); } finally { await pool.end(); }
