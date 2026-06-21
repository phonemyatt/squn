import type { IDbAdapter } from "../adapters/base.ts";
import type { SqlFragment } from "../sql/fragment.ts";
import { createFragment } from "../sql/fragment.ts";
import type { Row } from "../types/primitives.ts";

/**
 * Result of an offset-based paginated query.
 * @public
 */
export interface OffsetPage<T> {
  readonly rows: T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
}

/**
 * Options for offset pagination.
 * @public
 */
export interface OffsetPageOptions {
  /** 1-based page number. */
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Executes an offset-paginated query against `adapter`.
 *
 * Appends `LIMIT $n OFFSET $m` to `fragment`, then runs a parallel `SELECT COUNT(*)`
 * wrapping the same fragment as a subquery. Returns a fully-populated `OffsetPage<T>`.
 *
 * @public
 */
export async function offsetPage<T>(
  adapter: IDbAdapter,
  fragment: SqlFragment,
  options: OffsetPageOptions,
): Promise<OffsetPage<T>> {
  const { page, pageSize } = options;

  const offset = (page - 1) * pageSize;
  const existingParamCount = fragment.params.length;

  // Build paged query: append LIMIT / OFFSET params after existing ones
  const pagedText = `${fragment.text} LIMIT $${existingParamCount + 1} OFFSET $${existingParamCount + 2}`;
  const pagedParams = [...fragment.params, pageSize, offset];
  const pagedFragment = createFragment(pagedText, pagedParams, [...fragment.tvpValues]);

  // Build count query: wrap fragment as subquery
  const countText = `SELECT COUNT(*) AS __count FROM (${fragment.text}) AS __sq`;
  const countFragment = createFragment(countText, [...fragment.params], [...fragment.tvpValues]);

  const [rowResults, countResults] = await Promise.all([
    adapter.query(pagedFragment.text, pagedFragment.params),
    adapter.query(countFragment.text, countFragment.params),
  ]);

  const firstCountRow = countResults[0] as Row | undefined;
  const rawCount =
    firstCountRow !== undefined
      ? (firstCountRow.__count ?? firstCountRow.count ?? firstCountRow["COUNT(*)"] ?? 0)
      : 0;

  const total = typeof rawCount === "number" ? rawCount : Number(rawCount);
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;

  return {
    rows: rowResults as T[],
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  } satisfies OffsetPage<T>;
}
