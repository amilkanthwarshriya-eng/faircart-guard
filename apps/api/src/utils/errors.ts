export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string, id?: string) =>
  new AppError(404, 'NOT_FOUND', `${what} not found`, id ? { id } : undefined);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) => new AppError(422, code, message, details);
