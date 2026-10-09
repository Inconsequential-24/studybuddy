import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, eq, desc } from "drizzle-orm";
import { db, tutorProfiles, tutorClassrooms, tutorUploads, tutorAttempts, tutorExams, tutorPageJobs } from "@workspace/db";
import { UpdateProfileBody, CreateClassroomBody, AskClassroomQuestionBody, SubmitExplainBackBody, SubmitPracticeAttemptBody, StartExamBody, SubmitExamAnswerBody, RequestUploadUrlBody, GetLessonResponse, SubmitDiagnosticBody } from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { isLocalStorage, LocalUploadError, MAX_UPLOAD_BYTES, writeLocalUpload } from "../lib/localObjectStorage";
import { ask, lesson, grade, practice, mapPdf, loadPdf, verifiedPageConcepts, validateReferences } from "../lib/tutor-ai";
import { batchProcess } from "@workspace/integrations-gemini-ai/batch";
import type { Profile, Room, SourcePage, Question } from "../lib/tutor-types";
import { cancelClassroomAnalysis, pageJobs, retryFailedPages } from "../lib/tutor-ingestion";
import { isLocalAuth, LOCAL_USER_ID } from "../lib/localAuth";

const router = Router();
const storage = new ObjectStorageService();
const practiceFlights = new Map<string, Promise<Question[]>>();
const user = (res: Response) => res.locals.userId as string;
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
router.use((req, res, next) => {
  const id = isLocalAuth() ? LOCAL_USER_ID : getAuth(req).userId;
  if (!id) { res.status(401).json({ error: "Sign in to access your classrooms." }); return; }
  res.locals.userId = id;
  next();
});
async function profile(id: string): Promise<Profile> {
  const [row] = await db.select().from(tutorProfiles).where(eq(tutorProfiles.id, id));
  return row ? { ...(row.data as Profile), id } : { id, gradeLevel: "", goal: "", explanationStyle: "step-by-step", pace: "steady", sessionMinutes: 15, vocabularySupport: false, accessibilityNeeds: "", confidence: "starting-out", interests: "", completed: false };
}
async function getClassroomSources(userId: string, id: string) {
  const [row] = await db.select().from(tutorClassrooms).where(and(eq(tutorClassrooms.id, id), eq(tutorClassrooms.ownerId, userId)));
  if (!row) throw new HttpError(404, "Classroom not found.");
  return { room: row.data as Room, pages: row.sourceMap as SourcePage[] };
}
async function saveRoom(room: Room, pages?: SourcePage[]) {
  room.updatedAt = new Date().toISOString();
  await db.update(tutorClassrooms).set({ data: room, ...(pages ? { sourceMap: pages } : {}) }).where(eq(tutorClassrooms.id, room.id));
}
async function attempts(id: string) {
  const rows = await db.select().from(tutorAttempts).where(eq(tutorAttempts.classroomId, id)).orderBy(desc(tutorAttempts.createdAt));
  return rows.map((row) => ({ ...(row.data as { conceptId: string; activity: string; score: number; question: string; wasReview?: boolean }), id: row.id, createdAt: row.createdAt.toISOString() }));
}
function reviewedRoom(room: Room, history: Awaited<ReturnType<typeof attempts>>) {
  room.concepts = room.concepts.map((concept) => {
    const entries = history.filter((a) => a.conceptId === concept.id);
    const latest = entries[0];
    const days = entries.length <= 1 ? 1 : entries.length === 2 ? 3 : 7;
    return { ...concept, reviewDue: !!latest && Date.now() >= new Date(latest.createdAt).getTime() + days * 86400000 };
  });
  return room;
}
function ready(room: Room) {
  if (room.status !== "ready") throw new HttpError(409, room.status === "processing" ? "Your documents are still being read. Please try again shortly." : "Some pages could not be verified. This classroom needs attention before tutoring.");
}
const classroomId = (req: Request) => String(req.params.classroomId);

router.get("/profile", async (_req, res) => { res.json(await profile(user(res))); });
router.put("/profile", async (req, res) => {
  const data = { ...UpdateProfileBody.parse(req.body), id: user(res), completed: true };
  await db.insert(tutorProfiles).values({ id: user(res), data }).onConflictDoUpdate({ target: tutorProfiles.id, set: { data } });
  // Rebuild personalized lessons when preferences change, while retaining concepts and objectives.
  const rows = await db.select().from(tutorClassrooms).where(eq(tutorClassrooms.ownerId, user(res)));
  for (const row of rows) { const room = row.data as Room; room.lessons = {}; await saveRoom(room); }
  res.json(data);
});
router.get("/classrooms", async (_req, res) => {
  const rows = await db.select().from(tutorClassrooms).where(eq(tutorClassrooms.ownerId, user(res)));
  const values = await Promise.all(rows.map(async (row) => {
    const room = reviewedRoom(row.data as Room, await attempts(row.id));
    return { id: room.id, name: room.name, subject: room.subject, status: room.status, pageCount: room.coverage.pages, figureCount: room.coverage.figures, tableCount: room.coverage.tables, conceptCount: room.concepts.length, coveragePercent: room.coverage.pages ? Math.round(100 * room.coverage.mappedPages / room.coverage.pages) : 0, reviewDueCount: room.concepts.filter((c) => c.reviewDue).length, updatedAt: room.updatedAt };
  }));
  res.json(values);
});
router.post("/classrooms", async (req, res) => {
  if (!(await profile(user(res))).completed) throw new HttpError(409, "Complete your learning preferences first.");
  const input = CreateClassroomBody.parse(req.body);
  if (new Set(input.documents.map((d) => d.objectPath)).size !== input.documents.length) throw new HttpError(400, "Choose each uploaded PDF only once.");
  const documents: Room["documents"] = [];
  for (const document of input.documents) {
    const [upload] = await db.select().from(tutorUploads).where(and(eq(tutorUploads.path, document.objectPath), eq(tutorUploads.ownerId, user(res))));
    if (!upload) throw new HttpError(400, "This upload is not owned by your account.");
    const file = await storage.getObjectEntityFile(document.objectPath);
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) > 26214400) throw new HttpError(400, "Each PDF must be 25 MB or smaller.");
    const [bytes] = await file.download();
    if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new HttpError(400, "Upload a valid PDF file.");
    const pdf = await loadPdf(bytes).catch(() => { throw new HttpError(400, "This PDF could not be read. Remove password protection or re-export it, then upload again."); });
    if (pdf.numPages > 100) { await pdf.cleanup(); throw new HttpError(400, "Each PDF must have 100 pages or fewer."); }
    documents.push({ id: randomUUID(), name: document.name, objectPath: document.objectPath, pageCount: pdf.numPages });
    await pdf.cleanup();
    await storage.trySetObjectEntityAclPolicy(document.objectPath, { owner: user(res), visibility: "private" });
  }
  const room: Room = { id: randomUUID(), name: input.name, subject: input.subject ?? "", documents, concepts: [], status: "processing", coverage: { pages: documents.reduce((sum, d) => sum + d.pageCount, 0), mappedPages: 0, figures: 0, tables: 0, concepts: 0, flaggedPages: [] }, updatedAt: new Date().toISOString() };
  await db.transaction(async (tx) => {
    for (const document of [...documents].sort((a, b) => a.objectPath.localeCompare(b.objectPath))) {
      const [upload] = await tx.select().from(tutorUploads).where(and(eq(tutorUploads.path, document.objectPath), eq(tutorUploads.ownerId, user(res)))).for("update");
      if (!upload || (upload.data as Record<string, unknown>).usedBy) throw new HttpError(409, "This PDF upload is already used. Upload a fresh copy for another classroom.");
      await tx.update(tutorUploads).set({ data: { ...(upload.data as Record<string, unknown>), usedBy: room.id } }).where(eq(tutorUploads.path, document.objectPath));
    }
    await tx.insert(tutorClassrooms).values({ id: room.id, ownerId: user(res), data: room, sourceMap: [] });
    await tx.insert(tutorPageJobs).values(pageJobs(room));
  });
  res.status(201).json(room);
});
router.post("/classrooms/:classroomId/retry-failed-pages", async (req, res) => {
  const id = classroomId(req);
  await getClassroomSources(user(res), id);
  if (!await retryFailedPages(id)) throw new HttpError(409, "There are no failed pages to retry.");
  const { room, pages } = await getClassroomSources(user(res), id);
  res.json({ ...room, sourcePages: pages });
});
router.get("/classrooms/:classroomId", async (req, res) => {
  const { room, pages } = await getClassroomSources(user(res), classroomId(req));
  res.json({ ...reviewedRoom(room, await attempts(room.id)), sourcePages: pages });
});
router.post("/classrooms/:classroomId/verify-pages", async (req, res) => {
  const { room, pages } = await getClassroomSources(user(res), classroomId(req));
  if (room.status === "ready") { res.json({ ...room, sourcePages: pages }); return; }
  if (room.status === "processing" || pages.length !== room.coverage.pages) throw new HttpError(409, "These PDFs have not finished being read. This verification retry is for already-read pages.");
  const targets = room.coverage.flaggedPages.slice(0, 3);
  if (!targets.length) throw new HttpError(422, "There is no captured flagged page to verify.");
  const repairs = await batchProcess(targets, async (page) => {
    const source = pages.find((p) => p.page === page);
    if (!source) throw new HttpError(422, "Source evidence for this page is missing.");
    const concepts = await verifiedPageConcepts(source);
    if (!concepts.length || !concepts.every((c) => validateReferences(c.refs, [source])) || ![...source.figures, ...source.tables].every((v) => concepts.some((c) => c.refs.some((ref) => ref.sourceId === v.id)))) throw new HttpError(422, "This page still needs clearer source evidence.");
    return { page, concepts };
  }, { concurrency: 3, retries: 0 });
  const updated = await db.transaction(async (tx) => {
    const [latest] = await tx.select().from(tutorClassrooms).where(and(eq(tutorClassrooms.id, room.id), eq(tutorClassrooms.ownerId, user(res)))).for("update");
    if (!latest) throw new HttpError(404, "Classroom not found.");
    const state = latest.data as Room;
    if (state.status === "ready") return state;
    if (state.status === "processing") throw new HttpError(409, "PDF analysis is already running.");
    if (JSON.stringify(latest.sourceMap) !== JSON.stringify(pages)) throw new HttpError(409, "Source evidence changed; refresh before verifying again.");
    for (const repair of repairs) {
      const titles = new Set(state.concepts.filter((c) => c.pageRefs.includes(repair.page)).map((c) => c.title.toLowerCase().trim()));
      for (const concept of repair.concepts) if (!titles.has(concept.title.toLowerCase().trim())) {
        state.concepts.push(concept);
        titles.add(concept.title.toLowerCase().trim());
      }
      state.coverage.flaggedPages = state.coverage.flaggedPages.filter((p) => p !== repair.page);
    }
    state.concepts.sort((a, b) => a.pageRefs[0]! - b.pageRefs[0]!);
    state.coverage.concepts = state.concepts.length;
    state.status = state.coverage.flaggedPages.length ? "needs-attention" : "ready";
    state.updatedAt = new Date().toISOString();
    await tx.update(tutorClassrooms).set({ data: state }).where(eq(tutorClassrooms.id, state.id));
    return state;
  });
  res.json({ ...updated, sourcePages: pages });
});
router.delete("/classrooms/:classroomId", async (req, res) => {
  const { room } = await getClassroomSources(user(res), classroomId(req));
  await db.delete(tutorClassrooms).where(eq(tutorClassrooms.id, room.id));
  cancelClassroomAnalysis(room.id);
  for (const document of room.documents) {
    try {
      const file = await storage.getObjectEntityFile(document.objectPath);
      await file.delete({ ignoreNotFound: true });
    } catch (err) { if (!(err instanceof ObjectNotFoundError)) { req.log.error({ err }, "PDF cleanup failed"); continue; } }
    await db.delete(tutorUploads).where(eq(tutorUploads.path, document.objectPath));
  }
  res.json({ success: true });
});
router.get("/classrooms/:classroomId/plan", async (req, res) => {
  const { room } = await getClassroomSources(user(res), classroomId(req));
  ready(room);
  const preferences = await profile(user(res));
  const multiplier = preferences.pace === "gentle" ? 1.5 : preferences.pace === "fast" ? 0.75 : 1;
  const concepts = room.concepts.map((c) => ({ ...c, estimatedMinutes: Math.round(c.estimatedMinutes * multiplier) }));
  res.json({ classroomId: room.id, estimatedMinutes: concepts.reduce((sum, c) => sum + c.estimatedMinutes, 0), concepts });
});
router.get("/classrooms/:classroomId/dashboard", async (req, res) => {
  const { room: rawRoom } = await getClassroomSources(user(res), classroomId(req));
  const history = await attempts(rawRoom.id);
  const room = reviewedRoom(rawRoom, history);
  const groups: Record<string, string[]> = { Recognition: ["quick-quiz", "figure-labels"], Recall: ["free-recall"], Explanation: ["explain-back"], Connections: ["connections"], Application: ["apply-it", "exam"], Retention: ["review"] };
  const dimensions = Object.entries(groups).map(([name, activities]) => {
    const relevant = history.filter((a) => activities.includes(String(a.activity)) || (name === "Retention" && a.wasReview === true));
    return { name, score: relevant.length ? Math.round(relevant.reduce((sum, a) => sum + Number(a.score), 0) / relevant.length) : 0 };
  });
  res.json({ dimensions, concepts: room.concepts, reviewDue: room.concepts.filter((c) => c.reviewDue), recentAttempts: history.slice(0, 8).map((a) => ({ activity: String(a.activity), concept: room.concepts.find((c) => c.id === a.conceptId)?.title ?? "Concept", score: Number(a.score), createdAt: a.createdAt })), recommendation: history.length ? "Review weaker concepts, then take the exam when you feel ready." : "Begin with Teaching, then use Practice Arena to check your understanding." });
});
router.post("/classrooms/:classroomId/questions", async (req, res) => {
  const { room, pages } = await getClassroomSources(user(res), classroomId(req));
  ready(room);
  const input = AskClassroomQuestionBody.parse(req.body);
  res.json(await ask(pages, input.question, await profile(user(res))));
});
router.get("/classrooms/:classroomId/lessons/:conceptId", async (req, res) => {
  const { room, pages } = await getClassroomSources(user(res), classroomId(req));
  ready(room);
  const concept = room.concepts.find((c) => c.id === req.params.conceptId);
  if (!concept) throw new HttpError(404, "Concept not found.");
  const cached = room.lessons?.[concept.id];
  if (cached) { res.json(cached); return; }
  const data = GetLessonResponse.parse({ concept, ...await lesson(pages, concept, await profile(user(res))) });
  room.lessons = { ...room.lessons, [concept.id]: data };
  await saveRoom(room);
  res.json(data);
});
router.post("/classrooms/:classroomId/lessons/:conceptId/diagnostic", async (req, res) => {
  const { room, pages } = await getClassroomSources(user(res), classroomId(req));
  ready(room);
  const concept = room.concepts.find((c) => c.id === req.params.conceptId);
  if (!concept) throw new HttpError(404, "Concept not found.");
  const input = SubmitDiagnosticBody.parse(req.body);
  const cached = GetLessonResponse.parse(room.lessons?.[concept.id]);
  if (input.responses.length !== cached.diagnosticQuestions.length) throw new HttpError(400, "Answer each diagnostic question, or write ‘not sure’.");
  const preferences = await profile(user(res));
  const diagnosticData = cached.diagnosticQuestions.map((q, i) => `${q}\nStudent: ${input.responses[i]}`).join("\n");
  const baseline = await grade(pages, cached.diagnosticQuestions.join("\n"), input.responses.join("\n"), preferences);
  const data = GetLessonResponse.parse({ concept, ...await lesson(pages, concept, preferences, diagnosticData + "\nFeedback: " + baseline.feedback) });
  room.lessons = { ...room.lessons, [concept.id]: data };
  await db.insert(tutorAttempts).values({ id: randomUUID(), classroomId: room.id, data: { conceptId: concept.id, activity: "diagnostic", question: cached.diagnosticQuestions.join("\n"), response: input.responses.join("\n"), score: baseline.score, hintsUsed: 0, assisted: false } });
  await saveRoom(room);
  res.json(data);
});
router.post("/classrooms/:classroomId/lessons/:conceptId/explain-back", async (req, res) => {
  const { room, pages } = await getClassroomSources(user(res), classroomId(req));
  ready(room);
  const concept = room.concepts.find((c) => c.id === req.params.conceptId);
  if (!concept) throw new HttpError(404, "Concept not found.");
  const input = SubmitExplainBackBody.parse(req.body);
  const result = await grade(pages, `Explain ${concept.title}: ${concept.summary}`, input.response, await profile(user(res)));
  const reExplanation = result.score < 80 ? (await lesson(pages, concept, await profile(user(res)), "Re-explain simply, focusing on these gaps: " + result.missingPoints.join("; ") + "; student's response: " + input.response)).explanation : undefined;
  concept.mastery = result.score;
  await db.insert(tutorAttempts).values({ id: randomUUID(), classroomId: room.id, data: { conceptId: concept.id, activity: "explain-back", question: concept.title, response: input.response, score: result.score, hintsUsed: 0, assisted: false } });
  await saveRoom(room);
  res.json({ ...result, reExplanation, nextAction: result.score >= 80 ? "continue" : result.score >= 50 ? "re-explain" : "revisit" });
});
router.get("/classrooms/:classroomId/practice", async (req, res) => {
  const { room, pages } = await getClassroomSources(user(res), classroomId(req));
  ready(room);
  let questions = room.practiceQuestions;
  if (!questions) {
    let flight = practiceFlights.get(room.id);
    if (!flight) {
      flight = (async () => {
        const generated = await practice(pages, room.concepts, await profile(user(res)));
        return db.transaction(async (tx) => {
          const [latest] = await tx.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, room.id)).for("update");
          if (!latest) throw new HttpError(404, "Classroom not found.");
          const state = latest.data as Room;
          if (state.practiceQuestions) return state.practiceQuestions;
          state.practiceQuestions = generated;
          state.updatedAt = new Date().toISOString();
          await tx.update(tutorClassrooms).set({ data: state }).where(eq(tutorClassrooms.id, room.id));
          return generated;
        });
      })().finally(() => { practiceFlights.delete(room.id); });
      practiceFlights.set(room.id, flight);
    }
    questions = await flight;
  }
  res.json({ activities: ["free-recall", "quick-quiz", ...(questions.some((q) => q.type === "figure-labels") ? ["figure-labels"] : []), "apply-it"], questions });
});
router.post("/classrooms/:classroomId/attempts", async (req, res) => {
  const { room: rawRoom, pages } = await getClassroomSources(user(res), classroomId(req));
  ready(rawRoom);
  const input = SubmitPracticeAttemptBody.parse(req.body);
  const room = reviewedRoom(rawRoom, await attempts(rawRoom.id));
  const question = room.practiceQuestions?.find((q) => q.id === input.questionId && q.conceptId === input.conceptId);
  if (!question) throw new HttpError(400, "This question does not belong to this classroom.");
  const result = await grade(pages, question.prompt, input.response, await profile(user(res)));
  const concept = room.concepts.find((c) => c.id === question.conceptId)!;
  const id = randomUUID();
  await db.insert(tutorAttempts).values({ id, classroomId: room.id, data: { ...input, question: question.prompt, score: result.score, wasReview: concept.reviewDue, activity: question.type === "short-answer" ? "connections" : input.activity } });
  concept.mastery = Math.round((concept.mastery + result.score) / 2);
  concept.reviewDue = false;
  await saveRoom(room);
  res.status(201).json({ ...result, attemptId: id });
});

type ExamState = { id: string; currentQuestion: Question; questionNumber: number; totalQuestions: number; complete: boolean; seen: string[]; scores: { conceptId: string; score: number }[]; difficulty: number };
router.post("/classrooms/:classroomId/exam/start", async (req, res) => {
  const { room, pages } = await getClassroomSources(user(res), classroomId(req));
  ready(room); StartExamBody.parse(req.body);
  const existing = await db.select().from(tutorExams).where(eq(tutorExams.classroomId, room.id));
  const incomplete = existing.map((e) => e.data as ExamState).find((e) => !e.complete);
  if (incomplete) { res.status(201).json(incomplete); return; }
  const seen = [...(room.practiceQuestions ?? []).map((q) => q.prompt), ...(await attempts(room.id)).map((a) => String(a.question))];
  const [question] = await practice(pages, room.concepts, await profile(user(res)), true, 1, seen);
  const data: ExamState = { id: randomUUID(), currentQuestion: question!, questionNumber: 1, totalQuestions: 10, complete: false, seen: [...seen, question!.prompt], scores: [], difficulty: 1 };
  await db.insert(tutorExams).values({ id: data.id, classroomId: room.id, data });
  res.status(201).json(data);
});
router.post("/classrooms/:classroomId/exam/:examId/answers", async (req, res) => {
  const { room, pages } = await getClassroomSources(user(res), classroomId(req));
  ready(room);
  const [row] = await db.select().from(tutorExams).where(and(eq(tutorExams.id, String(req.params.examId)), eq(tutorExams.classroomId, room.id)));
  if (!row) throw new HttpError(404, "Exam not found.");
  const state = row.data as ExamState;
  const input = SubmitExamAnswerBody.parse(req.body);
  if (state.complete || input.questionId !== state.currentQuestion.id) throw new HttpError(409, "This question is no longer active.");
  const answeredQuestion = state.currentQuestion;
  const result = await grade(pages, answeredQuestion.prompt, input.response, await profile(user(res)));
  state.scores.push({ conceptId: state.currentQuestion.conceptId, score: result.score });
  const concept = room.concepts.find((c) => c.id === state.currentQuestion.conceptId)!;
  concept.mastery = Math.round((concept.mastery + result.score) / 2);
  state.difficulty = Math.max(1, Math.min(3, state.difficulty + (result.score >= 75 ? 1 : -1)));
  state.complete = state.questionNumber >= state.totalQuestions;
  if (!state.complete) {
    const [next] = await practice(pages, [...room.concepts].sort((a, b) => a.mastery - b.mastery), await profile(user(res)), true, state.difficulty, state.seen);
    if (state.seen.includes(next!.prompt)) throw new HttpError(502, "A fresh exam question could not be generated. Please retry.");
    state.currentQuestion = next!;
    state.seen.push(next!.prompt);
    state.questionNumber++;
  }
  await db.transaction(async (tx) => {
    const [latest] = await tx.select().from(tutorExams).where(eq(tutorExams.id, state.id)).for("update");
    if (!latest || (latest.data as ExamState).currentQuestion.id !== answeredQuestion.id || (latest.data as ExamState).complete) throw new HttpError(409, "This answer was already submitted.");
    await tx.insert(tutorAttempts).values({ id: randomUUID(), classroomId: room.id, data: { conceptId: concept.id, activity: "exam", question: answeredQuestion.prompt, response: input.response, score: result.score, hintsUsed: 0, assisted: false } });
    await tx.update(tutorExams).set({ data: state }).where(eq(tutorExams.id, state.id));
    room.updatedAt = new Date().toISOString();
    await tx.update(tutorClassrooms).set({ data: room }).where(eq(tutorClassrooms.id, room.id));
  });
  res.json({ feedback: result.feedback, score: result.score, nextQuestion: state.currentQuestion, complete: state.complete, results: state.complete ? room.concepts : [] });
});
router.post("/storage/uploads/request-url", async (req, res) => {
  const input = RequestUploadUrlBody.parse(req.body);
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  await db.insert(tutorUploads).values({ path: objectPath, ownerId: user(res), data: input });
  res.json({ uploadURL, objectPath });
});
router.put("/storage/uploads/local/:id", async (req, res) => {
  if (!isLocalStorage()) throw new HttpError(404, "Not found.");
  const objectPath = `/objects/uploads/${req.params.id}`;
  const [upload] = await db.select().from(tutorUploads).where(and(eq(tutorUploads.path, objectPath), eq(tutorUploads.ownerId, user(res))));
  if (!upload) throw new HttpError(404, "Upload not found.");
  if (Number(req.headers["content-length"]) > MAX_UPLOAD_BYTES) throw new HttpError(413, "Each PDF must be 25 MB or smaller.");
  try {
    await writeLocalUpload(`uploads/${req.params.id}`, req);
  } catch (err) {
    if (err instanceof LocalUploadError) throw new HttpError(err.status, err.message);
    throw err;
  }
  res.json({ success: true });
});
router.get("/storage/objects/*path", async (req, res) => {
  const raw = req.params.path;
  const objectPath = "/objects/" + (Array.isArray(raw) ? raw.join("/") : String(raw));
  const [upload] = await db.select().from(tutorUploads).where(and(eq(tutorUploads.path, objectPath), eq(tutorUploads.ownerId, user(res))));
  if (!upload) throw new HttpError(404, "Document not found.");
  const file = await storage.getObjectEntityFile(objectPath);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "private, no-store");
  file.createReadStream().on("error", () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); }).pipe(res);
});
export default router;
