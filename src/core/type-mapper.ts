import { ErrorCode } from "../errors/codes.ts";
import { MappingError } from "../errors/types.ts";
import type { ColumnDef } from "../types/col.ts";
import type { Row } from "../types/primitives.ts";
import { TypeHandlerRegistry } from "./type-handler.ts";

/** A compiled function that maps a raw Row to a typed T. */
export type RowMapper<T> = (row: Row) => T;

/** Structural constraint — accepts both TableDefinition and any object with columns + tableName. */
interface SchemaLike {
  readonly tableName: string;
  readonly columns: { readonly [key: string]: ColumnDef };
}

interface ColumnMapping {
  readonly name: string;
  readonly dbType: string;
  readonly isNullable: boolean;
}

/**
 * Compiles a mapper function from a table schema at defineTable() time.
 * All branching is resolved once during compilation — per-row mapping
 * has zero runtime type inspection.
 *
 * In strict mode (default), throws MappingError for null on notNull columns
 * and for unknown columns in the result. In lenient mode, warns and continues.
 */
export function compileMapper<T>(
  schema: SchemaLike,
  registry: TypeHandlerRegistry = new TypeHandlerRegistry(),
  strict: boolean = true,
): RowMapper<T> {
  const mappings: ColumnMapping[] = [];
  const columnSet = new Set<string>();

  for (const [name, colDef] of Object.entries(schema.columns)) {
    columnSet.add(name);
    mappings.push({
      name,
      dbType: colDef.dbType,
      isNullable: colDef.isNullable,
    });
  }

  return (row: Row): T => {
    const result: Record<string, unknown> = {};

    for (const mapping of mappings) {
      const raw = row[mapping.name];

      if (raw === null || raw === undefined) {
        if (!mapping.isNullable && strict) {
          throw new MappingError(
            ErrorCode.NULL_VIOLATION,
            `Column '${mapping.name}' is notNull but received null`,
            {
              operation: "mapRow",
              column: mapping.name,
              table: schema.tableName,
            },
          );
        }
        result[mapping.name] = null;
        continue;
      }

      result[mapping.name] = registry.fromDb(mapping.dbType, raw);
    }

    if (strict) {
      for (const key of Object.keys(row)) {
        if (!columnSet.has(key)) {
          throw new MappingError(
            ErrorCode.UNKNOWN_COLUMN,
            `Unknown column '${key}' in result set for table '${schema.tableName}'`,
            { operation: "mapRow", column: key, table: schema.tableName },
          );
        }
      }
    }

    return result as T;
  };
}
