import { randomUUID } from "node:crypto";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db, pool, tutorClassrooms, tutorPageJobs, type TutorPageJob } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import { mapPdfPage, PageAnalysisError } from "./tutor-ai";
import { isRateLimitError } from "@workspace/integrations-gemini-ai/batch";
import { logger } from "./logger";
import type { Concept, Room, SourcePage } from "./tutor-types";

type PageResult = { source: SourcePage; concepts: Concept[] };
type Failure = { code: string; message: string };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const MAX_ATTEMPTS = 3;
// A session lock allows immediate recovery on process death, without expiring
// a lease while a slow model request is still running in another instance.
const WORKER_LOCK = 74201931;
const active = new Map<string, AbortController>();
let running = false;
const storage = new ObjectStorageService();

export function pageJobs(room: Room, pages: SourcePage[] = []) {
  let offset = 0;
  return room.documents.flatMap((document) => {
    const jobs = Array.from({ length: document.pageCount }, (_, index) => {
      const page = offset + index + 1;
      const source = pages.find((p) => p.page === page);
      const verified = source && !room.coverage.flaggedPages.includes(page);
      return {
        id: randomUUID(), classroomId: room.id, documentId: document.id,
        localPage: index + 1, page, status: verified ? "succeeded" : "pending",
        result: verified ? { source, concepts: room.concepts.filter((c) => c.pageRefs.includes(page)) } : null,
      };
    });
    offset += document.pageCount;
    return jobs;
  });
}

async function project(tx: Transaction, classroomId: string): Promise<Room | undefined> {
  const [row] = await tx.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, classroomId)).for("update");
  if (!row) return;
  const room = row.data as Room;
  const jobs = await tx.select().from(tutorPageJobs).where(eq(tutorPageJobs.classroomId, classroomId)).orderBy(asc(tutorPageJobs.page));
  const successes = jobs.filter((j) => j.status === "succeeded");
  const results = successes.map((j) => j.result as PageResult);
  const pages = results.map((r) => r.source);
  // Keep stable concept IDs and learning progress for already-verified pages.
  const existing = new Map(room.concepts.map((c) => [c.id, c]));
  room.concepts = [...new Map(results.flatMap((r) => r.concepts).map((c) => [c.id, existing.get(c.id) ?? c])).values()];
  const failed = jobs.filter((j) => j.status === "failed");
  const pending = jobs.filter((j) => j.status === "pending").length;
  const processing = jobs.filter((j) => j.status === "processing").length;
  room.coverage = {
    pages: room.documents.reduce((n, d) => n + d.pageCount, 0),
    mappedPages: successes.length,
    figures: pages.reduce((n, p) => n + p.figures.length, 0),
    tables: pages.reduce((n, p) => n + p.tables.length, 0),
    concepts: room.concepts.length,
    flaggedPages: failed.map((j) => j.page),
    pendingPages: pending, processingPages: processing, failedPages: failed.length,
    failures: jobs.filter((j) => j.failure).map((j) => ({ page: j.page, ...(j.failure as Failure), attempts: j.attempts })),
  };
  room.status = pending || processing ? "processing" :
    successes.length === room.coverage.pages && room.coverage.pages > 0 && room.concepts.length > 0 ? "ready" : "needs-attention";
  room.updatedAt = new Date().toISOString();
  await tx.update(tutorClassrooms).set({ data: room, sourceMap: pages }).where(eq(tutorClassrooms.id, classroomId));
  return room;
}

export async function retryFailedPages(classroomId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, classroomId)).for("update");
    if (!row) return;
    await tx.update(tutorPageJobs).set({ status: "pending", attempts: 0, failure: null, nextAttemptAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tutorPageJobs.classroomId, classroomId), eq(tutorPageJobs.status, "failed")));
    return project(tx, classroomId);
  });
}

export function cancelClassroomAnalysis(classroomId: string) {
  active.get(classroomId)?.abort();
}

function failureReason(error: unknown): Failure {
  if (isRateLimitError(error) || (typeof error === "object" && error !== null && "status" in error && error.status === 429))
    return { code: "analysis_rate_limited", message: "The analysis service is busy. Saved pages are safe; retrying after a cooling-off period." };
  if (error instanceof PageAnalysisError) return { code: error.code, message: error.message };
  if (error instanceof Error && error.name === "ObjectNotFoundError")
    return { code: "source_pdf_missing", message: "The original PDF is no longer available. Upload it in a new classroom." };
  if (error instanceof Error && (error.name === "ZodError" || error instanceof SyntaxError))
    return { code: "invalid_model_output", message: "The page analysis returned an unreadable result." };
  // Do not expose SDK errors (which may contain private paths or request data).
  return { code: "page_analysis_failed", message: "The PDF page could not be read or the analysis service was unavailable." };
}

const classroomExists = async (id: string) => (await db.select({ id: tutorClassrooms.id }).from(tutorClassrooms).where(eq(tutorClassrooms.id, id))).length > 0;

export type PageProcessor = (job: TutorPageJob, room: Room, signal: AbortSignal, canContinue: () => Promise<boolean>) => Promise<PageResult>;
const processPage: PageProcessor = async (job, room, signal, canContinue) => {
  const document = room.documents.find((d) => d.id === job.documentId);
  if (!document) throw new PageAnalysisError("missing_document", "The page's source document is missing.");
  const file = await storage.getObjectEntityFile(document.objectPath);
  const [bytes] = await file.download();
  signal.throwIfAborted();
  return mapPdfPage(bytes, job.documentId, job.localPage, job.page, signal, canContinue);
};

// Export a single drain pass for deterministic integration tests; normal startup
// calls it periodically. All mutations remain database-backed even in tests.
export async function runIngestionPass(processor: PageProcessor = processPage, onlyClassroomId?: string) {
  if (running) return;
  running = true;
  const client = await pool.connect().catch((err) => { running = false; throw err; });
  let locked = false;
  let sessionLost = false;
  const onConnectionError = () => {
    sessionLost = true;
    for (const controller of active.values()) controller.abort();
  };
  client.on("error", onConnectionError);
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock($1) AS acquired", [WORKER_LOCK]);
    locked = lock.rows[0].acquired;
    if (!locked) return;
    // Upgrade interrupted classrooms created by the former in-memory flow.
    const rooms = await db.select().from(tutorClassrooms).where(and(sql`${tutorClassrooms.data}->>'status' <> 'ready'`, onlyClassroomId ? eq(tutorClassrooms.id, onlyClassroomId) : undefined));
    for (const row of rooms) {
      await db.transaction(async (tx) => {
        const [current] = await tx.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, row.id)).for("update");
        if (!current) return;
        const jobs = pageJobs(current.data as Room, current.sourceMap as SourcePage[]);
        if (jobs.length) await tx.insert(tutorPageJobs).values(jobs).onConflictDoNothing();
      });
    }
    // Owning the session lock proves that no other worker is still processing.
    const interrupted = await db.select().from(tutorPageJobs).where(and(eq(tutorPageJobs.status, "processing"), onlyClassroomId ? eq(tutorPageJobs.classroomId, onlyClassroomId) : undefined));
    for (const job of interrupted) {
      await db.transaction(async (tx) => {
        const [room] = await tx.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, job.classroomId)).for("update");
        if (!room) return;
        await tx.update(tutorPageJobs).set({
          status: job.attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          failure: { code: "interrupted", message: "Analysis was interrupted by a server restart." },
          nextAttemptAt: new Date(), updatedAt: new Date(),
        }).where(eq(tutorPageJobs.id, job.id));
        await project(tx, job.classroomId);
      });
    }
    const jobs = await db.select().from(tutorPageJobs).where(and(eq(tutorPageJobs.status, "pending"), lte(tutorPageJobs.nextAttemptAt, new Date()), onlyClassroomId ? eq(tutorPageJobs.classroomId, onlyClassroomId) : undefined)).orderBy(asc(tutorPageJobs.page));
    for (const candidate of jobs) {
      if (sessionLost) throw new Error("PDF worker lost its database session lock.");
      const claimed = await db.transaction(async (tx) => {
        const [row] = await tx.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, candidate.classroomId)).for("update");
        if (!row) return;
        const [job] = await tx.update(tutorPageJobs).set({
          status: "processing", attempts: sql`${tutorPageJobs.attempts} + 1`,
          totalAttempts: sql`${tutorPageJobs.totalAttempts} + 1`, updatedAt: new Date(),
        }).where(and(eq(tutorPageJobs.id, candidate.id), eq(tutorPageJobs.status, "pending"))).returning();
        if (!job) return;
        await project(tx, job.classroomId);
        return { job, room: row.data as Room };
      });
      if (!claimed) continue;
      const { job, room } = claimed;
      const controller = new AbortController();
      active.set(room.id, controller);
      // Poll deletion from other server instances as well as aborting locally.
      const deletionCheck = setInterval(() => {
        void classroomExists(room.id).then((exists) => { if (!exists) controller.abort(); }).catch(() => controller.abort());
      }, 1000);
      const timeout = setTimeout(() => controller.abort(new PageAnalysisError("analysis_timeout", "Page analysis exceeded the time limit.")), 300000);
      try {
        if (sessionLost) controller.abort();
        controller.signal.throwIfAborted();
        if (!await classroomExists(room.id)) continue;
        const result = await processor(job, room, controller.signal, async () => !sessionLost && await classroomExists(room.id));
        controller.signal.throwIfAborted();
        await db.transaction(async (tx) => {
          const [current] = await tx.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, room.id)).for("update");
          if (!current) return;
          const saved = await tx.update(tutorPageJobs).set({ status: "succeeded", result, failure: null, updatedAt: new Date() })
            .where(and(eq(tutorPageJobs.id, job.id), eq(tutorPageJobs.status, "processing"), eq(tutorPageJobs.totalAttempts, job.totalAttempts))).returning({ id: tutorPageJobs.id });
          if (saved.length) await project(tx, room.id);
        });
      } catch (err) {
        // Another worker may already own this job after a lost session lock.
        // Leave it processing for that worker's recovery pass instead of
        // overwriting its newer state or publishing this worker's result.
        if (sessionLost) throw err;
        if (!await classroomExists(room.id)) continue;
        logger.warn({ err, classroomId: room.id, page: job.page, attempt: job.attempts }, "PDF page analysis failed");
        const failure = failureReason(controller.signal.reason instanceof PageAnalysisError ? controller.signal.reason : err);
        const rateLimited = failure.code === "analysis_rate_limited";
        const retryAt = new Date(Date.now() + (rateLimited ? Math.min(300000, 60000 * 2 ** (job.attempts - 1)) : job.attempts * 5000));
        await db.transaction(async (tx) => {
          const [current] = await tx.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, room.id)).for("update");
          if (!current) return;
          const saved = await tx.update(tutorPageJobs).set({
            status: job.attempts >= MAX_ATTEMPTS ? "failed" : "pending",
            failure, nextAttemptAt: retryAt, updatedAt: new Date(),
          }).where(and(eq(tutorPageJobs.id, job.id), eq(tutorPageJobs.status, "processing"), eq(tutorPageJobs.totalAttempts, job.totalAttempts))).returning({ id: tutorPageJobs.id });
          if (saved.length) await project(tx, room.id);
          if (saved.length && rateLimited) {
            // Persist a queue-wide cooldown, so a restart or the next page does
            // not immediately hit the same provider limit again.
            await tx.update(tutorPageJobs).set({ nextAttemptAt: sql`greatest(${tutorPageJobs.nextAttemptAt}, ${retryAt})` })
              .where(and(eq(tutorPageJobs.status, "pending"), onlyClassroomId ? eq(tutorPageJobs.classroomId, onlyClassroomId) : undefined));
          }
        });
        if (rateLimited) break;
      } finally {
        clearInterval(deletionCheck);
        clearTimeout(timeout);
        active.delete(room.id);
      }
    }
    // Covers legacy rooms with no outstanding jobs, including empty coverage.
    for (const row of rooms) await db.transaction((tx) => project(tx, row.id));
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1)", [WORKER_LOCK]).catch(() => undefined);
    client.removeListener("error", onConnectionError);
    client.release();
    running = false;
  }
}

export function startIngestionWorker() {
  const tick = () => { void runIngestionPass().catch((err) => logger.error({ err }, "PDF ingestion worker failed; will retry")); };
  tick();
  const timer = setInterval(tick, 2000);
  timer.unref();
}
