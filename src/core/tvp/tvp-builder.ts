import type { TvpValue } from "../../adapters/base.ts";
import { ErrorCode } from "../../errors/codes.ts";
import { ValidationError } from "../../errors/types.ts";
import type { InferTableType, TableType } from "./table-type.ts";

/**
 * Builds a TvpValue from a TableType and rows.
 * Validates every row has exactly the columns defined in tableType.schema.
 * Throws ValidationError(TVP_SCHEMA_MISMATCH) on column mismatch.
 */
export function tvp<T extends TableType<Record<string, string>>>(
  tableType: T,
  rows: InferTableType<T>[],
): TvpValue {
  const expectedColumns = Object.keys(tableType.schema).sort();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown>;
    const actualColumns = Object.keys(row).sort();

    const missing = expectedColumns.filter((c) => !(c in row));
    const extra = actualColumns.filter((c) => !(c in tableType.schema));

    if (missing.length > 0 || extra.length > 0) {
      throw new ValidationError(
        ErrorCode.TVP_SCHEMA_MISMATCH,
        `TVP row ${i} schema mismatch — missing: [${missing.join(", ")}], extra: [${extra.join(", ")}]`,
        { operation: "tvp", paramKeys: [...missing, ...extra] },
      );
    }
  }

  return {
    __isTvp: true,
    tableType,
    rows: rows as readonly Record<string, unknown>[],
  };
}
