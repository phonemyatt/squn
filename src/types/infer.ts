import type { ColumnDef } from "./col.ts";
import type { ColumnMap, TableDefinition } from "./table.ts";

// ── Key utilities ─────────────────────────────────────────────────────

/** Union of column names where isNullable is true. */
export type NullableKeys<T extends TableDefinition> = {
  [K in keyof T["columns"] & string]: T["columns"][K] extends ColumnDef<infer _T, true, infer _R> ? K : never;
}[keyof T["columns"] & string];

/** Union of column names where isNullable is false. */
export type NotNullKeys<T extends TableDefinition> = {
  [K in keyof T["columns"] & string]: T["columns"][K] extends ColumnDef<infer _T, true, infer _R> ? never : K;
}[keyof T["columns"] & string];

/** Union of column names where isReadonly is true. */
export type ReadonlyKeys<T extends TableDefinition> = {
  [K in keyof T["columns"] & string]: T["columns"][K] extends ColumnDef<infer _T, infer _N, true> ? K : never;
}[keyof T["columns"] & string];

/** Union of column names where isReadonly is false (writable). */
export type MutableKeys<T extends TableDefinition> = {
  [K in keyof T["columns"] & string]: T["columns"][K] extends ColumnDef<infer _T, infer _N, true> ? never : K;
}[keyof T["columns"] & string];

/** true if column K is nullable, false otherwise. */
export type IsNullable<T extends TableDefinition, K extends keyof T["columns"]> =
  T["columns"][K] extends ColumnDef<infer _T, true, infer _R> ? true : false;

// ── Model inference ───────────────────────────────────────────────────

/** Full row type with nullability — every column included. */
export type InferModel<T extends TableDefinition> = {
  [K in keyof T["columns"] & string]: T["columns"][K]["_type"];
};

/** Insert shape — primaryKey and readonly columns excluded. */
export type InferInsert<T extends TableDefinition> = {
  [K in MutableKeys<T>]: T["columns"][K]["_type"];
};

/** Update shape — readonly columns excluded, all remaining fields optional. */
export type InferUpdate<T extends TableDefinition> = {
  [K in MutableKeys<T>]?: T["columns"][K]["_type"];
};

/** Only the fields marked readonly. */
export type InferReadonlyModel<T extends TableDefinition> = {
  [K in ReadonlyKeys<T>]: T["columns"][K]["_type"];
};

/** Narrowed shape — only the selected column keys. */
export type InferSelect<T extends TableDefinition, K extends keyof T["columns"] & string> = {
  [P in K]: T["columns"][P]["_type"];
};

/**
 * TypeScript type from a TableType TVP definition.
 * TableType shares the same ColumnMap structure as TableDefinition,
 * so this utility extracts the model shape identically.
 */
export type InferTableType<T extends { columns: ColumnMap }> = {
  [K in keyof T["columns"] & string]: T["columns"][K]["_type"];
};
