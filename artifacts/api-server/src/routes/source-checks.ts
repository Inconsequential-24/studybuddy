import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { isLocalAuth, LOCAL_USER_ID } from "../lib/localAuth";
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, lt, or } from "drizzle-orm";
import {
  db,
  tutorClassrooms,
  tutorPageJobs,
  tutorSourceChecks,
} from "@workspace/db";
import {
  DeleteSourceCheckParams,
  DeleteSourceCheckResponse,
  GetSourceCheckParams,
  GetSourceCheckResponse,
  RequestSourceCheckUploadBody,
  RequestSourceCheckUploadResponse,
  StartSourceCheckParams,
  StartSourceCheckResponse,
  ListSourceChecksResponse,
  ListPdfActivityResponse,
} from "@workspace/api-zod";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import { SourceCheckError, checkPdfSource, type SourceCheckStage } from "../lib/source-check-ai";
import type { Room } from "../lib/tutor-types";

const router = Router();
const storage = new ObjectStorageService();
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const RESULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_CHECKS = 2;
const MAX_QUEUED_CHECKS = 10;
const active = new Map<string, AbortController>();
let pumping = false;
let pumpAgain = false;

const user = (res: Response) => res.locals.sourceCheckUserId as string;
const checkId = (req: Request) => String(req.params.checkId);

router.use("/source-checks", (req, res, next) => {
  const id = isLocalAuth() ? LOCAL_USER_ID : getAuth(req).userId;
  if (!id) { res.status(401).json({ error: "Sign in to check a PDF source." }); return; }
  res.locals.sourceCheckUserId = id;
  next();
});

router.use("/pdf-activity", (req, res, next) => {
  const id = isLocalAuth() ? LOCAL_USER_ID : getAuth(req).userId;
  if (!id) { res.status(401).json({ error: "Sign in to view your PDF activity." }); return; }
  res.locals.sourceCheckUserId = id;
  next();
});

router.get("/pdf-activity", async (_req, res): Promise<void> => {
  const ownerId = user(res);
  const now = new Date();
  const [checks, classrooms] = await Promise.all([
    db.select({
      id: tutorSourceChecks.id,
      fileName: tutorSourceChecks.fileName,
      mode: tutorSourceChecks.mode,
      status: tutorSourceChecks.status,
      stage: tutorSourceChecks.stage,
      failure: tutorSourceChecks.failure,
      createdAt: tutorSourceChecks.createdAt,
      expiresAt: tutorSourceChecks.expiresAt,
    }).from(tutorSourceChecks)
      .where(and(eq(tutorSourceChecks.ownerId, ownerId), gt(tutorSourceChecks.expiresAt, now))),
    db.select({
      id: tutorClassrooms.id,
      data: tutorClassrooms.data,
      createdAt: tutorClassrooms.createdAt,
    }).from(tutorClassrooms)
      .where(eq(tutorClassrooms.ownerId, ownerId)),
  ]);
  const classroomJobs = classrooms.length
    ? await db.select({
      classroomId: tutorPageJobs.classroomId,
      documentId: tutorPageJobs.documentId,
      stage: tutorPageJobs.stage,
    }).from(tutorPageJobs).where(and(
      eq(tutorPageJobs.status, "processing"),
      inArray(tutorPageJobs.classroomId, classrooms.map((classroom) => classroom.id)),
    ))
    : [];
  const activeStages = new Map<string, Set<string>>();
  for (const job of classroomJobs) {
    if (!job.stage) continue;
    const key = `${job.classroomId}:${job.documentId}`;
    const stages = activeStages.get(key) ?? new Set<string>();
    stages.add(job.stage);
    activeStages.set(key, stages);
  }

  const items = [
    ...checks.map((item) => ({
      kind: "source-check" as const,
      ...item,
    })),
    ...classrooms.flatMap((row) => {
      const room = row.data as Room;
      return room.documents.map((document) => ({
        kind: "classroom-pdf" as const,
        id: `${row.id}:${document.id}`,
        classroomId: row.id,
        classroomName: room.name,
        fileName: document.name,
        status: room.status,
        currentStages: [...(activeStages.get(`${row.id}:${document.id}`) ?? [])],
        createdAt: row.createdAt,
      }));
    }),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  res.json(ListPdfActivityResponse.parse({
    items,
    totalCount: items.length,
  }));
});

router.get("/source-checks", async (_req, res): Promise<void> => {
  const ownerId = user(res);
  const now = new Date();
  const [items, total] = await Promise.all([
    db.select({
      id: tutorSourceChecks.id,
      fileName: tutorSourceChecks.fileName,
      mode: tutorSourceChecks.mode,
      status: tutorSourceChecks.status,
      stage: tutorSourceChecks.stage,
      failure: tutorSourceChecks.failure,
      createdAt: tutorSourceChecks.createdAt,
      expiresAt: tutorSourceChecks.expiresAt,
    }).from(tutorSourceChecks)
      .where(and(eq(tutorSourceChecks.ownerId, ownerId), gt(tutorSourceChecks.expiresAt, now)))
      .orderBy(desc(tutorSourceChecks.createdAt))
      .limit(30),
    db.select({ value: count() }).from(tutorSourceChecks)
      .where(and(eq(tutorSourceChecks.ownerId, ownerId), gt(tutorSourceChecks.expiresAt, now))),
  ]);
  res.json(ListSourceChecksResponse.parse({ items, totalCount: Number(total[0]?.value ?? 0) }));
});

async function deleteObject(path: string | null | undefined, log?: Request["log"]): Promise<boolean> {
  if (!path) return true;
  try {
    const file = await storage.getObjectEntityFile(path);
    await file.delete({ ignoreNotFound: true });
    return true;
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return true;
    log?.warn({ err: error }, "Temporary source-check PDF cleanup failed");
    return false;
  }
}

function serialize(row: typeof tutorSourceChecks.$inferSelect) {
  return GetSourceCheckResponse.parse({
    id: row.id,
    mode: row.mode,
    status: row.status,
    stage: row.stage,
    report: row.report,
    failure: row.failure,
    expiresAt: row.expiresAt,
  });
}

async function processOne(row: typeof tutorSourceChecks.$inferSelect, controller: AbortController): Promise<void> {
  let report: Awaited<ReturnType<typeof checkPdfSource>> | null = null;
  let failure: string | null = null;
  const objectPath = row.objectPath;
  try {
    if (!objectPath) throw new SourceCheckError("The temporary PDF upload is missing.");
    await db.update(tutorSourceChecks).set({ stage: "validating-pdf" })
      .where(and(eq(tutorSourceChecks.id, row.id), eq(tutorSourceChecks.status, "processing")));
    const file = await storage.getObjectEntityFile(objectPath);
    await storage.trySetObjectEntityAclPolicy(objectPath, { owner: row.ownerId, visibility: "private" });
    const [metadata] = await file.getMetadata();
    const actualSize = Number(metadata.size);
    if (!Number.isSafeInteger(actualSize) || actualSize < 1 || actualSize > MAX_UPLOAD_BYTES || actualSize !== row.expectedSize) {
      throw new SourceCheckError("The uploaded PDF does not match the permitted size.");
    }
    if (metadata.contentType !== "application/pdf") throw new SourceCheckError("The upload must be a PDF file.");
    const [bytes] = await file.download();
    if (bytes.byteLength !== actualSize || !bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
      throw new SourceCheckError("The uploaded file is not a readable PDF.");
    }
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]);
    report = await checkPdfSource(bytes, row.mode as "skim" | "thorough", signal, async (stage: SourceCheckStage) => {
      await db.update(tutorSourceChecks).set({ stage })
        .where(and(eq(tutorSourceChecks.id, row.id), eq(tutorSourceChecks.status, "processing")));
    });
  } catch (error) {
    failure = error instanceof SourceCheckError
      ? error.message.slice(0, 500)
      : controller.signal.aborted
        ? "This review was cancelled."
        : "The source check could not be completed. Please try again.";
  } finally {
    const cleaned = await deleteObject(objectPath);
    try {
      await db.update(tutorSourceChecks).set({
        status: failure ? "failed" : "complete",
        stage: null,
        report,
        failure,
        objectPath: cleaned ? null : objectPath,
      }).where(and(eq(tutorSourceChecks.id, row.id), eq(tutorSourceChecks.status, "processing")));
    } catch {
      // Keep the objectPath on the row when possible so scheduled cleanup can retry.
    }
    active.delete(row.id);
    void pump();
  }
}

async function pump(): Promise<void> {
  if (pumping) { pumpAgain = true; return; }
  pumping = true;
  try {
    const queued = await db.select().from(tutorSourceChecks)
      .where(and(
        eq(tutorSourceChecks.status, "processing"),
        isNotNull(tutorSourceChecks.objectPath),
        gt(tutorSourceChecks.expiresAt, new Date()),
      ))
      .orderBy(asc(tutorSourceChecks.createdAt));
    for (const row of queued) {
      if (active.size >= MAX_ACTIVE_CHECKS) break;
      if (active.has(row.id)) continue;
      const controller = new AbortController();
      active.set(row.id, controller);
      void processOne(row, controller);
    }
  } catch (error) {
    logger.warn({ err: error }, "Source-check worker could not read its queue");
  } finally {
    pumping = false;
    if (pumpAgain) {
      pumpAgain = false;
      void pump();
    }
  }
}

export async function cleanupExpiredSourceChecks(): Promise<void> {
  const now = new Date();
  const expired = await db.select().from(tutorSourceChecks).where(lt(tutorSourceChecks.expiresAt, now));
  for (const row of expired) {
    active.get(row.id)?.abort();
    if (await deleteObject(row.objectPath)) await db.delete(tutorSourceChecks).where(eq(tutorSourceChecks.id, row.id));
  }
  const finished = await db.select().from(tutorSourceChecks).where(and(
    or(eq(tutorSourceChecks.status, "complete"), eq(tutorSourceChecks.status, "failed")),
    isNotNull(tutorSourceChecks.objectPath),
  ));
  for (const row of finished) {
    if (await deleteObject(row.objectPath)) {
      await db.update(tutorSourceChecks).set({ objectPath: null }).where(eq(tutorSourceChecks.id, row.id));
    }
  }
}

router.post("/source-checks/uploads", async (req, res): Promise<void> => {
  const input = RequestSourceCheckUploadBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Choose a PDF under 25 MB and a review mode." }); return; }
  const recent = await db.select({ id: tutorSourceChecks.id }).from(tutorSourceChecks).where(and(
    eq(tutorSourceChecks.ownerId, user(res)),
    or(eq(tutorSourceChecks.status, "uploading"), eq(tutorSourceChecks.status, "processing")),
  ));
  if (recent.length >= MAX_ACTIVE_CHECKS) {
    res.status(429).json({ error: "You already have two source checks in progress. Wait for one to finish." });
    return;
  }
  const id = randomUUID();
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  const row = {
    id,
    ownerId: user(res),
    fileName: input.data.name,
    expectedSize: input.data.size,
    objectPath,
    mode: input.data.mode,
    status: "uploading",
    expiresAt: new Date(Date.now() + RESULT_TTL_MS),
  };
  await db.insert(tutorSourceChecks).values(row);
  res.status(201).json(RequestSourceCheckUploadResponse.parse({ id, uploadURL, objectPath }));
});

router.post("/source-checks/:checkId/start", async (req, res): Promise<void> => {
  const params = StartSourceCheckParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid source check." }); return; }
  const [row] = await db.select().from(tutorSourceChecks).where(and(
    eq(tutorSourceChecks.id, params.data.checkId),
    eq(tutorSourceChecks.ownerId, user(res)),
  ));
  if (!row) { res.status(404).json({ error: "Source check not found." }); return; }
  if (row.expiresAt.getTime() <= Date.now()) { res.status(410).json({ error: "This source check has expired." }); return; }
  if (row.status === "uploading") {
    if (!row.objectPath) { res.status(409).json({ error: "The uploaded PDF is missing." }); return; }
    try {
      await storage.getObjectEntityFile(row.objectPath);
    } catch {
      res.status(409).json({ error: "Finish uploading the PDF before starting the check." });
      return;
    }
    const processing = await db.select({ id: tutorSourceChecks.id }).from(tutorSourceChecks)
      .where(and(
        eq(tutorSourceChecks.status, "processing"),
        gt(tutorSourceChecks.expiresAt, new Date()),
      ));
    if (processing.length >= MAX_QUEUED_CHECKS) {
      res.status(429).json({ error: "Source checks are busy right now. Please try starting this check again shortly." });
      return;
    }
    const [updated] = await db.update(tutorSourceChecks).set({ status: "processing" }).where(and(
      eq(tutorSourceChecks.id, row.id),
      eq(tutorSourceChecks.ownerId, user(res)),
      eq(tutorSourceChecks.status, "uploading"),
    )).returning();
    if (updated) void pump();
  }
  const [latest] = await db.select().from(tutorSourceChecks).where(and(
    eq(tutorSourceChecks.id, row.id),
    eq(tutorSourceChecks.ownerId, user(res)),
  ));
  if (!latest) { res.status(404).json({ error: "Source check not found." }); return; }
  res.status(202).json(serialize(latest));
});

router.get("/source-checks/:checkId", async (req, res): Promise<void> => {
  const params = GetSourceCheckParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid source check." }); return; }
  const [row] = await db.select().from(tutorSourceChecks).where(and(
    eq(tutorSourceChecks.id, params.data.checkId),
    eq(tutorSourceChecks.ownerId, user(res)),
  ));
  if (!row) { res.status(404).json({ error: "Source check not found." }); return; }
  if (row.expiresAt.getTime() <= Date.now()) { res.status(410).json({ error: "This source check has expired." }); return; }
  res.json(serialize(row));
});

router.delete("/source-checks/:checkId", async (req, res): Promise<void> => {
  const params = DeleteSourceCheckParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid source check." }); return; }
  const [row] = await db.select().from(tutorSourceChecks).where(and(
    eq(tutorSourceChecks.id, params.data.checkId),
    eq(tutorSourceChecks.ownerId, user(res)),
  ));
  if (!row) { res.status(404).json({ error: "Source check not found." }); return; }
  active.get(row.id)?.abort();
  if (!await deleteObject(row.objectPath, req.log)) {
    res.status(503).json({ error: "The temporary PDF could not be deleted yet. Please try again." });
    return;
  }
  await db.delete(tutorSourceChecks).where(and(
    eq(tutorSourceChecks.id, row.id),
    eq(tutorSourceChecks.ownerId, user(res)),
  ));
  res.json(DeleteSourceCheckResponse.parse({ success: true }));
});

export function resumeSourceChecks(): void {
  void pump();
}

export default router;
