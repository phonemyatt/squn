import type { Row } from "../types/primitives.ts";

export type AdapterType = "sqlite" | "postgres" | "mysql" | "mssql";

/** Materialised TVP result — replaces a __TVP_N__ sentinel in final SQL. */
export interface TvpMaterialised {
  readonly sqlExpression: string;
  readonly extraParams: readonly unknown[];
  readonly cleanup: () => Promise<void>;
}

/** TVP value extracted from a SqlFragment by the sql tag. */
export interface TvpValue {
  readonly __isTvp: true;
  readonly tableType: unknown;
  readonly rows: readonly Record<string, unknown>[];
}

/** Transaction handle returned by beginTransaction(). */
export interface IDbTransaction {
  execute(sql: string, params: readonly unknown[]): Promise<{ rowsAffected: number }>;
  query(sql: string, params: readonly unknown[]): Promise<Row[]>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  savepoint(name: string): Promise<void>;
  releaseSavepoint(name: string): Promise<void>;
  rollbackToSavepoint(name: string): Promise<void>;
}

/** Database adapter contract — all database-specific behaviour lives here. */
export interface IDbAdapter {
  readonly type: AdapterType;
  execute(sql: string, params: readonly unknown[]): Promise<{ rowsAffected: number }>;
  query(sql: string, params: readonly unknown[]): Promise<Row[]>;
  queryMultiple(sql: string, params: readonly unknown[]): Promise<Row[][]>;
  beginTransaction(): Promise<IDbTransaction>;
  ping(): Promise<void>;
  close(): Promise<void>;
  materializeTvp(tvp: TvpValue, index: number): Promise<TvpMaterialised>;
}
