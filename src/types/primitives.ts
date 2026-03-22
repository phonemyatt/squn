/** A raw row returned by the database driver before any mapping. */
export type Row = Record<string, unknown>;

/** A plain parameter object passed to executeBatch rows. */
export type Params = Record<string, unknown>;

/** The resolved database type for a single column value. */
export type ColumnValue = string | number | boolean | null | Date | Buffer | unknown[];
