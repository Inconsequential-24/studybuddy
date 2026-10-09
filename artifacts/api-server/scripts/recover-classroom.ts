import { db, tutorClassrooms } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "../src/lib/objectStorage";
import { mapPdf, validateReferences, type PageAnalysis } from "../src/lib/tutor-ai";
import type { Room, SourcePage } from "../src/lib/tutor-types";

// Maintenance recovery for existing, non-ready classrooms. Never changes original PDFs.
const id = process.argv[2];
if (!id) throw new Error("Provide a classroom ID.");
const storage = new ObjectStorageService();
const started = performance.now();
const [initial] = await db.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, id));
if (!initial) throw new Error("Classroom not found.");
const initialRoom = initial.data as Room;
if (initialRoom.status === "ready") throw new Error("Recovery is restricted to non-ready classrooms.");
const existingPages = initial.sourceMap as SourcePage[];
const flagged = new Set(initialRoom.coverage.flaggedPages);

async function commitPage(result: PageAnalysis) {
  await db.transaction(async (tx) => {
    const [latest] = await tx.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, id)).for("update");
    if (!latest) throw new Error("Classroom deleted during recovery.");
    const room = latest.data as Room;
    let sources = latest.sourceMap as SourcePage[];
    if (result.source && !result.issues.length) {
      const source = result.source;
      sources = [...sources.filter((p) => p.page !== result.page), source].sort((a, b) => a.page - b.page);
      // Keep existing valid concept identities, so bookmarked lesson URLs remain valid.
      room.concepts = room.concepts.filter((c) => !c.pageRefs.includes(result.page) || validateReferences(c.refs, sources));
      const titles = new Set(room.concepts.filter((c) => c.pageRefs.includes(result.page)).map((c) => c.title.toLowerCase().trim()));
      for (const concept of result.concepts) {
        if (!titles.has(concept.title.toLowerCase().trim())) {
          room.concepts.push(concept);
          titles.add(concept.title.toLowerCase().trim());
        }
      }
      room.concepts.sort((a, b) => a.pageRefs[0]! - b.pageRefs[0]!);
      room.coverage.flaggedPages = room.coverage.flaggedPages.filter((p) => p !== result.page);
    } else {
      room.coverage.flaggedPages = [...new Set([...room.coverage.flaggedPages, result.page])].sort((a, b) => a - b);
    }
    room.coverage.mappedPages = sources.length;
    room.coverage.figures = sources.reduce((sum, p) => sum + p.figures.length, 0);
    room.coverage.tables = sources.reduce((sum, p) => sum + p.tables.length, 0);
    room.coverage.concepts = room.concepts.length;
    room.status = sources.length < room.coverage.pages ? "processing" : room.coverage.flaggedPages.length || !room.concepts.length ? "needs-attention" : "ready";
    room.updatedAt = new Date().toISOString();
    await tx.update(tutorClassrooms).set({ data: room, sourceMap: sources }).where(eq(tutorClassrooms.id, id));
    console.info("Recovery checkpoint", { verifiedPages: sources.length - room.coverage.flaggedPages.filter((n) => sources.some((p) => p.page === n)).length, totalPages: room.coverage.pages, status: room.status });
  });
}

let offset = 0;
for (const document of initialRoom.documents) {
  const pageNumbers = Array.from({ length: document.pageCount }, (_, i) => i + 1).filter((local) => flagged.has(offset + local) || !existingPages.some((p) => p.page === offset + local));
  if (pageNumbers.length) {
    const file = await storage.getObjectEntityFile(document.objectPath);
    const [bytes] = await file.download();
    await mapPdf(bytes, document.id, offset, { pageNumbers, onPage: commitPage });
  }
  offset += document.pageCount;
}
await db.transaction(async (tx) => {
  const [latest] = await tx.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, id)).for("update");
  if (!latest) throw new Error("Classroom deleted during recovery.");
  const room = latest.data as Room;
  const sources = latest.sourceMap as SourcePage[];
  const missing = Array.from({ length: room.coverage.pages }, (_, i) => i + 1).filter((page) => !sources.some((p) => p.page === page));
  room.coverage.flaggedPages = [...new Set([...room.coverage.flaggedPages, ...missing])].sort((a, b) => a - b);
  room.status = room.coverage.flaggedPages.length || !room.concepts.length ? "needs-attention" : "ready";
  room.updatedAt = new Date().toISOString();
  await tx.update(tutorClassrooms).set({ data: room }).where(eq(tutorClassrooms.id, id));
});
const [final] = await db.select().from(tutorClassrooms).where(eq(tutorClassrooms.id, id));
const room = final!.data as Room;
console.info("Recovery completed", { status: room.status, pages: room.coverage.mappedPages, flaggedPages: room.coverage.flaggedPages, elapsedMs: Math.round(performance.now() - started) });
process.exit(room.status === "ready" ? 0 : 1);
