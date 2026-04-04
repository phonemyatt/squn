import type { IDbAdapter } from "./adapters/base.ts";
import { execute, executeBatch } from "./api/execute.ts";
import type { PreparedQuery } from "./api/prepared.ts";
import { prepare } from "./api/prepared.ts";
import {
  query,
  queryFirst,
  queryMultiple,
  queryScalar,
  querySingle,
  stream,
} from "./api/query.ts";
import { resolveConfig } from "./config/resolve.ts";
import type { SqunConfig } from "./config/types.ts";
import { validateConfig } from "./config/validate.ts";
import { validateProductionConfig } from "./config/validate-production.ts";
import { ConnectionRegistry } from "./connections/registry.ts";
import type {
  AtomicOptions as MultiAtomicOptions,
  ExecuteOptions,
  MultiDbConfig,
  QueryOptions,
  ScopedDb,
  StreamOptions,
} from "./connections/types.ts";
import { noopLogger } from "./logging/noop-logger.ts";
import type { SqlFragment } from "./sql/fragment.ts";
import type { AtomicExecutor, AtomicOptions } from "./transaction/atomic.ts";
import { runAtomically } from "./transaction/atomic.ts";
import { Transaction } from "./transaction/transaction.ts";
import type { Row } from "./types/primitives.ts";

export interface Db {
  readonly adapter: IDbAdapter;
  readonly config: SqunConfig;

  query<T>(fragment: SqlFragment): Promise<T[]>;
  queryFirst<T>(fragment: SqlFragment): Promise<T | null>;
  querySingle<T>(fragment: SqlFragment): Promise<T>;
  queryScalar<T>(fragment: SqlFragment): Promise<T>;
  queryMultiple(fragment: SqlFragment): Promise<Row[][]>;
  execute(fragment: SqlFragment): Promise<{ rowsAffected: number }>;
  executeBatch(
    fragment: SqlFragment,
    rows: readonly Record<string, unknown>[],
  ): Promise<{ rowsAffected: number }>;
  stream<T>(
    fragment: SqlFragment,
    batchSize?: number,
  ): AsyncIterableIterator<T>;
  atomically<T>(
    fn: (q: AtomicExecutor) => Promise<T>,
    options?: AtomicOptions,
  ): Promise<T>;
  transaction(fn: (tx: Transaction) => Promise<void>): Promise<void>;
  prepare<T, P extends Record<string, unknown>>(
    fragment: SqlFragment,
    paramNames: readonly string[],
  ): PreparedQuery<T, P>;
}

/**
 * Single connection entry point.
 * Calls validateProductionConfig() synchronously — app never starts in invalid state.
 */
export function createDb(
  adapter: IDbAdapter,
  userConfig: Partial<SqunConfig> = {},
): Db {
  const config = resolveConfig(userConfig);
  validateConfig(config);

  const logger = config.log?.logger ?? noopLogger;
  validateProductionConfig(
    config,
    adapter.type,
    config.connection ?? {},
    logger,
  );

  return {
    adapter,
    config,
    query<T>(fragment: SqlFragment): Promise<T[]> {
      return query<T>(adapter, fragment);
    },
    queryFirst<T>(fragment: SqlFragment): Promise<T | null> {
      return queryFirst<T>(adapter, fragment);
    },
    querySingle<T>(fragment: SqlFragment): Promise<T> {
      return querySingle<T>(adapter, fragment);
    },
    queryScalar<T>(fragment: SqlFragment): Promise<T> {
      return queryScalar<T>(adapter, fragment);
    },
    queryMultiple(fragment: SqlFragment): Promise<Row[][]> {
      return queryMultiple(adapter, fragment);
    },
    execute(fragment: SqlFragment): Promise<{ rowsAffected: number }> {
      return execute(adapter, fragment);
    },
    executeBatch(
      fragment: SqlFragment,
      rows: readonly Record<string, unknown>[],
    ): Promise<{ rowsAffected: number }> {
      return executeBatch(adapter, fragment, rows);
    },
    stream<T>(
      fragment: SqlFragment,
      batchSize?: number,
    ): AsyncIterableIterator<T> {
      return stream<T>(adapter, fragment, batchSize);
    },
    atomically<T>(
      fn: (q: AtomicExecutor) => Promise<T>,
      options?: AtomicOptions,
    ): Promise<T> {
      return runAtomically(adapter, fn, options);
    },
    async transaction(fn: (tx: Transaction) => Promise<void>): Promise<void> {
      const dbTx = await adapter.beginTransaction();
      const tx = new Transaction(dbTx);
      try {
        await fn(tx);
        if (tx.state === "ACTIVE") {
          await tx.commit();
        }
      } catch (err) {
        if (tx.state === "ACTIVE") {
          await tx.rollback();
        }
        throw err;
      }
    },
    prepare<T, P extends Record<string, unknown>>(
      fragment: SqlFragment,
      paramNames: readonly string[],
    ): PreparedQuery<T, P> {
      return prepare<T, P>(adapter, fragment, paramNames);
    },
  };
}

export interface MultiDb<Names extends string = string> {
  readonly registry: ConnectionRegistry<Names>;
  readonly config: SqunConfig;

  /** Returns a ScopedDb with the named adapter pre-resolved — no connection option needed. */
  use(name: Names): ScopedDb<Names>;

  query<T>(fragment: SqlFragment, options?: QueryOptions<Names>): Promise<T[]>;
  queryFirst<T>(fragment: SqlFragment, options?: QueryOptions<Names>): Promise<T | null>;
  querySingle<T>(fragment: SqlFragment, options?: QueryOptions<Names>): Promise<T>;
  queryScalar<T>(fragment: SqlFragment, options?: QueryOptions<Names>): Promise<T>;
  execute(fragment: SqlFragment, options?: ExecuteOptions<Names>): Promise<{ rowsAffected: number }>;
  executeBatch(
    fragment: SqlFragment,
    rows: readonly Record<string, unknown>[],
    options?: ExecuteOptions<Names>,
  ): Promise<{ rowsAffected: number }>;
  stream<T>(fragment: SqlFragment, options?: StreamOptions<Names>): AsyncIterableIterator<T>;
  atomically<T>(
    fn: (q: AtomicExecutor) => Promise<T>,
    options?: MultiAtomicOptions<Names>,
  ): Promise<T>;
  transaction(
    fn: (tx: Transaction) => Promise<void>,
    options?: { connection?: Names },
  ): Promise<void>;
  concurrent<T extends readonly Promise<unknown>[]>(
    ...queries: T
  ): Promise<{ [K in keyof T]: Awaited<T[K]> }>;
  prepare<T, P extends Record<string, unknown>>(
    fragment: SqlFragment,
    paramNames: readonly string[],
    options?: { connection?: Names },
  ): PreparedQuery<T, P>;
}

/** Builds a ScopedDb that routes every call to the given adapter. */
function makeScopedDb<Names extends string>(
  adapter: IDbAdapter,
  connectionName: Names,
): ScopedDb<Names> {
  return {
    connectionName,
    query: <T>(fragment: SqlFragment) => query<T>(adapter, fragment),
    queryFirst: <T>(fragment: SqlFragment) => queryFirst<T>(adapter, fragment),
    querySingle: <T>(fragment: SqlFragment) => querySingle<T>(adapter, fragment),
    queryScalar: <T>(fragment: SqlFragment) => queryScalar<T>(adapter, fragment),
    execute: (fragment: SqlFragment) => execute(adapter, fragment),
    executeBatch: (fragment: SqlFragment, rows: readonly Record<string, unknown>[]) =>
      executeBatch(adapter, fragment, rows),
    stream: <T>(fragment: SqlFragment, batchSize?: number) =>
      stream<T>(adapter, fragment, batchSize),
    atomically: <T>(fn: (q: AtomicExecutor) => Promise<T>, options?: AtomicOptions) =>
      runAtomically(adapter, fn, options),
    async transaction(fn: (tx: Transaction) => Promise<void>): Promise<void> {
      const dbTx = await adapter.beginTransaction();
      const tx = new Transaction(dbTx);
      try {
        await fn(tx);
        if (tx.state === "ACTIVE") await tx.commit();
      } catch (err) {
        if (tx.state === "ACTIVE") await tx.rollback();
        throw err;
      }
    },
    prepare: <T, P extends Record<string, unknown>>(
      fragment: SqlFragment,
      paramNames: readonly string[],
    ) => prepare<T, P>(adapter, fragment, paramNames),
  };
}

/**
 * Multi-connection entry point.
 * Infers Names = keyof Config["connections"] & string.
 * Validates all connections together at startup.
 */
export function createConnections<
  Config extends MultiDbConfig,
  Names extends string = keyof Config["connections"] & string,
>(multiConfig: Config): MultiDb<Names> {
  const config = resolveConfig({});

  const connections = multiConfig.connections as Record<Names, IDbAdapter>;
  const defaultName = multiConfig.default as Names;

  const registry = new ConnectionRegistry<Names>(connections, defaultName);

  return {
    registry,
    config,

    use(name: Names): ScopedDb<Names> {
      return makeScopedDb(registry.get(name), name);
    },

    query<T>(fragment: SqlFragment, options?: QueryOptions<Names>): Promise<T[]> {
      return query<T>(registry.get(options?.connection), fragment);
    },
    queryFirst<T>(fragment: SqlFragment, options?: QueryOptions<Names>): Promise<T | null> {
      return queryFirst<T>(registry.get(options?.connection), fragment);
    },
    querySingle<T>(fragment: SqlFragment, options?: QueryOptions<Names>): Promise<T> {
      return querySingle<T>(registry.get(options?.connection), fragment);
    },
    queryScalar<T>(fragment: SqlFragment, options?: QueryOptions<Names>): Promise<T> {
      return queryScalar<T>(registry.get(options?.connection), fragment);
    },
    execute(fragment: SqlFragment, options?: ExecuteOptions<Names>): Promise<{ rowsAffected: number }> {
      return execute(registry.get(options?.connection), fragment);
    },
    executeBatch(
      fragment: SqlFragment,
      rows: readonly Record<string, unknown>[],
      options?: ExecuteOptions<Names>,
    ): Promise<{ rowsAffected: number }> {
      return executeBatch(registry.get(options?.connection), fragment, rows);
    },
    stream<T>(fragment: SqlFragment, options?: StreamOptions<Names>): AsyncIterableIterator<T> {
      return stream<T>(registry.get(options?.connection), fragment, options?.batchSize);
    },
    atomically<T>(
      fn: (q: AtomicExecutor) => Promise<T>,
      options?: MultiAtomicOptions<Names>,
    ): Promise<T> {
      return runAtomically(registry.get(options?.connection), fn, options);
    },
    async transaction(
      fn: (tx: Transaction) => Promise<void>,
      options?: { connection?: Names },
    ): Promise<void> {
      const adapter = registry.get(options?.connection);
      const dbTx = await adapter.beginTransaction();
      const tx = new Transaction(dbTx);
      try {
        await fn(tx);
        if (tx.state === "ACTIVE") await tx.commit();
      } catch (err) {
        if (tx.state === "ACTIVE") await tx.rollback();
        throw err;
      }
    },
    concurrent<T extends readonly Promise<unknown>[]>(
      ...queries: T
    ): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
      return Promise.all(queries) as Promise<{ [K in keyof T]: Awaited<T[K]> }>;
    },
    prepare<T, P extends Record<string, unknown>>(
      fragment: SqlFragment,
      paramNames: readonly string[],
      options?: { connection?: Names },
    ): PreparedQuery<T, P> {
      return prepare<T, P>(registry.get(options?.connection), fragment, paramNames);
    },
  };
}
