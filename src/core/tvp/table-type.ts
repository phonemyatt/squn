/**
 * Represents a Table-Valued Parameter type definition.
 * Schema maps column names to database type strings (e.g. "nvarchar(100)", "int").
 */
export class TableType<Schema extends Record<string, string>> {
  readonly name: string;
  readonly schema: Schema;

  constructor(name: string, schema: Schema) {
    this.name = name;
    this.schema = schema;
  }
}

/**
 * Infers the row shape from a TableType's schema.
 * All values are typed as unknown since the schema holds db type strings.
 */
export type InferTableType<T extends TableType<Record<string, string>>> =
  T extends TableType<infer S>
    ? { [K in keyof S]: unknown }
    : never;
