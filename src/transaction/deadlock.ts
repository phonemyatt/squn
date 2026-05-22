import type { AdapterType } from "../config/types.ts";
import { SqunError } from "../errors/base.ts";
import { ErrorCode } from "../errors/codes.ts";
import { TransactionError } from "../errors/types.ts";

/**
 * Detects whether an error is a deadlock for the given adapter.
 * MSSQL: error 1205, PostgreSQL: code 40P01, MySQL: 1213, SQLite: SQLITE_BUSY.
 */
export function isDeadlock(err: SqunError, adapterType: AdapterType): boolean {
  const cause = err.cause;
  if (cause === null || cause === undefined) return false;

  const errObj = cause as Record<string, unknown>;

  switch (adapterType) {
    case "mssql":
      return errObj.number === 1205;
    case "postgres":
      return errObj.code === "40P01";
    case "mysql":
      return errObj.errno === 1213;
    case "sqlite":
      return String(errObj.code ?? errObj.message ?? "").includes("SQLITE_BUSY");
  }
}

export interface RetryOptions {
  readonly maxRetries: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
}

/**
 * Retries a function on deadlock with exponential backoff + random jitter.
 */
export async function retryWithDeadlockBackoff<T>(
  fn: () => Promise<T>,
  adapterType: AdapterType,
  options: RetryOptions,
): Promise<T> {
  const { maxRetries, baseDelayMs = 50, maxDelayMs = 5_000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !(err instanceof SqunError) || !isDeadlock(err, adapterType)) {
        throw err;
      }
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      await Bun.sleep(jitter);
    }
  }

  // Unreachable — the loop always returns or throws
  throw new TransactionError(ErrorCode.INTERNAL_ERROR, "Unreachable — retryWithDeadlockBackoff loop invariant violated", { operation: "retryWithDeadlockBackoff" });
}
