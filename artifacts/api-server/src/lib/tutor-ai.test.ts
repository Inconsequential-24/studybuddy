import { strict as assert } from "node:assert";
import { test } from "node:test";
import { addVisualConcepts, referenceCandidates, validateReferences } from "./tutor-ai";
import type { Concept, SourcePage } from "./tutor-types";

const source: SourcePage = {
  page: 3, localPage: 3, documentId: "document", text: "Leaves exchange gases.",
  figures: [{ id: "p3-fig1", caption: "Leaf cross-section", description: "A labelled cross-section of a leaf.", labels: ["Stoma", "CO2"], relationships: ["CO2 enters through the stoma."] }],
  tables: [{ id: "p3-table1", caption: "Leaf structures", rows: [["Part", "Label"], ["Opening", "Stoma"]] }],
};
test("unlinked captured figures and tables receive only verifiable source-based concepts", () => {
  const additions = addVisualConcepts(source, []);
  assert.equal(additions.length, 2);
  assert.ok(additions.every((c) => validateReferences(c.refs, [source])));
  assert.ok(additions.some((c) => c.refs[0]?.sourceId === "p3-fig1"));
  assert.ok(additions.some((c) => c.refs[0]?.sourceId === "p3-table1"));
  assert.deepEqual(addVisualConcepts(source, additions), []);
});
test("an invalid original model reference is not accepted or silently repaired", () => {
  const bad: Concept = { id: "bad", title: "Unverified claim", summary: "Unsupported", refs: [{ page: 3, kind: "figure", sourceId: "document", quote: "Not in the source" }], pageRefs: [3], mastery: 0, estimatedMinutes: 8, reviewDue: false };
  assert.equal(validateReferences(bad.refs, [source]), false);
  const additions = addVisualConcepts(source, [bad]);
  assert.equal(additions.length, 2);
  assert.equal(validateReferences(bad.refs, [source]), false);
});
test("unreadable empty visuals are not given fabricated evidence", () => {
  const empty = { ...source, tables: [], figures: [{ id: "unreadable", caption: "", description: "", labels: [], relationships: [] }] };
  assert.deepEqual(addVisualConcepts(empty, []), []);
});
test("citation repair candidates are exact, prevalidated source evidence", () => {
  const candidates = referenceCandidates(source);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((ref) => validateReferences([ref], [source])));
  assert.ok(candidates.some((ref) => ref.kind === "text" && source.text.includes(ref.quote)));
  assert.ok(candidates.some((ref) => ref.sourceId === "p3-fig1"));
  assert.ok(candidates.some((ref) => ref.sourceId === "p3-table1"));
  assert.ok(!candidates.some((ref) => ref.quote === "CO2"));
  assert.deepEqual(referenceCandidates({ ...source, text: "", figures: [], tables: [] }), []);
});
