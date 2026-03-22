import type { IDbAdapter } from "../adapters/base.ts";
import type { SqunConfig } from "../config/types.ts";

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
}
