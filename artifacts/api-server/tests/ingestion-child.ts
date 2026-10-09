import { runIngestionPass } from "../src/lib/tutor-ingestion";
import type { Concept, SourcePage } from "../src/lib/tutor-types";

// A separate OS process is killed by the test while page two is in flight.
await runIngestionPass(async (job) => {
  if (job.page === 2) {
    process.send?.({ processing: true });
    await new Promise(() => {});
  }
  const source: SourcePage = { page: job.page, localPage: job.localPage, documentId: job.documentId, text: "Verified page text", figures: [], tables: [] };
  const concept: Concept = { id: `concept-${job.id}`, title: "Verified", summary: source.text, refs: [{ page: job.page, kind: "text", quote: source.text }], pageRefs: [job.page], mastery: 0, estimatedMinutes: 8, reviewDue: false };
  return { source, concepts: [concept] };
}, process.argv[2]);
