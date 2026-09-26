export class UsageError extends Error {
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function formatError(error: unknown, debug: boolean): string {
  if (debug && error instanceof Error && error.stack) return error.stack;
  return errorMessage(error);
}
