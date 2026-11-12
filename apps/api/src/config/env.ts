import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  DEMO_MODE: bool.default('true'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parsed lazily so importing modules never requires a full environment (keeps unit tests simple). */
export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid environment configuration: ${msg}`); // never prints values
    }
    cached = parsed.data;
  }
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
