import type { ErrorCode } from "./codes.ts";
import type { ErrorContext } from "./context.ts";

/**
 * Base class for every error thrown by Squn.
 *
 * Subclasses set a narrower `code` domain but never override the shape —
 * every SqunError carries a code, structured context, a trace ID for log
 * correlation, a timestamp, and an optional cause (the original driver error).
 */
export abstract class SqunError extends Error {
  readonly code: ErrorCode;
  readonly context: ErrorContext;
  readonly traceId: string;
  readonly timestamp: Date;
  override readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, context: ErrorContext, cause?: unknown) {
    super(message);

    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;

    this.code = code;
    this.context = context;
    this.traceId = crypto.randomUUID();
    this.timestamp = new Date();
    this.cause = cause;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      traceId: this.traceId,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause,
    };
  }
}
