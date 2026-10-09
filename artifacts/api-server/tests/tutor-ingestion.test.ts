import assert from "node:assert/strict";
import { test } from "node:test";
import { fork } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool, tutorClassrooms, tutorPageJobs } from "@workspace/db";
import { cancelClassroomAnalysis, pageJobs, retryFailedPages, runIngestionPass, type PageProcessor } from "../src/lib/tutor-ingestion";
import { PageAnalysisError, validateReferences } from "../src/lib/tutor-ai";
import type { Concept, Room, SourcePage } from "../src/lib/tutor-types";

function fixture(count = 2): Room {
  const id = randomUUID();
  return { id, name: "Ingestion integration fixture", subject: "", documents: [{ id: randomUUID(), name: "fixture.pdf", pageCount: count, objectPath: "/objects/test-fixture" }], concepts: [], status: "processing", coverage: { pages: count, mappedPages: 0, concepts: 0, figures: 0, tables: 0, flaggedPages: [] }, updatedAt: new Date().toISOString() };
}
const success: PageProcessor = async (job) => {
  const source: SourcePage = {
    page: job.page, localPage: job.localPage, documentId: job.documentId, text: "Verified page text",
    figures: [{ id: `p${job.page}-figure`, caption: "Cell diagram", description: "Membrane", labels: ["Membrane"], relationships: ["Membrane surrounds cell"] }],
    tables: [{ id: `p${job.page}-table`, caption: "Measurements", rows: [["Cell", "10"]] }],
  };
  const concept: Concept = {
    id: `concept-${job.id}`, title: "Verified", summary: source.text,
    refs: [{ page: job.page, kind: "text", quote: source.text }, { page: job.page, kind: "figure", sourceId: `p${job.page}-figure`, quote: "Cell diagram" }, { page: job.page, kind: "table", sourceId: `p${job.page}-table`, quote: "Measurements" }],
    pageRefs: [job.page], mastery: 0, estimatedMinutes: 8, reviewDue: false,
  };
  return { source, concepts: [concept] };
};
async function create(room: Room) {
  await db.transaction(async (tx) => {
    await tx.insert(tutorClassrooms).values({ id: room.id, ownerId: "ingestion-integration-test", data: room, sourceMap: [] });
    await tx.insert(tutorPageJobs).values(pageJobs(room));
  });
}
async function read(id: string) {
  const [row] = await db.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, id));
  return { room: row?.data as Room, pages: row?.sourceMap as SourcePage[] };
}
async function due(id: string) {
  await db.update(tutorPageJobs).set({ nextAttemptAt: new Date(0) }).where(eq(tutorPageJobs.classroomId, id));
}

// These tests need the development schema and must run with the API worker
// stopped, so the fixture jobs cannot be picked up by a real paid mapper.
test("persistent ingestion: crash recovery, bounded retries, deletion, citations", { timeout: 120000 }, async (t) => {
  const ids: string[] = [];
  try {
    await t.test("restart an actual process mid-ingestion without replaying page one", async () => {
      const room = fixture();
      ids.push(room.id);
      await create(room);
      const child = fork(new URL("./ingestion-child.ts", import.meta.url), [room.id], {
        execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "inherit", "ipc"],
      });
      try {
        await Promise.race([once(child, "message"), once(child, "exit").then(() => { throw new Error("Child exited before page two"); }), new Promise((_, reject) => setTimeout(() => reject(new Error("Child timed out")), 60000).unref())]);
      } finally {
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
      }
      assert.equal((await read(room.id)).room.coverage.mappedPages, 1);
      const calls: number[] = [];
      await runIngestionPass(async (...args) => { calls.push(args[0].page); return success(...args); }, room.id);
      assert.deepEqual(calls, [2]);
      const current = await read(room.id);
      assert.equal(current.room.status, "ready");
      assert.equal(current.pages.length, 2);
      assert.equal(current.room.coverage.figures, 1);
      assert.equal(current.room.coverage.tables, 1);
      assert.ok(current.room.concepts.every((c) => validateReferences(c.refs, current.pages)));
    });

    await t.test("three attempts, explicit retry of only failed pages, stable source map", async () => {
      const room = fixture();
      ids.push(room.id);
      await create(room);
      const failing: PageProcessor = async (...args) => {
        if (args[0].page === 2) throw new PageAnalysisError("unverified_sources", "Citations could not be verified.");
        return success(...args);
      };
      for (let i = 0; i < 3; i++) { await due(room.id); await runIngestionPass(failing, room.id); }
      const before = await read(room.id);
      assert.equal(before.room.status, "needs-attention");
      assert.deepEqual(before.room.coverage.flaggedPages, [2]);
      assert.equal(before.room.coverage.mappedPages, 1);
      assert.equal(before.room.coverage.failures?.[0].code, "unverified_sources");
      await runIngestionPass(() => { throw new Error("Exhausted jobs must not run"); }, room.id);
      const retried = await retryFailedPages(room.id);
      assert.equal(retried?.status, "processing");
      assert.equal(retried?.coverage.mappedPages, 1);
      const calls: number[] = [];
      await runIngestionPass(async (...args) => { calls.push(args[0].page); return success(...args); }, room.id);
      assert.deepEqual(calls, [2]);
      const after = await read(room.id);
      assert.equal(after.room.status, "ready");
      assert.deepEqual(after.pages[0], before.pages[0]);
      assert.deepEqual(after.room.concepts[0], before.room.concepts[0]);
      const [job] = await db.select().from(tutorPageJobs).where(and(eq(tutorPageJobs.classroomId, room.id), eq(tutorPageJobs.page, 2)));
      assert.equal(job.totalAttempts, 4);
      assert.ok(after.room.concepts.every((c) => validateReferences(c.refs, after.pages)));
      assert.equal(validateReferences([{ page: 1, kind: "figure", sourceId: room.documents[0].id, quote: "Cell diagram" }], after.pages), false);
      assert.equal(validateReferences([{ page: 1, kind: "text", quote: "Invented evidence" }], after.pages), false);
    });

    await t.test("rate limiting persists a queue cooldown instead of hammering other pages", async () => {
      const room = fixture(3);
      ids.push(room.id);
      await create(room);
      const calls: number[] = [];
      await runIngestionPass(async (job) => {
        calls.push(job.page);
        throw Object.assign(new Error("Rate limit exceeded"), { status: 429 });
      }, room.id);
      assert.deepEqual(calls, [1]);
      const jobs = await db.select().from(tutorPageJobs).where(eq(tutorPageJobs.classroomId, room.id));
      assert.ok(jobs.every((job) => job.nextAttemptAt.getTime() > Date.now() + 45000));
      assert.equal((await read(room.id)).room.coverage.failures?.[0].code, "analysis_rate_limited");
      await runIngestionPass(async (...args) => { calls.push(args[0].page); return success(...args); }, room.id);
      assert.deepEqual(calls, [1]);
      assert.equal((await read(room.id)).room.status, "processing");
      await due(room.id);
      await runIngestionPass(success, room.id);
      assert.equal((await read(room.id)).room.status, "ready");
    });

    await t.test("deletion aborts in-flight work and skips remaining paid calls", async () => {
      const room = fixture(3);
      ids.push(room.id);
      await create(room);
      const calls: number[] = [];
      await runIngestionPass(async (job, _room, signal, canContinue) => {
        calls.push(job.page);
        assert.equal(await canContinue(), true);
        await db.delete(tutorClassrooms).where(eq(tutorClassrooms.id, room.id));
        cancelClassroomAnalysis(room.id);
        assert.equal(signal.aborted, true);
        assert.equal(await canContinue(), false);
        signal.throwIfAborted();
        throw new Error("Unreachable");
      }, room.id);
      assert.deepEqual(calls, [1]);
      assert.equal((await db.select().from(tutorPageJobs).where(eq(tutorPageJobs.classroomId, room.id))).length, 0);
      assert.equal((await read(room.id)).room, undefined);
    });

    await t.test("a legacy interrupted classroom keeps previously verified pages", async () => {
      const room = fixture();
      ids.push(room.id);
      const result = await success({ ...pageJobs(room)[0], attempts: 0, totalAttempts: 0, failure: null, nextAttemptAt: new Date(), updatedAt: new Date() }, room, new AbortController().signal, async () => true);
      room.concepts = result.concepts;
      room.coverage.mappedPages = 1;
      await db.insert(tutorClassrooms).values({ id: room.id, ownerId: "ingestion-integration-test", data: room, sourceMap: [result.source] });
      const calls: number[] = [];
      await runIngestionPass(async (...args) => { calls.push(args[0].page); return success(...args); }, room.id);
      assert.deepEqual(calls, [2]);
      const current = await read(room.id);
      assert.equal(current.room.status, "ready");
      assert.deepEqual(current.pages[0], result.source);
    });
  } finally {
    for (const id of ids) await db.delete(tutorClassrooms).where(eq(tutorClassrooms.id, id));
    await pool.end();
  }
});
