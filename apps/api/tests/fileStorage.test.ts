import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../src/config/env';
import { removeStoredFile, sanitizeFileName, storePdf } from '../src/services/procurement/fileStorage';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'faircart-upload-'));
  process.env.UPLOAD_DIR = dir;
  resetEnvCache();
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

const file = (content: string, name = 'quote.pdf') => ({ buffer: Buffer.from(content), originalname: name, size: content.length });

describe('storePdf', () => {
  it('stores a PDF under a server-generated name, never the client filename', async () => {
    const stored = await storePdf(file('%PDF-1.7 content', '../../etc/passwd.pdf'));
    expect(stored.storedName).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(stored.originalName).toBe('passwd.pdf');
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await readFile(path.join(dir, stored.storedName))).toString()).toContain('%PDF-1.7');
    await removeStoredFile(stored.storedName);
    expect(await readdir(dir)).toHaveLength(0);
  });
  it('rejects content that is not a PDF even if the MIME type claimed it was', async () => {
    await expect(storePdf(file('<html>not a pdf</html>'))).rejects.toThrow('does not look like a PDF');
  });
  it('rejects empty files', async () => {
    await expect(storePdf(file(''))).rejects.toThrow('empty');
  });
  it('removeStoredFile ignores names it did not generate (no path traversal)', async () => {
    await expect(removeStoredFile('../../important.txt')).resolves.toBeUndefined();
  });
});

describe('sanitizeFileName', () => {
  it('strips paths and unsafe characters', () => {
    expect(sanitizeFileName('C:\\Users\\me\\q<1>.pdf')).toBe('q_1_.pdf');
    expect(sanitizeFileName('....hidden.pdf')).toBe('hidden.pdf');
    expect(sanitizeFileName('')).toBe('quotation.pdf');
    expect(sanitizeFileName('a'.repeat(300) + '.pdf').length).toBe(100);
  });
});
