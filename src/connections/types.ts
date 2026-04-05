import type { IDbAdapter } from "../adapters/base.ts";
import type { PreparedQuery } from "../api/prepared.ts";
import type { SqunConfig } from "../config/types.ts";
import type { SqlFragment } from "../sql/fragment.ts";
import type { AtomicExecutor, AtomicOptions as TxAtomicOptions } from "../transaction/atomic.ts";
import type { Transaction } from "../transaction/transaction.ts";

/** Map of named connections. */
export type ConnectionMap = Record<string, IDbAdapter>;

/** Config for createConnections(). */
export interface MultiDbConfig {
  readonly connections: ConnectionMap;
  readonly default: string;
  readonly overrides?: Record<string, Partial<SqunConfig>>;
  readonly groups?: Record<string, GroupConfig>;
}

export interface GroupConfig {
  readonly write: string;
  readonly read: readonly string[];
  readonly readMode?: "round-robin" | "least-load" | "random";
}

/** Query options — connection field uses Names union or never for single-db. */
export interface QueryOptions<Names extends string = never> {
  readonly connection?: [Names] extends [never] ? never : Names;
  readonly timeoutMs?: number;
  readonly cache?: boolean;
  readonly strict?: boolean;
}

export interface ExecuteOptions<Names extends string = never> {
  readonly connection?: [Names] extends [never] ? never : Names;
  readonly timeoutMs?: number;
}

export interface StreamOptions<Names extends string = never> {
  readonly connection?: [Names] extends [never] ? never : Names;
  readonly timeoutMs?: number;
  readonly batchSize?: number;
}

export interface AtomicOptions<Names extends string = never> {
  readonly connection?: [Names] extends [never] ? never : Names;
  readonly timeoutMs?: number;
  readonly retryOnError?: boolean;
  readonly maxRetries?: number;
  readonly retryDelayMs?: number;
}

/** A scoped Db bound to a specific named connection via .use(). */
export interface ScopedDb<Names extends string = never> {
  readonly connectionName: Names;

  query<T>(fragment: SqlFragment): Promise<T[]>;
  queryFirst<T>(fragment: SqlFragment): Promise<T | null>;
  querySingle<T>(fragment: SqlFragment): Promise<T>;
  queryScalar<T>(fragment: SqlFragment): Promise<T>;
  execute(fragment: SqlFragment): Promise<{ rowsAffected: number }>;
  executeBatch(
    fragment: SqlFragment,
    rows: readonly Record<string, unknown>[],
    options?: { strategy?: "prepared-loop" | "copy" | "bulk-load" },
  ): Promise<{ rowsAffected: number }>;
  stream<T>(fragment: SqlFragment, batchSize?: number): AsyncIterableIterator<T>;
  atomically<T>(
    fn: (q: AtomicExecutor) => Promise<T>,
    options?: TxAtomicOptions,
  ): Promise<T>;
  transaction(fn: (tx: Transaction) => Promise<void>): Promise<void>;
  prepare<T, P extends Record<string, unknown>>(
    fragment: SqlFragment,
    paramNames: readonly string[],
  ): PreparedQuery<T, P>;
}
