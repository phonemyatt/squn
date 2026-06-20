import type { IDbAdapter } from "../adapters/base.ts";
import { ParamBuffer } from "../cache/param-buffer.ts";
import { ErrorCode } from "../errors/codes.ts";
import { QueryError } from "../errors/types.ts";
import { formatSql } from "../sql/formatter.ts";
import { ensureTrailingSemicolon } from "../sql/fragment.ts";
import type { SqlFragment } from "../sql/fragment.ts";
import { validateSql } from "../sql/validator.ts";
import type { Row } from "../types/primitives.ts";

/**
 * Metadata extracted once at prepare() time — never recomputed.
 * The sql text, normalised text, param name order, and validation
 * are all frozen here. The hot path only fills the ParamBuffer.
 */
interface PreparedMeta {
  /** The final SQL text sent to the adapter (with $1, $2… placeholders). */
  readonly text: string;
  /** Normalised SQL for logging / cache keys. */
  readonly normalizedText: string;
  /** Ordered param names extracted from the template. */
  readonly paramNames: readonly string[];
  /** Pre-allocated buffer — reused across every call. */
  readonly buffer: ParamBuffer;
}

/**
 * A prepared query. The SQL is parsed, validated, and normalised once.
 * Each invocation only fills the ParamBuffer and calls the adapter.
 *
 * For queries (SELECT): returns T[].
 * For single-row: use .first() or .single().
 * For writes: use .execute().
 */
export class PreparedQuery<T, P extends Record<string, unknown> = Record<string, never>> {
  private readonly meta: PreparedMeta;
  private readonly adapter: IDbAdapter;

  constructor(adapter: IDbAdapter, fragment: SqlFragment, paramNames: readonly string[]) {
    // All the expensive work happens here — once.
    validateSql(fragment);

    this.adapter = adapter;
    this.meta = {
      text: ensureTrailingSemicolon(fragment.text),
      normalizedText: formatSql(fragment.text),
      paramNames,
      buffer: new ParamBuffer(paramNames.length || 8),
    };
  }

  /** Bind params into the buffer — the only per-call work. */
  private bind(params: P): readonly unknown[] {
    const { buffer, paramNames } = this.meta;
    buffer.reset();
    for (const name of paramNames) {
      buffer.push(params[name]);
    }
    return buffer.toArray();
  }

  /** Execute as a query — returns T[]. */
  async all(params: P): Promise<T[]> {
    const bound = this.bind(params);
    const rows = await this.adapter.query(this.meta.text, bound as unknown[]);
    return rows as T[];
  }

  /** Execute and return T | null — first row or null. */
  async first(params: P): Promise<T | null> {
    const bound = this.bind(params);
    const rows = await this.adapter.query(this.meta.text, bound as unknown[]);
    if (rows.length === 0) return null;
    return rows[0] as T;
  }

  /** Execute and return exactly one T — throws on 0 or >1 rows. */
  async single(params: P): Promise<T> {
    const bound = this.bind(params);
    const rows = await this.adapter.query(this.meta.text, bound as unknown[]);
    if (rows.length === 0) {
      throw new QueryError(ErrorCode.NO_ROWS_FOUND, "PreparedQuery.single() returned zero rows", {
        operation: "single",
        sql: this.meta.text,
      });
    }
    if (rows.length > 1) {
      throw new QueryError(
        ErrorCode.MULTIPLE_ROWS_FOUND,
        `PreparedQuery.single() returned ${rows.length} rows`,
        { operation: "single", sql: this.meta.text },
      );
    }
    return rows[0] as T;
  }

  /** Execute and return the first column of the first row. */
  async scalar(params: P): Promise<T> {
    const bound = this.bind(params);
    const rows = await this.adapter.query(this.meta.text, bound as unknown[]);
    if (rows.length === 0) {
      throw new QueryError(ErrorCode.NO_ROWS_FOUND, "PreparedQuery.scalar() returned zero rows", {
        operation: "scalar",
        sql: this.meta.text,
      });
    }
    const firstRow = rows[0] as Row;
    const firstKey = Object.keys(firstRow)[0];
    if (firstKey === undefined) {
      throw new QueryError(ErrorCode.NO_ROWS_FOUND, "PreparedQuery.scalar() row has no columns", {
        operation: "scalar",
        sql: this.meta.text,
      });
    }
    return firstRow[firstKey] as T;
  }

  /** Execute as a write — returns { rowsAffected }. */
  async execute(params: P): Promise<{ rowsAffected: number }> {
    const bound = this.bind(params);
    return this.adapter.execute(this.meta.text, bound as unknown[]);
  }

  /** The normalised SQL text — useful for logging and debugging. */
  get sql(): string {
    return this.meta.normalizedText;
  }

  /** The raw SQL text sent to the adapter. */
  get rawSql(): string {
    return this.meta.text;
  }

  /** The ordered param names. */
  get paramNames(): readonly string[] {
    return this.meta.paramNames;
  }
}

/**
 * Creates a PreparedQuery. Call this once at startup or module scope.
 *
 * The fragment's params are inspected to extract the param name order.
 * At call time, only the ParamBuffer is filled — no parsing, no validation,
 * no hashing, no array spreading.
 *
 * @example
 * ```ts
 * const findUserById = prepare<User, { id: number }>(
 *   adapter,
 *   sql`SELECT * FROM users WHERE id = ${0}`,  // placeholder value, not used
 *   ["id"],
 * );
 *
 * // Hot path — only param binding + adapter call
 * const user = await findUserById.first({ id: 42 });
 * ```
 */
export function prepare<T, P extends Record<string, unknown> = Record<string, never>>(
  adapter: IDbAdapter,
  fragment: SqlFragment,
  paramNames: readonly string[],
): PreparedQuery<T, P> {
  return new PreparedQuery<T, P>(adapter, fragment, paramNames);
}
