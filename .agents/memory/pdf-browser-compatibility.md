---
name: PDF browser compatibility
description: PDF.js rendering requirements differ from server PDF processing and affect accessible original-page display.
---
Check PDF.js against actual browser capabilities, separately from Node's capabilities. Do not assume a successful server render proves that the browser renderer works.

**Why:** PDF.js 6 used Map.getOrInsertComputed while rendering pages; the test browser did not implement it. The browser renderer was pinned to a compatible PDF.js 4 release, while the server renderer works with its modern Node runtime. Native PDF iframe embedding also showed a blank page.

**How to apply:** Keep the browser package and matching worker aligned, verify the original-page canvas, and retain accessible extracted text, visual descriptions and an original-file link. Recheck the runtime requirements before upgrading PDF.js.
