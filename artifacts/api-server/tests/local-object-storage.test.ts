import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { LocalStoredObject, LocalUploadError, resolveLocalPath, writeLocalUpload } from "../src/lib/localObjectStorage";

const pdf = Buffer.from("%PDF-1.7\nlocal storage test\n");

async function withRoot(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), "studybuddy-storage-"));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("resolveLocalPath accepts only uploads/<uuid> inside the root", () => {
  const root = "/srv/storage";
  const id = randomUUID();
  assert.equal(resolveLocalPath(`uploads/${id}`, root), path.join(root, "uploads", id));
  for (const bad of ["uploads/../../etc/passwd", "uploads/not-a-uuid", `other/${id}`, `uploads/${id}/x`, "uploads/", ""]) {
    assert.equal(resolveLocalPath(bad, root), null, bad);
  }
});

test("writeLocalUpload stores the body once and LocalStoredObject reads it back", () => withRoot(async (root) => {
  const entity = `uploads/${randomUUID()}`;
  await writeLocalUpload(entity, Readable.from([pdf]), { root });
  const file = new LocalStoredObject(resolveLocalPath(entity, root)!);
  assert.deepEqual(await file.exists(), [true]);
  assert.deepEqual(await file.getMetadata(), [{ size: pdf.length, contentType: "application/pdf" }]);
  assert.deepEqual((await file.download())[0], pdf);

  await assert.rejects(writeLocalUpload(entity, Readable.from([pdf]), { root }), (err) => err instanceof LocalUploadError && err.status === 409);

  await file.delete();
  assert.deepEqual(await file.exists(), [false]);
  await file.delete({ ignoreNotFound: true });
  await assert.rejects(file.delete(), { code: "ENOENT" });
}));

test("writeLocalUpload rejects oversized bodies and invalid ids without leaving files", () => withRoot(async (root) => {
  const entity = `uploads/${randomUUID()}`;
  await assert.rejects(
    writeLocalUpload(entity, Readable.from([Buffer.alloc(8), Buffer.alloc(8)]), { root, maxBytes: 10 }),
    (err) => err instanceof LocalUploadError && err.status === 413,
  );
  assert.deepEqual(await readdir(path.join(root, "uploads")), []);

  await assert.rejects(writeLocalUpload("uploads/../escape", Readable.from([pdf]), { root }), (err) => err instanceof LocalUploadError && err.status === 400);
  assert.deepEqual(await readdir(root), ["uploads"]);
}));
