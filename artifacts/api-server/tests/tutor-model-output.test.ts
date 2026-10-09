import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ai } from "@workspace/integrations-gemini-ai";
import { mapPdfPage, validateReferences } from "../src/lib/tutor-ai";

test("Pro mapping requires citation quotes and repairs a malformed response without weakening verification", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("Verified source text.", { font });
  const bytes = Buffer.from(await pdf.save());
  const original = ai.models.generateContent;
  const calls: any[] = [];
  const valid = {
    transcription: "Verified source text.", figures: [], tables: [],
    concepts: [{ title: "Source concept", summary: "Verified source text.", citations: [{ page: 1, kind: "text", quote: "Verified source text." }] }],
  };
  try {
    ai.models.generateContent = async (request: any) => {
      calls.push(request);
      const malformed = { ...valid, concepts: [{ ...valid.concepts[0], citations: [{ page: 1, kind: "text" }] }] };
      return { text: JSON.stringify(calls.length === 1 ? malformed : valid) } as any;
    };
    const result = await mapPdfPage(bytes, "test-document", 1, 1, AbortSignal.timeout(30000), async () => true);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.model === "gemini-3.1-pro-preview"));
    const citations = calls[0].config.responseJsonSchema.properties.concepts.items.properties.citations.items;
    assert.ok(citations.required.includes("quote"));
    assert.ok(result.concepts.every((c) => validateReferences(c.refs, [result.source])));
    assert.match(calls[1].contents[0].parts[0].text, /previous response did not match/);

    calls.length = 0;
    ai.models.generateContent = async (request: any) => {
      calls.push(request);
      return { text: JSON.stringify({ ...valid, concepts: [{ ...valid.concepts[0], citations: [{ page: 1, kind: "text", quote: "Unsupported outside fact." }] }] }) } as any;
    };
    await assert.rejects(mapPdfPage(bytes, "test-document", 1, 1, AbortSignal.timeout(30000), async () => true), /could not be verified/);
    assert.equal(calls.length, 2);
  } finally {
    ai.models.generateContent = original;
  }
});
