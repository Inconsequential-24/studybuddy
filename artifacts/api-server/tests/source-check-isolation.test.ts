import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ai } from "@workspace/integrations-gemini-ai";
import { checkPdfSource } from "../src/lib/source-check-ai";

test("source-check route, review service, and storage table remain outside classroom ingestion", async () => {
  const route = await readFile(new URL("../src/routes/source-checks.ts", import.meta.url), "utf8");
  const reviewer = await readFile(new URL("../src/lib/source-check-ai.ts", import.meta.url), "utf8");
  const table = await readFile(new URL("../../../lib/db/src/schema/source-checks.ts", import.meta.url), "utf8");
  const classroomOnly = /\b(tutorClassrooms|tutorPageJobs|tutorAttempts|tutorExams|tutorProfiles|tutorUploads|tutor-ingestion|tutor-ai)\b/;

  assert.doesNotMatch(route, classroomOnly);
  assert.doesNotMatch(reviewer, classroomOnly);
  assert.match(table, /pgTable\("tutor_source_checks"/);
  assert.doesNotMatch(table, /\.references\(/);
});

test("source-check API offers a separate upload, explicit start, saved result, and delete lifecycle", async () => {
  const route = await readFile(new URL("../src/routes/source-checks.ts", import.meta.url), "utf8");

  assert.match(route, /router\.post\("\/source-checks\/uploads"/);
  assert.match(route, /router\.post\("\/source-checks\/:checkId\/start"/);
  assert.match(route, /router\.get\("\/source-checks\/:checkId"/);
  assert.match(route, /router\.delete\("\/source-checks\/:checkId"/);
  assert.match(route, /MAX_UPLOAD_BYTES/);
  assert.match(route, /MAX_QUEUED_CHECKS/);
  assert.match(route, /RESULT_TTL_MS/);
});

test("skim reports only exact PDF text paired with a named grounded web source", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("Mars is the fourth planet from the Sun.", { font });
  const bytes = Buffer.from(await pdf.save());
  const original = ai.models.generateContent;
  const exactQuote = "Mars is the fourth planet from the Sun.";
  try {
    ai.models.generateContent = async (request: any) => {
      assert.deepEqual(request.config.tools, [{ googleSearch: {} }]);
      return {
        text: JSON.stringify({
          findings: [
            { page: 1, evidenceKind: "text", sourceId: null, pdfQuote: exactQuote, status: "confirmed-conflict", explanation: "The web source differs.", sourceUri: "https://science.example/source" },
            { page: 1, evidenceKind: "text", sourceId: null, pdfQuote: "mars is the fourth planet from the Sun.", status: "possible-conflict", explanation: "The casing differs.", sourceUri: "https://science.example/source" },
            { page: 1, evidenceKind: "text", sourceId: null, pdfQuote: exactQuote, status: "possible-conflict", explanation: "This URI was not grounded.", sourceUri: "https://unlisted.example/source" },
          ],
          uncheckedClaims: [],
        }),
        candidates: [{ groundingMetadata: { groundingChunks: [{ web: { title: "Science Reference", uri: "https://science.example/source" } }] } }],
      } as any;
    };

    const report = await checkPdfSource(bytes, "skim", AbortSignal.timeout(30_000));
    assert.equal(report.mode, "skim");
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].page, 1);
    assert.equal(report.findings[0].pdfQuote, exactQuote);
    assert.equal(report.findings[0].sourceName, "Science Reference");
    assert.equal(report.findings[0].sourceUrl, "https://science.example/source");
    assert.equal(report.uncheckedClaims.length, 2);
  } finally {
    ai.models.generateContent = original;
  }
});

test("skim fails visibly when external search provides no citable source", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("A short factual statement.", { font });
  const bytes = Buffer.from(await pdf.save());
  const original = ai.models.generateContent;
  try {
    ai.models.generateContent = async () => ({
      text: JSON.stringify({ findings: [], uncheckedClaims: [] }),
      candidates: [{ groundingMetadata: { groundingChunks: [] } }],
    } as any);
    await assert.rejects(
      checkPdfSource(bytes, "skim", AbortSignal.timeout(30_000)),
      /External search did not return citable web sources/,
    );
  } finally {
    ai.models.generateContent = original;
  }
});

test("thorough review sends rendered pages and keeps visual IDs separate from PDF page numbers", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage();
  page.drawText("Enrollment by year", { x: 48, y: 720, font });
  page.drawLine({ start: { x: 48, y: 700 }, end: { x: 380, y: 700 }, thickness: 1 });
  const bytes = Buffer.from(await pdf.save());
  const original = ai.models.generateContent;
  try {
    ai.models.generateContent = async (request: any) => {
      const parts = request.contents[0].parts;
      assert.ok(parts.some((part: any) => part.inlineData?.mimeType === "image/png"));
      assert.match(parts[0].text, /image 1 is page 1/);
      return {
        text: JSON.stringify({
          findings: [
            { page: 1, evidenceKind: "table", sourceId: "p1-table-1", pdfQuote: "Enrollment reached 54 percent in 2024.", status: "possible-conflict", explanation: "The comparison source differs.", sourceUri: "https://science.example/enrollment" },
          ],
          uncheckedClaims: [],
        }),
        candidates: [{ groundingMetadata: { groundingChunks: [{ web: { title: "Education Data", uri: "https://science.example/enrollment" } }] } }],
      } as any;
    };

    const report = await checkPdfSource(bytes, "thorough", AbortSignal.timeout(30_000));
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].page, 1);
    assert.equal(report.findings[0].evidenceKind, "table");
    assert.equal(report.findings[0].sourceId, "p1-table-1");
  } finally {
    ai.models.generateContent = original;
  }
});
