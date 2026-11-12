import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Loads KEY=VALUE lines from apps/api/.env, then the repo-root .env. Existing environment variables win.
 * Handles spaces around "=", quotes, Windows line endings and a hidden BOM at the start of the file.
 * Returns the files it read (never prints values).
 */
export function loadDotEnv(): string[] {
  const used: string[] = [];
  for (const file of [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')]) {
    if (!existsSync(file)) continue;
    used.push(file);
    const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m || m[1] in process.env) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return used;
}
