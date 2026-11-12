/**
 * Safe storage for uploaded PDF quotations. Uploaded bytes are untrusted:
 *  - MIME is checked by multer, and the "%PDF-" magic header is verified here;
 *  - the on-disk name is a server-generated UUID (the client filename is NEVER used as a path);
 *  - the content is never parsed or executed here (text extraction belongs to Member 2).
 */
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getEnv } from '../../config/env';
import { sha256Hex } from '../../utils/canonical';
import { AppError } from '../../utils/errors';

export interface StoredFile {
  storedName: string;
  originalName: string;
  size: number;
  sha256: string;
  mimeType: 'application/pdf';
}

export function sanitizeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/')).replace(/[^\w.\- ]+/g, '_').replace(/^\.+/, '').trim();
  return (base || 'quotation.pdf').slice(0, 100);
}

export async function storePdf(file: { buffer: Buffer; originalname: string; size: number }): Promise<StoredFile> {
  if (!file.buffer || file.buffer.length === 0) throw new AppError(400, 'EMPTY_FILE', 'The uploaded file is empty');
  if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new AppError(400, 'INVALID_FILE_CONTENT', 'The uploaded file does not look like a PDF');
  }
  const dir = path.resolve(getEnv().UPLOAD_DIR);
  await mkdir(dir, { recursive: true });
  const storedName = `${randomUUID()}.pdf`;
  await writeFile(path.join(dir, storedName), file.buffer, { flag: 'wx', mode: 0o640 });
  return { storedName, originalName: sanitizeFileName(file.originalname), size: file.buffer.length, sha256: sha256Hex(file.buffer), mimeType: 'application/pdf' };
}

export async function removeStoredFile(storedName: string): Promise<void> {
  if (!/^[0-9a-f-]{36}\.pdf$/.test(storedName)) return; // only ever delete files we named ourselves
  await unlink(path.join(path.resolve(getEnv().UPLOAD_DIR), storedName)).catch(() => undefined);
}
