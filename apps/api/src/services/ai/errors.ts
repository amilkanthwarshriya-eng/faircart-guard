export type AiErrorCode =
  | 'CONFIG'
  | 'INVALID_INPUT'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'INVALID_JSON'
  | 'SCHEMA_INVALID';

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(code: AiErrorCode, message: string, retryable = false, status?: number) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

/** Maps an HTTP status from a provider to a typed AiError. Never reads the response body (it could echo secrets). */
export function httpStatusToAiError(provider: string, status: number): AiError {
  if (status === 429) {
    return new AiError('RATE_LIMITED', `${provider}: rate limit or quota reached (429)`, true, status);
  }
  if (status >= 500) {
    // includes 529 "overloaded"
    return new AiError('PROVIDER_ERROR', `${provider}: server error (${status})`, true, status);
  }
  if (status === 401 || status === 403) {
    return new AiError('CONFIG', `${provider}: API key rejected (${status})`, false, status);
  }
  if (status === 404) {
    return new AiError('CONFIG', `${provider}: model not found (404). Check the model name in your .env (GEMINI_MODEL / ANTHROPIC_MODEL); old models get retired`, false, status);
  }
  return new AiError('PROVIDER_ERROR', `${provider}: request rejected (${status})`, false, status);
}
