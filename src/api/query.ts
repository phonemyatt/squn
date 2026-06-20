import type { IDbAdapter } from "../adapters/base.ts";
import { Cursor } from "../async/cursor.ts";
import { ErrorCode } from "../errors/codes.ts";
import { QueryError } from "../errors/types.ts";
import { ensureTrailingSemicolon } from "../sql/fragment.ts";
import type { SqlFragment } from "../sql/fragment.ts";
import type { Row } from "../types/primitives.ts";

/** Returns T[] — zero or more rows. */
export async function query<T>(adapter: IDbAdapter, fragment: SqlFragment): Promise<T[]> {
  const rows = await adapter.query(ensureTrailingSemicolon(fragment.text), fragment.params);
  return rows as T[];
}

/** Returns T | null — first row or null. */
export async function queryFirst<T>(adapter: IDbAdapter, fragment: SqlFragment): Promise<T | null> {
  const rows = await adapter.query(ensureTrailingSemicolon(fragment.text), fragment.params);
  if (rows.length === 0) return null;
  return rows[0] as T;
}

/** Returns T — exactly one row, throws on 0 or >1. */
export async function querySingle<T>(
  adapter: IDbAdapter,
  fragment: SqlFragment,
  strict?: true,
): Promise<T>;
/** Returns T | null — first row or null (no error on empty result). Throws on >1 row. */
export async function querySingle<T>(
  adapter: IDbAdapter,
  fragment: SqlFragment,
  strict: false,
): Promise<T | null>;
export async function querySingle<T>(
  adapter: IDbAdapter,
  fragment: SqlFragment,
  strict: boolean = true,
): Promise<T | null> {
  const rows = await adapter.query(ensureTrailingSemicolon(fragment.text), fragment.params);

  if (rows.length === 0) {
    if (!strict) return null;
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

  return rows[0] as T;
}

/** Returns T — first column of first row. */
export async function queryScalar<T>(adapter: IDbAdapter, fragment: SqlFragment): Promise<T> {
  const rows = await adapter.query(ensureTrailingSemicolon(fragment.text), fragment.params);
  if (rows.length === 0) {
    throw new QueryError(ErrorCode.NO_ROWS_FOUND, "queryScalar() returned zero rows", {
      operation: "queryScalar",
      sql: fragment.text,
    });
  }
  const firstRow = rows[0] as Row;
  const keys = Object.keys(firstRow);
  const firstKey = keys[0];
  if (firstKey === undefined) {
    throw new QueryError(ErrorCode.NO_ROWS_FOUND, "queryScalar() row has no columns", {
      operation: "queryScalar",
      sql: fragment.text,
    });
  }
  return firstRow[firstKey] as T;
}

/** Returns multiple result sets. */
export async function queryMultiple(adapter: IDbAdapter, fragment: SqlFragment): Promise<Row[][]> {
  return adapter.queryMultiple(ensureTrailingSemicolon(fragment.text), fragment.params);
}

/** AsyncIterableIterator<T> — streaming cursor with configurable batch size. */
export async function* stream<T>(
  adapter: IDbAdapter,
  fragment: SqlFragment,
  batchSize: number = 100,
): AsyncIterableIterator<T> {
  const cursor = new Cursor<T>(adapter, fragment, batchSize);
  try {
    for await (const row of cursor) {
      yield row;
    }
  } finally {
    await cursor.close();
  }
}
