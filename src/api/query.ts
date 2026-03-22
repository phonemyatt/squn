import type { IDbAdapter } from "../adapters/base.ts";
import type { SqlFragment } from "../sql/fragment.ts";
import type { Row } from "../types/primitives.ts";
import { ErrorCode } from "../errors/codes.ts";
import { QueryError } from "../errors/types.ts";

/** Returns T[] — zero or more rows. */
export async function query<T>(
  adapter: IDbAdapter,
  fragment: SqlFragment,
): Promise<T[]> {
  const rows = await adapter.query(fragment.text, [...fragment.params]);
  return rows as T[];
}

/** Returns T | null — first row or null. */
export async function queryFirst<T>(
  adapter: IDbAdapter,
  fragment: SqlFragment,
): Promise<T | null> {
  const rows = await adapter.query(fragment.text, [...fragment.params]);
  if (rows.length === 0) return null;
  return rows[0] as T;
}

/** Returns T — exactly one row, throws on 0 or >1. */
export async function querySingle<T>(
  adapter: IDbAdapter,
  fragment: SqlFragment,
  strict: boolean = true,
): Promise<T> {
  const rows = await adapter.query(fragment.text, [...fragment.params]);

  if (rows.length === 0) {
    if (!strict) return null as T;
    throw new QueryError(
      ErrorCode.NO_ROWS_FOUND,
      "querySingle() returned zero rows",
      { operation: "querySingle", sql: fragment.text },
    );
  }

  if (rows.length > 1) {
    throw new QueryError(
      ErrorCode.MULTIPLE_ROWS_FOUND,
      `querySingle() returned ${rows.length} rows, expected exactly one`,
      { operation: "querySingle", sql: fragment.text },
    );
  }

  return rows[0] as T;
}

/** Returns T — first column of first row. */
export async function queryScalar<T>(
  adapter: IDbAdapter,
  fragment: SqlFragment,
): Promise<T> {
  const rows = await adapter.query(fragment.text, [...fragment.params]);
  if (rows.length === 0) {
    throw new QueryError(
      ErrorCode.NO_ROWS_FOUND,
      "queryScalar() returned zero rows",
      { operation: "queryScalar", sql: fragment.text },
    );
  }
  const firstRow = rows[0] as Row;
  const keys = Object.keys(firstRow);
  const firstKey = keys[0];
  if (firstKey === undefined) {
    throw new QueryError(
      ErrorCode.NO_ROWS_FOUND,
      "queryScalar() row has no columns",
      { operation: "queryScalar", sql: fragment.text },
    );
  }
  return firstRow[firstKey] as T;
}

/** Returns multiple result sets. */
export async function queryMultiple(
  adapter: IDbAdapter,
  fragment: SqlFragment,
): Promise<Row[][]> {
  return adapter.queryMultiple(fragment.text, [...fragment.params]);
}

/** AsyncIterableIterator<T> — streaming cursor with configurable batch size. */
export async function* stream<T>(
  adapter: IDbAdapter,
  fragment: SqlFragment,
  batchSize: number = 100,
): AsyncIterableIterator<T> {
  // For adapters without native cursor support, fetch all and yield in batches
  const rows = await adapter.query(fragment.text, [...fragment.params]);
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    for (const row of batch) {
      yield row as T;
    }
  }
}
