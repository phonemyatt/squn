import type { TvpMaterialised, TvpValue } from "../../../adapters/base.ts";
import type { TableType } from "../table-type.ts";

/** Module-level atomic counter for unique temp table names. */
let tempTableCounter = 0;

/**
 * Materializes a TVP using a temporary table.
 * Used by SQLite and MySQL adapters.
 *
 * Strategy:
 * 1. Generate a unique temp table name using an incrementing counter.
 * 2. Create the temp table with the TVP schema.
 * 3. Insert all rows in a single multi-VALUES statement.
 * 4. Return sqlExpression = the temp table name.
 * 5. cleanup() drops the temp table.
 */
export async function materializeTvpTempTable(
  tvp: TvpValue,
  execute: (sql: string, params: readonly unknown[]) => Promise<unknown>,
): Promise<TvpMaterialised> {
  const tableType = tvp.tableType as TableType<Record<string, string>>;
  const tableName = `_squn_tvp_${++tempTableCounter}`;
  const columns = Object.keys(tableType.schema);

  // Build CREATE TEMP TABLE statement
  const columnDefs = columns.map((col) => `"${col}" ${tableType.schema[col]}`).join(", ");
  await execute(`CREATE TEMP TABLE "${tableName}" (${columnDefs})`, []);

  // Insert all rows in a single VALUES statement
  if (tvp.rows.length > 0) {
    const placeholders = tvp.rows.map(() => {
      const rowPlaceholders = columns.map(() => `?`);
      return `(${rowPlaceholders.join(", ")})`;
    });
    const flatParams: unknown[] = [];
    for (const row of tvp.rows) {
      for (const col of columns) {
        flatParams.push(row[col]);
      }
    }
    await execute(
      `INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES ${placeholders.join(", ")}`,
      flatParams,
    );
  }

  return {
    sqlExpression: `"${tableName}"`,
    extraParams: [],
    cleanup: async () => {
      await execute(`DROP TABLE IF EXISTS "${tableName}"`, []);
    },
  };
}

/** Resets the counter — used in tests to ensure deterministic table names. */
export function resetTempTableCounter(): void {
  tempTableCounter = 0;
}
