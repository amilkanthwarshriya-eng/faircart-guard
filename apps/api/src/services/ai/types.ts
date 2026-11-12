import type { ZodType } from 'zod';

/** Low level: one prompt in, raw text out. Each provider adapter implements only this. */
export interface RawLLM {
  readonly provider: string;
  readonly model: string;
  complete(req: { system: string; prompt: string }, signal: AbortSignal): Promise<string>;
}

/** What the rest of the app uses. Returns schema-validated JSON or throws AiError. */
export interface LLMClient {
  readonly provider: string;
  readonly model: string;
  generateJson<T>(opts: { schema: ZodType<T>; system: string; prompt: string }): Promise<T>;
}
