import type { IDbAdapter } from "../adapters/base.ts";
import type { Row } from "../types/primitives.ts";
import { ErrorCode } from "../errors/codes.ts";
import { TransactionError, ConnectionError } from "../errors/types.ts";

/** AtomicNestingError — a TransactionError with code TX_NESTING_FORBIDDEN. */
export class AtomicNestingError extends TransactionError {}

/** The limited API available inside an atomically() callback. */
export interface AtomicExecutor {
  query(sql: string, params: unknown[]): Promise<Row[]>;
  execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }>;
}

export interface AtomicOptions {
  readonly timeoutMs?: number;
  readonly retryOnError?: boolean;
  readonly maxRetries?: number;
  readonly retryDelayMs?: number;
}

const ATOMIC_CONTEXT = Symbol("squn_atomic");

function isInsideAtomic(): boolean {
  return (globalThis as Record<symbol, unknown>)[ATOMIC_CONTEXT] === true;
}

function setAtomicContext(value: boolean): void {
  (globalThis as Record<symbol, unknown>)[ATOMIC_CONTEXT] = value;
}

/**
 * Runs a function inside a BEGIN/COMMIT block.
 * Nesting is forbidden — throws AtomicNestingError.
 * retryOnError only retries ConnectionError, never QueryError or MappingError.
 */
export async function runAtomically<T>(
  adapter: IDbAdapter,
  fn: (executor: AtomicExecutor) => Promise<T>,
  options: AtomicOptions = {},
): Promise<T> {
  if (isInsideAtomic()) {
    throw new AtomicNestingError(
      ErrorCode.TX_ALREADY_CLOSED,
      "Cannot nest atomically() inside another atomically() or transaction()",
      { operation: "atomically" },
    );
  }

  const { retryOnError = false, maxRetries = 0, retryDelayMs = 100 } = options;
  const attempts = retryOnError ? maxRetries + 1 : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const tx = await adapter.beginTransaction();
    const executor: AtomicExecutor = {
      query: (sql, params) => tx.query(sql, params),
      execute: (sql, params) => tx.execute(sql, params),
    };

    try {
      setAtomicContext(true);
      const result = await fn(executor);
      await tx.commit();
      return result;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // Rollback failure is swallowed — the original error is more important
      }

      const isRetryable = retryOnError && err instanceof ConnectionError;
      if (isRetryable && attempt < attempts - 1) {
        await Bun.sleep(retryDelayMs);
        continue;
      }
      throw err;
    } finally {
      setAtomicContext(false);
    }
  }

  throw new Error("Unreachable");
}
