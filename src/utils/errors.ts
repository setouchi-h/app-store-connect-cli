import { ZodError } from "zod";

export interface CliErrorOptions {
  code?: string;
  exitCode?: number;
  details?: unknown;
  cause?: unknown;
}

export class CliError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly details?: unknown;

  constructor(message: string, options: CliErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "CliError";
    this.code = options.code ?? "ASC_AI_ERROR";
    this.exitCode = options.exitCode ?? 1;
    this.details = options.details;
  }
}

export function normalizeError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new CliError("Input validation failed.", {
      code: "VALIDATION_FAILED",
      exitCode: 2,
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      })),
      cause: error
    });
  }

  if (error instanceof Error) {
    return new CliError(error.message, {
      code: "UNEXPECTED_ERROR",
      cause: error
    });
  }

  return new CliError("Unexpected non-error failure.", {
    code: "UNEXPECTED_ERROR",
    details: error
  });
}

export function formatCliError(error: CliError, json: boolean): string {
  if (json) {
    return JSON.stringify({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
  }

  const suffix =
    error.details === undefined
      ? ""
      : `\n${JSON.stringify(error.details, null, 2)}`;
  return `${error.code}: ${error.message}${suffix}`;
}
