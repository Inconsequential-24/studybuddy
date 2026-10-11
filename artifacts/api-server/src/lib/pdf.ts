import { definePDFJSModule, getDocumentProxy } from "unpdf";

let pdfConfigured = false;

export async function loadPdf(bytes: Buffer) {
  if (!pdfConfigured) {
    const canvas = await import("@napi-rs/canvas");
    Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, Path2D: canvas.Path2D, ImageData: canvas.ImageData });
    await definePDFJSModule(() => import("pdfjs-dist/legacy/build/pdf.mjs"));
    pdfConfigured = true;
  }
  return getDocumentProxy(new Uint8Array(bytes));
}
