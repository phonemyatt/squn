import type { IDbAdapter } from "../adapters/base.ts";
import { buildParams } from "../core/param-builder.ts";
import type { SqlFragment } from "../sql/fragment.ts";

/** Returns { rowsAffected }. */
export async function execute(
  adapter: IDbAdapter,
  fragment: SqlFragment,
): Promise<{ rowsAffected: number }> {
  return adapter.execute(fragment.text, fragment.params);
}

/** Single prepared statement executed once per row. */
export async function executeBatch(
  adapter: IDbAdapter,
  fragment: SqlFragment,
  rows: readonly Record<string, unknown>[],
): Promise<{ rowsAffected: number }> {
  let total = 0;
  for (const row of rows) {
    const built = buildParams(fragment.text, row, adapter.type);
    const result = await adapter.execute(built.text, built.params);
    total += result.rowsAffected;
  }
  return { rowsAffected: total };
}

/** Typed insert — data checked against InferInsert at the type level. */
export async function insert(
  adapter: IDbAdapter,
  tableName: string,
  columnNames: readonly string[],
  data: Record<string, unknown>,
): Promise<{ rowsAffected: number }> {
  const cols = columnNames.filter((c) => c in data);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((c) => data[c]);
  const sql = `INSERT INTO "${tableName}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`;
  return adapter.execute(sql, values);
}

/** Typed update — data checked against InferUpdate at the type level. */
export async function update(
  adapter: IDbAdapter,
  tableName: string,
  data: Record<string, unknown>,
  pkColumn: string,
  pkValue: unknown,
): Promise<{ rowsAffected: number }> {
  const cols = Object.keys(data).filter((c) => c !== pkColumn);
  const setClauses = cols.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
  const values = cols.map((c) => data[c]);
  values.push(pkValue);
  const sql = `UPDATE "${tableName}" SET ${setClauses} WHERE "${pkColumn}" = $${values.length}`;
  return adapter.execute(sql, values);
}
