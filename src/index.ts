// Public exports — the entire surface area of Squn.
//
// Visibility legend (full TSDoc tags live on each declaration):
//   @public  — stable, semver-guarded, intended for library consumers
//   @internal — exported for intra-package use or advanced extension; may change without notice
//
// Quick reference — @internal items:
//   wrapError, buildParams, BuildResult, SQUN_REGEX, BunSqlStatsFacade,
//   ParamBuffer, QueryCache, CompiledQuery, globalMapperRegistry,
//   compileMapper, TypeHandler, TypeHandlerRegistry, detectInjection,
//   isSqlFragment, isTvpValue, maskConnectionString, maskUrl, validateUrl,
//   SQUN_ENV_VARS, validateConfig, validateProductionConfig, resolveConfig

// Adapters
export type {
  IDbAdapter,
  IDbTransaction,
  TvpMaterialised,
} from "./adapters/base.ts";
export { MssqlAdapter } from "./adapters/mssql.ts";
export { MysqlAdapter } from "./adapters/mysql.ts";
export { PostgresAdapter } from "./adapters/postgres.ts";
export { SqliteAdapter } from "./adapters/sqlite.ts";
export { execute, executeBatch, insert, update } from "./api/execute.ts";
// API
export { PreparedQuery, prepare } from "./api/prepared.ts";
export { execProc, queryProc } from "./api/proc.ts";
export {
  query,
  queryFirst,
  queryMultiple,
  queryScalar,
  querySingle,
  stream,
} from "./api/query.ts";
export { QueryBuilder, queryBuilder } from "./api/query-builder.ts";
export { TransactionClock } from "./async/clock.ts";
// Async
export { concurrent } from "./async/concurrent.ts";
export { Cursor } from "./async/cursor.ts";
export { resolveTimeout, withTimeout } from "./async/timeout.ts";
export { maskConnectionString } from "./auth/mask.ts";
// Auth
export type { AuthConfig } from "./auth/types.ts";
export { validateAuth } from "./auth/validate-auth.ts";
export { ParamBuffer } from "./cache/param-buffer.ts";
export type { CompiledQuery } from "./cache/query-cache.ts";
// Cache
export { QueryCache } from "./cache/query-cache.ts";
// Config
export { SQUN_ENV_VARS } from "./config/env-vars.ts";
export { resolveConfig } from "./config/resolve.ts";
export type {
  AdapterType,
  AuthType,
  AzureAdConfig,
  CacheConfig,
  ConnectionConfig,
  Environment,
  LogConfig,
  PoolConfig,
  SecurityConfig,
  SqunConfig,
  TimeoutConfig,
} from "./config/types.ts";
export { maskUrl, validateUrl } from "./config/url-validator.ts";
export { validateConfig } from "./config/validate.ts";
export { validateProductionConfig } from "./config/validate-production.ts";
export { FailoverGroup } from "./connections/failover.ts";
export { ConnectionGroup } from "./connections/group.ts";
// Connections
export { ConnectionRegistry } from "./connections/registry.ts";
export { resolveConnection } from "./connections/resolve-connection.ts";
export type { TenantResolver } from "./connections/tenant-resolver.ts";
export { forTenant, withTenant } from "./connections/tenant-resolver.ts";
export type {
  AtomicOptions as MultiAtomicOptions,
  ConnectionMap as MultiConnectionMap,
  ExecuteOptions,
  GroupConfig,
  MultiDbConfig,
  QueryOptions,
  ScopedDb,
  StreamOptions,
} from "./connections/types.ts";
// Core
export { buildParams } from "./core/param-builder.ts";
export { TableType } from "./core/tvp/table-type.ts";
export { tvp } from "./core/tvp/tvp-builder.ts";
export type { TypeHandler } from "./core/type-handler.ts";
export { TypeHandlerRegistry } from "./core/type-handler.ts";
export type { RowMapper } from "./core/type-mapper.ts";
export { compileMapper } from "./core/type-mapper.ts";
export type { Db, MultiDb } from "./db.ts";
// Entry points
export { createConnections, createDb } from "./db.ts";
export { SqunError } from "./errors/base.ts";
// Errors
export { ErrorCode } from "./errors/codes.ts";
export type { ErrorContext } from "./errors/context.ts";
export {
  AdapterError,
  AuthError,
  ConnectionError,
  MappingError,
  QueryError,
  ReadonlyViolationError,
  SecurityError,
  SqunConfigError,
  TimeoutError,
  TransactionError,
  ValidationError,
} from "./errors/types.ts";
export { wrapError } from "./errors/wrap.ts";
export { consoleLogger } from "./logging/console-logger.ts";
export { jsonLogger } from "./logging/json-logger.ts";
export type { LogEntry, SqunLogger } from "./logging/logger.ts";
// Logging
export { EventCode } from "./logging/logger.ts";
export { noopLogger } from "./logging/noop-logger.ts";
export { Entity } from "./mapping/decorators/entity.ts";
export {
  Email,
  getValidationRules,
  Max,
  Min,
  NotNull,
} from "./mapping/decorators/validate.ts";
// Mapping
export { defineMapper } from "./mapping/define-mapper.ts";
export { globalMapperRegistry, MapperRegistry } from "./mapping/mapper-registry.ts";
export { splitAndMap } from "./mapping/nested-mapper.ts";
export { PooledConnection } from "./pool/connection.ts";
// Pool
export { ConnectionPool } from "./pool/pool.ts";
export type { PoolStatsSnapshot } from "./pool/stats.ts";
export { BunSqlStatsFacade, PoolStats } from "./pool/stats.ts";
export { Readonly } from "./readonly/freeze.ts";
// Readonly
export { assertWritable } from "./readonly/guard.ts";
export { createRouter } from "./readonly/router.ts";
export { formatSql } from "./sql/formatter.ts";
export type { SqlFragment, TvpValue } from "./sql/fragment.ts";
export { isSqlFragment, isTvpValue } from "./sql/fragment.ts";
export {
  sqlIdentifier,
  sqlIf,
  sqlJoin,
  sqlQualifiedIdentifier,
  sqlRaw,
} from "./sql/helpers.ts";
export type { DetectionResult, Severity } from "./sql/injection-detector.ts";
export { detectInjection } from "./sql/injection-detector.ts";
export { SQUN_REGEX } from "./sql/regex.ts";
// SQL authoring
export { sql } from "./sql/tag.ts";
export { validateSql } from "./sql/validator.ts";
export type {
  AtomicExecutor,
  AtomicOptions as AtomicBlockOptions,
} from "./transaction/atomic.ts";
export { AtomicNestingError, runAtomically } from "./transaction/atomic.ts";
export {
  isDeadlock,
  retryWithDeadlockBackoff,
} from "./transaction/deadlock.ts";
export { IsolationLevel } from "./transaction/isolation.ts";
export { Savepoint } from "./transaction/savepoint.ts";
// Transaction
export { Transaction } from "./transaction/transaction.ts";
export type { ColumnDef } from "./types/col.ts";
// Type system
export { col } from "./types/col.ts";
export type {
  InferInsert,
  InferModel,
  InferReadonlyModel,
  InferSelect,
  InferTableType,
  InferUpdate,
  IsNullable,
  MutableKeys,
  NotNullKeys,
  NullableKeys,
  ReadonlyKeys,
} from "./types/infer.ts";
export type { ColumnValue, Params, Row } from "./types/primitives.ts";
export type { ColumnMap, TableDefinition } from "./types/table.ts";
export { defineTable } from "./types/table.ts";
