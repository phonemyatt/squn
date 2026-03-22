// Public exports — the entire surface area of Squn.

// Entry points
export { createDb, createConnections } from "./db.ts";
export type { Db, MultiDb } from "./db.ts";

// SQL authoring
export { sql } from "./sql/tag.ts";
export { sqlIf, sqlJoin, sqlRaw, sqlIdentifier, sqlQualifiedIdentifier } from "./sql/helpers.ts";
export { formatSql } from "./sql/formatter.ts";
export { validateSql } from "./sql/validator.ts";
export { detectInjection } from "./sql/injection-detector.ts";
export { SQUN_REGEX } from "./sql/regex.ts";
export type { SqlFragment, TvpValue } from "./sql/fragment.ts";
export { isSqlFragment, isTvpValue } from "./sql/fragment.ts";

// Type system
export { col } from "./types/col.ts";
export type { ColumnDef } from "./types/col.ts";
export { defineTable } from "./types/table.ts";
export type { ColumnMap, TableDefinition } from "./types/table.ts";
export type {
  InferModel, InferInsert, InferUpdate, InferReadonlyModel,
  InferSelect, InferTableType,
  NullableKeys, NotNullKeys, ReadonlyKeys, MutableKeys, IsNullable,
} from "./types/infer.ts";
export type { Row, Params, ColumnValue } from "./types/primitives.ts";

// Errors
export { ErrorCode } from "./errors/codes.ts";
export type { ErrorContext } from "./errors/context.ts";
export { SqunError } from "./errors/base.ts";
export {
  ConnectionError, QueryError, MappingError, ValidationError,
  TransactionError, TimeoutError, AdapterError,
  ReadonlyViolationError, SecurityError, SqunConfigError, AuthError,
} from "./errors/types.ts";
export { wrapError } from "./errors/wrap.ts";

// Logging
export { EventCode } from "./logging/logger.ts";
export type { LogEntry, SqunLogger } from "./logging/logger.ts";
export { consoleLogger } from "./logging/console-logger.ts";
export { jsonLogger } from "./logging/json-logger.ts";
export { noopLogger } from "./logging/noop-logger.ts";

// Config
export { SQUN_ENV_VARS } from "./config/env-vars.ts";
export type {
  Environment, AdapterType, AuthType, SqunConfig,
  ConnectionConfig, PoolConfig, TimeoutConfig, CacheConfig,
  SecurityConfig, LogConfig, AzureAdConfig,
} from "./config/types.ts";
export { resolveConfig } from "./config/resolve.ts";
export { validateConfig } from "./config/validate.ts";
export { validateProductionConfig } from "./config/validate-production.ts";
export { validateUrl, maskUrl } from "./config/url-validator.ts";

// Auth
export type { AuthConfig } from "./auth/types.ts";
export { validateAuth } from "./auth/validate-auth.ts";
export { maskConnectionString } from "./auth/mask.ts";

// Cache
export { QueryCache } from "./cache/query-cache.ts";
export type { CompiledQuery } from "./cache/query-cache.ts";
export { ParamBuffer } from "./cache/param-buffer.ts";

// Core
export { buildParams } from "./core/param-builder.ts";
export { TypeHandlerRegistry } from "./core/type-handler.ts";
export type { TypeHandler } from "./core/type-handler.ts";
export { compileMapper } from "./core/type-mapper.ts";
export type { RowMapper } from "./core/type-mapper.ts";

// Async
export { resolveTimeout, withTimeout } from "./async/timeout.ts";
export { TransactionClock } from "./async/clock.ts";

// Transaction
export { Transaction } from "./transaction/transaction.ts";
export { runAtomically, AtomicNestingError } from "./transaction/atomic.ts";
export type { AtomicExecutor, AtomicOptions as AtomicBlockOptions } from "./transaction/atomic.ts";
export { Savepoint } from "./transaction/savepoint.ts";
export { IsolationLevel } from "./transaction/isolation.ts";
export { isDeadlock, retryWithDeadlockBackoff } from "./transaction/deadlock.ts";

// Adapters
export type { IDbAdapter, IDbTransaction, TvpMaterialised } from "./adapters/base.ts";
export { SqliteAdapter } from "./adapters/sqlite.ts";
export { PostgresAdapter } from "./adapters/postgres.ts";
export { MysqlAdapter } from "./adapters/mysql.ts";
export { MssqlAdapter } from "./adapters/mssql.ts";

// Pool
export { ConnectionPool } from "./pool/pool.ts";
export { PooledConnection } from "./pool/connection.ts";
export { PoolStats, BunSqlStatsFacade } from "./pool/stats.ts";
export type { PoolStatsSnapshot } from "./pool/stats.ts";

// Mapping
export { defineMapper } from "./mapping/define-mapper.ts";
export { globalMapperRegistry } from "./mapping/mapper-registry.ts";
export { Entity } from "./mapping/decorators/entity.ts";
export { splitAndMap } from "./mapping/nested-mapper.ts";

// Readonly
export { assertWritable } from "./readonly/guard.ts";
export { Readonly } from "./readonly/freeze.ts";
export { createRouter } from "./readonly/router.ts";

// Connections
export { ConnectionRegistry } from "./connections/registry.ts";
export { ConnectionGroup } from "./connections/group.ts";
export { FailoverGroup } from "./connections/failover.ts";
export { resolveConnection } from "./connections/resolve-connection.ts";
export type {
  ConnectionMap as MultiConnectionMap, MultiDbConfig,
  QueryOptions, ExecuteOptions, StreamOptions,
  AtomicOptions as MultiAtomicOptions, ScopedDb, GroupConfig,
} from "./connections/types.ts";

// API
export { query, queryFirst, querySingle, queryScalar, queryMultiple, stream } from "./api/query.ts";
export { execute, executeBatch, insert, update } from "./api/execute.ts";
export { queryProc, execProc } from "./api/proc.ts";
export { queryBuilder, QueryBuilder } from "./api/query-builder.ts";
