import { randomUUID } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { link, mkdir, readFile, stat, unlink } from 'fs/promises';
import path from 'path';
import { Transform, type Readable } from 'stream';
import { pipeline } from 'stream/promises';

// Local-disk replacement for Replit App Storage, enabled with STORAGE_DRIVER=local.
// Development only: files are stored unencrypted under LOCAL_STORAGE_DIR.

export const LOCAL_UPLOAD_URL_PREFIX = '/api/storage/uploads/local/';
export const MAX_UPLOAD_BYTES = 26214400;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isLocalStorage = () => process.env.STORAGE_DRIVER === 'local';

export function localStorageDir(): string {
  return path.resolve(process.env.LOCAL_STORAGE_DIR || '.local/storage');
}

export class LocalUploadError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'LocalUploadError';
  }
}

// Only "uploads/<uuid>" entities exist; anything else is rejected so a path can
// never escape the storage directory.
export function resolveLocalPath(entityId: string, root = localStorageDir()): string | null {
  const [dir, id, ...rest] = entityId.split('/');
  if (dir !== 'uploads' || !id || rest.length > 0 || !UUID.test(id)) return null;
  const full = path.resolve(root, 'uploads', id);
  return full.startsWith(path.resolve(root) + path.sep) ? full : null;
}

// Mirrors the subset of the GCS File API that the routes and ingestion use.
export class LocalStoredObject {
  constructor(readonly filePath: string) {}

  async exists(): Promise<[boolean]> {
    try {
      return [(await stat(this.filePath)).isFile()];
    } catch {
      return [false];
    }
  }

  async getMetadata(): Promise<[{ size: number; contentType: string }]> {
    const { size } = await stat(this.filePath);
    return [{ size, contentType: 'application/pdf' }];
  }

  async download(): Promise<[Buffer]> {
    return [await readFile(this.filePath)];
  }

  createReadStream() {
    return createReadStream(this.filePath);
  }

  async delete({ ignoreNotFound = false }: { ignoreNotFound?: boolean } = {}): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (err) {
      if (!(ignoreNotFound && (err as NodeJS.ErrnoException).code === 'ENOENT')) throw err;
    }
  }
}

// Streams the body to a temp file with a byte cap, then hard-links it into place,
// which fails if the target exists, so each upload slot can be written only once.
export async function writeLocalUpload(
  entityId: string,
  body: Readable,
  { root = localStorageDir(), maxBytes = MAX_UPLOAD_BYTES } = {},
): Promise<void> {
  const target = resolveLocalPath(entityId, root);
  if (!target) throw new LocalUploadError(400, 'Invalid upload id.');
  await mkdir(path.dirname(target), { recursive: true });
  if ((await new LocalStoredObject(target).exists())[0]) {
    throw new LocalUploadError(409, 'This upload has already been sent.');
  }

  const temp = `${target}.part-${randomUUID()}`;
  let bytes = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) callback(new LocalUploadError(413, 'Each PDF must be 25 MB or smaller.'));
      else callback(null, chunk);
    },
  });

  try {
    await pipeline(body, limit, createWriteStream(temp, { flags: 'wx' }));
    await link(temp, target).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'EEXIST') throw new LocalUploadError(409, 'This upload has already been sent.');
      throw err;
    });
  } finally {
    await unlink(temp).catch(() => {});
  }
}
