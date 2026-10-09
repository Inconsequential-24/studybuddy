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

function evidence(room: Room, page: number) {
  const source: SourcePage = {
    documentId: room.documents[0].id, page, localPage: page,
    text: `Verified fixture evidence on page ${page}.`, figures: [], tables: [],
  };
  const concept: Concept = {
    id: `${room.id}-concept-${page}`, title: `Fixture concept ${page}`,
    summary: source.text, refs: [{ page, kind: "text", quote: source.text }],
    pageRefs: [page], mastery: 25, estimatedMinutes: 8, reviewDue: false,
  };
  return { source, concepts: [concept] };
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
  if (!value) throw new Error("Usage: retry-browser-fixtures.ts guard | seed <ownerId> | read/ready/failed/cleanup <classroomId>");
  if (command === "seed") {
    const id = randomUUID();
    const room: Room = {
      id, name: PREFIX + id, subject: "Browser regression",
      documents: [{ id: randomUUID(), name: "isolated-fixture.pdf", pageCount: 2, objectPath: `/objects/retry-browser-${id}` }],
      concepts: [], status: "needs-attention",
      coverage: { pages: 2, mappedPages: 1, figures: 0, tables: 0, concepts: 1,
        flaggedPages: [2], failedPages: 1, pendingPages: 0, processingPages: 0,
        failures: [{ page: 2, ...failure, attempts: 3 }] },
      updatedAt: new Date().toISOString(),
    };
    const first = evidence(room, 1);
    room.concepts = first.concepts;
    await db.transaction(async (tx) => {
      await tx.insert(tutorClassrooms).values({ id, ownerId: value, data: room, sourceMap: [first.source] });
      await tx.insert(tutorPageJobs).values(pageJobs(room, [first.source]).map((job) =>
        job.page === 1 ? { ...job, result: first, attempts: 1, totalAttempts: 1 } :
          { ...job, status: "failed", failure, attempts: 3, totalAttempts: 3 }));
    });
    console.log(JSON.stringify({ id, ownerId: value }));
    return;
  }
  const row = await load(value);
  if (command === "read") {
    const jobs = await db.select().from(tutorPageJobs).where(eq(tutorPageJobs.classroomId, value));
    console.log(JSON.stringify({ ...row, jobs }));
    return;
  }
  if (command === "cleanup") {
    await db.delete(tutorClassrooms).where(eq(tutorClassrooms.id, value));
    return;
  }
  if (command !== "ready" && command !== "failed") throw new Error("Unknown fixture command");
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, value)).for("update");
    const room = current.data as Room;
    if (room.status !== "processing") throw new Error("Click the real retry button before advancing the fixture");
    const result = evidence(room, 2);
    const succeeded = command === "ready";
    const jobs = await tx.select().from(tutorPageJobs).where(eq(tutorPageJobs.classroomId, value));
    const second = jobs.find((job) => job.page === 2)!;
    await tx.update(tutorPageJobs).set({
      status: succeeded ? "succeeded" : "failed", attempts: succeeded ? 1 : 3,
      totalAttempts: second.totalAttempts + (succeeded ? 1 : 3),
      result: succeeded ? result : null, failure: succeeded ? null : failure,
    }).where(eq(tutorPageJobs.id, second.id));
    room.status = succeeded ? "ready" : "needs-attention";
    if (succeeded) room.concepts.push(...result.concepts);
    room.coverage = { ...room.coverage, mappedPages: succeeded ? 2 : 1,
      concepts: room.concepts.length, pendingPages: 0, processingPages: 0,
      flaggedPages: succeeded ? [] : [2], failedPages: succeeded ? 0 : 1,
      failures: succeeded ? [] : [{ page: 2, ...failure, attempts: 3 }] };
    room.updatedAt = new Date().toISOString();
    await tx.update(tutorClassrooms).set({ data: room,
      sourceMap: succeeded ? [...row.sourceMap as SourcePage[], result.source] : row.sourceMap,
    }).where(eq(tutorClassrooms.id, value));
  });
}

try { await main(); } finally { await pool.end(); }
