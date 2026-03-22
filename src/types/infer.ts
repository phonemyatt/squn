import type { ColumnDef } from "./col.ts";

/**
 * Structural constraint for any object that has a columns map with _type fields.
 * Used instead of `extends TableDefinition` so that concrete column types
 * (ColumnBuilder & ColumnDef intersections) satisfy the constraint without
 * needing to match Record<string, ColumnDef> exactly.
 */
type HasColumns = { readonly columns: { readonly [key: string]: { readonly _type: unknown } } };

/** Structural constraint for any object with a ColumnDef-shaped columns map. */
type HasColumnDefs = { readonly columns: { readonly [key: string]: ColumnDef } };

// ── Key utilities ─────────────────────────────────────────────────────

/** Union of column names where isNullable is true. */
export type NullableKeys<T extends HasColumnDefs> = {
  [K in keyof T["columns"] & string]: T["columns"][K] extends ColumnDef<infer _T, true, infer _R> ? K : never;
}[keyof T["columns"] & string];

/** Union of column names where isNullable is false. */
export type NotNullKeys<T extends HasColumnDefs> = {
  [K in keyof T["columns"] & string]: T["columns"][K] extends ColumnDef<infer _T, true, infer _R> ? never : K;
}[keyof T["columns"] & string];

/** Union of column names where isReadonly is true. */
export type ReadonlyKeys<T extends HasColumnDefs> = {
  [K in keyof T["columns"] & string]: T["columns"][K] extends ColumnDef<infer _T, infer _N, true> ? K : never;
}[keyof T["columns"] & string];

/** Union of column names where isReadonly is false (writable). */
export type MutableKeys<T extends HasColumnDefs> = {
  [K in keyof T["columns"] & string]: T["columns"][K] extends ColumnDef<infer _T, infer _N, true> ? never : K;
}[keyof T["columns"] & string];

/** true if column K is nullable, false otherwise. */
export type IsNullable<T extends HasColumnDefs, K extends keyof T["columns"]> =
  T["columns"][K] extends ColumnDef<infer _T, true, infer _R> ? true : false;

// ── Model inference ───────────────────────────────────────────────────

/** Full row type with nullability — every column included. */
export type InferModel<T extends HasColumns> = {
  [K in keyof T["columns"] & string]: T["columns"][K]["_type"];
};

/** Insert shape — primaryKey and readonly columns excluded. */
export type InferInsert<T extends HasColumnDefs> = {
  [K in MutableKeys<T>]: T["columns"][K]["_type"];
};

/** Update shape — readonly columns excluded, all remaining fields optional. */
export type InferUpdate<T extends HasColumnDefs> = {
  [K in MutableKeys<T>]?: T["columns"][K]["_type"];
};

/** Only the fields marked readonly. */
export type InferReadonlyModel<T extends HasColumnDefs> = {
  [K in ReadonlyKeys<T>]: T["columns"][K]["_type"];
};

/** Narrowed shape — only the selected column keys. */
export type InferSelect<T extends HasColumns, K extends keyof T["columns"] & string> = {
  [P in K]: T["columns"][P]["_type"];
};

/**
 * TypeScript type from a TableType TVP definition.
 * TableType shares the same column structure as TableDefinition,
 * so this utility extracts the model shape identically.
 */
export type InferTableType<T extends HasColumns> = {
  [K in keyof T["columns"] & string]: T["columns"][K]["_type"];
};
