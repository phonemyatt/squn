import type { TvpMaterialised, TvpValue } from "../../../adapters/base.ts";
import type { TableType } from "../table-type.ts";

/**
 * Materializes a TVP using PostgreSQL unnest().
 *
 * Returns: unnest($N::type[], $M::type[], ...) AS t(col1, col2, ...)
 * extraParams = one array per column, containing all row values for that column.
 * Params are appended after the existing fragment params (index is the offset).
 */
export function materializeTvpUnnest(
  tvp: TvpValue,
  paramOffset: number,
): TvpMaterialised {
  const tableType = tvp.tableType as TableType<Record<string, string>>;
  const columns = Object.keys(tableType.schema);

  const extraParams: unknown[] = columns.map((col) =>
    tvp.rows.map((row) => row[col]),
  );

  const unnestArgs = columns.map((col, i) => {
    const dbType = tableType.schema[col];
    return `$${paramOffset + i + 1}::${dbType}[]`;
  });

  const colAliases = columns.map((c) => `"${c}"`).join(", ");
  const sqlExpression = `unnest(${unnestArgs.join(", ")}) AS t(${colAliases})`;

  return {
    sqlExpression,
    extraParams,
    cleanup: async () => {
      // unnest is inline — no cleanup needed
    },
  };
}
