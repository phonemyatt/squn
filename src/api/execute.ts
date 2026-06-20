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

/** Single prepared statement executed once per row via adapter-native batch. */
export function executeBatch(
  adapter: IDbAdapter,
  fragment: SqlFragment,
  rows: readonly Record<string, unknown>[],
  options?: { strategy?: "prepared-loop" | "copy" | "bulk-load" },
): Promise<{ rowsAffected: number }> {
  if (rows.length === 0) return Promise.resolve({ rowsAffected: 0 });
  const built = buildParams(fragment.text, rows[0] ?? {}, adapter.type);
  return adapter.executeBatch(built.text, rows, built.paramOrder, options?.strategy);
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

/**
 * Typed delete — removes a single row by primary key.
 * @public
 */
export async function deleteRow(
  adapter: IDbAdapter,
  tableName: string,
  pkColumn: string,
  pkValue: unknown,
): Promise<{ rowsAffected: number }> {
  const sql = `DELETE FROM "${tableName}" WHERE "${pkColumn}" = $1`;
  return adapter.execute(sql, [pkValue]);
}

/**
 * Typed upsert — inserts or updates depending on conflict.
 *
 * - PostgreSQL: `INSERT … ON CONFLICT (…) DO UPDATE SET …`
 * - MySQL:      `INSERT … ON DUPLICATE KEY UPDATE …`
 * - SQLite:     `INSERT OR REPLACE INTO …`
 * - MSSQL:      `MERGE INTO … USING (VALUES …) AS src ON … WHEN MATCHED THEN UPDATE … WHEN NOT MATCHED THEN INSERT …`
 *
 * @param conflictColumns  Columns that uniquely identify the row (used by PG/MSSQL).
 * @param updateColumns    Columns to overwrite on conflict — defaults to all non-conflict columns.
 * @public
 */
export async function upsert(
  adapter: IDbAdapter,
  tableName: string,
  data: Record<string, unknown>,
  conflictColumns: readonly string[],
  updateColumns?: readonly string[],
): Promise<{ rowsAffected: number }> {
  const allCols = Object.keys(data);
  const updateCols = updateColumns ?? allCols.filter((c) => !conflictColumns.includes(c));
  const values = allCols.map((c) => data[c]);

  switch (adapter.type) {
    case "postgres": {
      const placeholders = allCols.map((_, i) => `$${i + 1}`).join(", ");
      const colList = allCols.map((c) => `"${c}"`).join(", ");
      const conflictList = conflictColumns.map((c) => `"${c}"`).join(", ");
      const setClauses = updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
      const doClause = setClauses.length > 0 ? `DO UPDATE SET ${setClauses}` : "DO NOTHING";
      const sql = `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT (${conflictList}) ${doClause}`;
      return adapter.execute(sql, values);
    }

    case "mysql": {
      const placeholders = allCols.map((_, i) => `$${i + 1}`).join(", ");
      const colList = allCols.map((c) => `"${c}"`).join(", ");
      const setClauses = updateCols
        .map((c, i) => {
          const paramIdx = allCols.indexOf(c);
          return `"${c}" = $${paramIdx >= 0 ? paramIdx + 1 : allCols.length + i + 1}`;
        })
        .join(", ");
      const sql =
        setClauses.length > 0
          ? `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${setClauses}`
          : `INSERT IGNORE INTO "${tableName}" (${colList}) VALUES (${placeholders})`;
      return adapter.execute(sql, values);
    }

    case "sqlite": {
      const placeholders = allCols.map((_, i) => `$${i + 1}`).join(", ");
      const colList = allCols.map((c) => `"${c}"`).join(", ");
      const sql = `INSERT OR REPLACE INTO "${tableName}" (${colList}) VALUES (${placeholders})`;
      return adapter.execute(sql, values);
    }

    case "mssql": {
      // MERGE uses named params (@p1, @p2, …) like MSSQL adapter expects
      const srcCols = allCols.map((c, i) => `$${i + 1} AS "${c}"`).join(", ");
      const onClauses = conflictColumns.map((c) => `target."${c}" = src."${c}"`).join(" AND ");
      const updateAssignments = updateCols.map((c) => `target."${c}" = src."${c}"`).join(", ");
      const insertCols = allCols.map((c) => `"${c}"`).join(", ");
      const insertSrcCols = allCols.map((c) => `src."${c}"`).join(", ");
      const updateClause =
        updateAssignments.length > 0 ? `WHEN MATCHED THEN UPDATE SET ${updateAssignments}` : "";
      const sql = [
        `MERGE INTO "${tableName}" AS target`,
        `USING (SELECT ${srcCols}) AS src`,
        `ON ${onClauses}`,
        updateClause,
        `WHEN NOT MATCHED THEN INSERT (${insertCols}) VALUES (${insertSrcCols})`,
        `;`,
      ]
        .filter((line) => line.length > 0)
        .join(" ");
      return adapter.execute(sql, values);
    }
  }
}
