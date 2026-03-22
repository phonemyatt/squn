import { SqunError } from "./base.ts";
import type { ErrorCode } from "./codes.ts";
import type { ErrorContext } from "./context.ts";
import { QueryError } from "./types.ts";

/**
 * Normalises any thrown value into a SqunError.
 *
 * If `raw` is already a SqunError it is returned unchanged — no double-wrapping.
 * Otherwise a new QueryError is created with `raw` preserved as the cause.
 * This is the only function adapters use to surface driver errors.
 */
export function wrapError(
  raw: unknown,
  code: ErrorCode,
  context: ErrorContext,
  message: string,
): SqunError {
  if (raw instanceof SqunError) {
    return raw;
  }

  return new QueryError(code, message, context, raw);
}
