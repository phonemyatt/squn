import type { IDbAdapter } from "../adapters/base.ts";
import { buildParams } from "../core/param-builder.ts";
import { ErrorCode } from "../errors/codes.ts";
import { ConnectionError, QueryError, TransactionError } from "../errors/types.ts";
import type { SqlFragment } from "../sql/fragment.ts";
import type { Row } from "../types/primitives.ts";
import { IsolationLevel } from "./isolation.ts";

/** AtomicNestingError — a TransactionError with code TX_NESTING_FORBIDDEN. */
export class AtomicNestingError extends TransactionError {}

/** The limited API available inside an atomically() callback. */
export interface AtomicExecutor {
  query<T>(fragment: SqlFragment): Promise<T[]>;
  queryFirst<T>(fragment: SqlFragment): Promise<T | null>;
  querySingle<T>(fragment: SqlFragment): Promise<T>;
  queryScalar<T>(fragment: SqlFragment): Promise<T>;
  execute(fragment: SqlFragment): Promise<{ rowsAffected: number }>;
  executeBatch(
    fragment: SqlFragment,
    rows: readonly Record<string, unknown>[],
  ): Promise<{ rowsAffected: number }>;
}

export interface AtomicOptions {
  readonly timeoutMs?: number;
  readonly retryOnError?: boolean;
  readonly maxRetries?: number;
  readonly retryDelayMs?: number;
  readonly isolation?: IsolationLevel;
}

export { IsolationLevel };

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

    if (options.isolation !== undefined) {
      await tx.execute(`SET TRANSACTION ISOLATION LEVEL ${options.isolation}`, []);
    }

    const executor: AtomicExecutor = {
      query: async <T>(fragment: SqlFragment): Promise<T[]> => {
        const rows = await tx.query(fragment.text, fragment.params);
        return rows as T[];
      },
      queryFirst: async <T>(fragment: SqlFragment): Promise<T | null> => {
        const rows = await tx.query(fragment.text, fragment.params);
        if (rows.length === 0) return null;
        return (rows[0] ?? null) as T | null;
      },
      querySingle: async <T>(fragment: SqlFragment): Promise<T> => {
        const rows = await tx.query(fragment.text, fragment.params);
        if (rows.length === 0) {
          throw new QueryError(ErrorCode.NO_ROWS_FOUND, "querySingle() returned zero rows", {
            operation: "querySingle",
            sql: fragment.text,
          });
        }
        if (rows.length > 1) {
          throw new QueryError(
            ErrorCode.MULTIPLE_ROWS_FOUND,
            `querySingle() returned ${rows.length} rows, expected exactly one`,
            { operation: "querySingle", sql: fragment.text },
          );
        }
        return rows[0] as T | undefined as T;
      },
      queryScalar: async <T>(fragment: SqlFragment): Promise<T> => {
        const rows = await tx.query(fragment.text, fragment.params);
        if (rows.length === 0) {
          throw new QueryError(ErrorCode.NO_ROWS_FOUND, "queryScalar() returned zero rows", {
            operation: "queryScalar",
            sql: fragment.text,
          });
        }
        const firstRow = rows[0] as Row;
        const firstKey = Object.keys(firstRow)[0];
        if (firstKey === undefined) {
          throw new QueryError(ErrorCode.NO_ROWS_FOUND, "queryScalar() row has no columns", {
            operation: "queryScalar",
            sql: fragment.text,
          });
        }
        return firstRow[firstKey] as T;
      },
      execute: (fragment: SqlFragment) => tx.execute(fragment.text, fragment.params),
      executeBatch: async (
        fragment: SqlFragment,
        rows: readonly Record<string, unknown>[],
      ): Promise<{ rowsAffected: number }> => {
        let total = 0;
        for (const row of rows) {
          const built = buildParams(fragment.text, row, adapter.type);
          const result = await tx.execute(built.text, built.params);
          total += result.rowsAffected;
        }
        return { rowsAffected: total };
      },
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

  throw new TransactionError(
    ErrorCode.INTERNAL_ERROR,
    "Unreachable — runAtomically loop invariant violated",
    { operation: "runAtomically" },
  );
}
