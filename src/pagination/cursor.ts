import type { IDbAdapter } from "../adapters/base.ts";
import { ErrorCode } from "../errors/codes.ts";
import { ValidationError } from "../errors/types.ts";
import type { SqlFragment } from "../sql/fragment.ts";
import { createFragment } from "../sql/fragment.ts";
import type { Row } from "../types/primitives.ts";

/**
 * The opaque payload encoded inside a cursor string.
 * @internal
 */
interface CursorPayload {
  readonly value: unknown;
  readonly id: unknown;
}

/**
 * Encodes a cursor payload to a base64 JSON string.
 * @internal
 */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Decodes a base64 JSON cursor string back to a `CursorPayload`.
 * Throws `ValidationError` if the string is not valid.
 * @internal
 */
export function decodeCursor(cursor: string): CursorPayload {
  let raw: string;
  try {
    raw = Buffer.from(cursor, "base64").toString("utf8");
  } catch {
    throw new ValidationError(ErrorCode.PARAM_MISSING, "Invalid cursor: base64 decode failed", {
      operation: "decodeCursor",
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError(ErrorCode.PARAM_MISSING, "Invalid cursor: JSON parse failed", {
      operation: "decodeCursor",
    });
  }

  if (typeof parsed !== "object" || parsed === null || !("value" in parsed) || !("id" in parsed)) {
    throw new ValidationError(
      ErrorCode.PARAM_MISSING,
      "Invalid cursor: missing required fields (value, id)",
      { operation: "decodeCursor" },
    );
  }

  return parsed as CursorPayload;
}

/**
 * Result of a cursor-based paginated query.
 * @public
 */
export interface CursorPage<T> {
  readonly rows: T[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly hasNext: boolean;
}

/**
 * Options for cursor pagination.
 * @public
 */
export interface CursorPageOptions {
  /** Opaque cursor string returned from a previous page (undefined = first page). */
  readonly cursor?: string;
  /** Maximum number of rows to return. */
  readonly limit: number;
  /** The column used for cursor-based ordering (must be unique or near-unique). */
  readonly cursorColumn: string;
  /** Sort direction. Defaults to `'asc'`. */
  readonly direction?: "asc" | "desc";
}

/**
 * Executes a cursor-paginated query against `adapter`.
 *
 * Decodes the incoming cursor (if any), appends a `WHERE cursorColumn > $n` clause
 * (or `<` for `desc`), adds `ORDER BY cursorColumn LIMIT limit+1`, and trims the
 * extra row to signal `hasNext`.
 *
 * Returns a `CursorPage<T>` with `nextCursor` / `prevCursor` set when applicable.
 *
 * @public
 */
export async function cursorPage<T>(
  adapter: IDbAdapter,
  fragment: SqlFragment,
  options: CursorPageOptions,
): Promise<CursorPage<T>> {
  const { cursor, limit, cursorColumn, direction = "asc" } = options;

  const operator = direction === "asc" ? ">" : "<";
  const orderDir = direction === "asc" ? "ASC" : "DESC";

  let queryText: string;
  let queryParams: readonly unknown[];

  if (cursor !== undefined) {
    const payload = decodeCursor(cursor);
    const existingParamCount = fragment.params.length;
    queryText = `${fragment.text} AND "${cursorColumn}" ${operator} $${existingParamCount + 1} ORDER BY "${cursorColumn}" ${orderDir} LIMIT $${existingParamCount + 2}`;
    queryParams = [...fragment.params, payload.value, limit + 1];
  } else {
    const existingParamCount = fragment.params.length;
    queryText = `${fragment.text} ORDER BY "${cursorColumn}" ${orderDir} LIMIT $${existingParamCount + 1}`;
    queryParams = [...fragment.params, limit + 1];
  }

  const queryFragment = createFragment(queryText, queryParams, [...fragment.tvpValues]);
  const rawRows = (await adapter.query(queryFragment.text, queryFragment.params)) as Row[];

  const hasNext = rawRows.length > limit;
  const trimmedRows: Row[] = hasNext ? rawRows.slice(0, limit) : rawRows;
  const rows = trimmedRows as unknown as T[];

  // Build nextCursor from the last returned row
  let nextCursor: string | null = null;
  if (hasNext) {
    const lastRow = trimmedRows[trimmedRows.length - 1];
    if (lastRow !== undefined) {
      nextCursor = encodeCursor({ value: lastRow[cursorColumn], id: lastRow.id ?? null });
    }
  }

  // Build prevCursor from the first returned row (only meaningful when a cursor was passed in)
  let prevCursor: string | null = null;
  if (cursor !== undefined) {
    const firstRow = trimmedRows[0];
    if (firstRow !== undefined) {
      prevCursor = encodeCursor({ value: firstRow[cursorColumn], id: firstRow.id ?? null });
    }
  }

  return {
    rows,
    nextCursor,
    prevCursor,
    hasNext,
  } satisfies CursorPage<T>;
}
