import type { ColumnDef } from "./col.ts";

/** A map of column names to their ColumnDef definitions. */
export type ColumnMap = Record<string, ColumnDef>;

/** The shape returned by defineTable() — carries table name and column map at the type level. */
export interface TableDefinition<
  Name extends string = string,
  Columns extends ColumnMap = ColumnMap,
> {
  readonly __brand: "TableDefinition";
  readonly tableName: Name;
  readonly columns: Columns;
  readonly columnNames: readonly (keyof Columns & string)[];
}

/**
 * Defines a table schema for use with Squn's type system.
 *
 * The returned definition is used by InferModel, InferInsert, InferUpdate,
 * and all query methods that accept a table reference. It carries the table
 * name and the full column map at the type level.
 */
export function defineTable<
  Name extends string,
  Columns extends ColumnMap,
>(tableName: Name, columns: Columns): TableDefinition<Name, Columns> {
  return {
    __brand: "TableDefinition" as const,
    tableName,
    columns,
    columnNames: Object.keys(columns) as (keyof Columns & string)[],
  };
}
