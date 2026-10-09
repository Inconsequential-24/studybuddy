---
name: Visual citation grounding
description: Prevent false verification failures from mixed source IDs, missing visual links, and non-exact quotations.
---
Explicitly distinguish document IDs, global page numbers, figure/table source IDs, captions, and individual labels in generation prompts and validation.

**Why:** Gemini returned correct answers with document IDs in figure citations and a caption identifier in the label field. Those answers correctly failed verification but caused false abstentions until the citation rules included the exact allowed source IDs.

**How to apply:** Give models canonical citation formats and the allowed figure/table ID registry. Text quotes must match source text; visual quotes must match captured visual evidence, and labels must match the actual label list. Never weaken validation merely to accept the model's output.

Enforce the response schema in Gemini's generation configuration as well as validating it afterward; a JSON-only prompt is not a schema guarantee.

**Why:** Practice generation otherwise produced alternate question-type names and string citations despite object-format instructions.

**How to apply:** Apply structured schemas to mapping, lessons, questions and grading; retry validation failures and don't report invalid model output as an invalid student request.

Distinguish unreadable source pages from citation or concept-link failures on already-captured pages.

**Why:** Fully read PDFs were blocked because a captured diagram lacked a concept link or the model paraphrased a quotation. Repeating full vision extraction did not reliably fix citation formatting and wasted time.

**How to apply:** Add only verifiable concepts from captured visual evidence. Repair quotations by asking the model to select IDs from exact, prevalidated source references; keep the source map immutable during that repair. Do not loosen citation matching or fabricate evidence for unreadable pages. Preserve these repairs when changing ingestion or retry machinery.

Require citation fields through a structured response schema, not only prose. Visual references need a verbatim `quote` as well as their source ID.

**Why:** Unconstrained JSON responses omitted quotes on figure citations in visually dense handouts, causing otherwise readable pages to fail schema validation.

**How to apply:** Enforce the schema at generation time and allow a bounded corrective response for malformed output; continue rejecting unsupported quotations.
