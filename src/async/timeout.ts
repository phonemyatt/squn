import type { TimeoutConfig } from "../config/types.ts";
import { ErrorCode } from "../errors/codes.ts";
import { TimeoutError } from "../errors/types.ts";

/** Minimal interface for a TransactionClock — avoids circular import. */
interface Clock {
  remaining(budgetMs: number): number | null;
}

/**
 * Resolves the effective timeout for a single database operation.
 *
 * Precedence chain (PRD 12.2):
 *   per-call option → transaction budget remaining → operation global → null
 *
 * The transaction budget acts as a hard ceiling — even if the call-site requests
 * a longer timeout, it is capped to whatever budget the enclosing transaction has
 * remaining.
 */
export function resolveTimeout(
  callTimeout: number | null | undefined,
  txClock: Clock | undefined,
  globalConfig: TimeoutConfig,
  operation: keyof TimeoutConfig,
): number | null {
  const operationGlobal = globalConfig[operation] ?? null;

  // Start with the most specific source
  let resolved: number | null = callTimeout ?? operationGlobal;

  // Cap to transaction budget if inside a transaction
  if (txClock !== undefined) {
    const budget = txClock.remaining(globalConfig.transaction ?? 0);
    if (budget !== null) {
      resolved = resolved !== null ? Math.min(resolved, budget) : budget;
    }
  }

  return resolved;
}

/**
 * Runs an async function with a timeout deadline.
 * Uses AbortController for cancellation. Timer is always cleared in a finally block.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  operation: string = "query",
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    const result = await fn(controller.signal);
    return result;
  } catch (err: unknown) {
    if (controller.signal.aborted) {
      throw new TimeoutError(
        ErrorCode.QUERY_TIMEOUT,
        `Operation '${operation}' timed out after ${ms}ms`,
        { operation, durationMs: ms },
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
