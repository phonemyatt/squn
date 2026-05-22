/**
 * Every error code in the library. Grouped by domain, prefixed SQUN_.
 *
 * Codes are string literals so they survive serialisation (JSON logs, structured
 * error responses) without losing meaning. A const enum is used so TypeScript
 * inlines the values at compile time — no runtime object is emitted.
 */
export enum ErrorCode {
  // ── Connection ──────────────────────────────────────────────────────
  CONN_UNKNOWN = "SQUN_CONN_001",
  CONN_MULTI_INVALID = "SQUN_CONN_002",
  CONN_GROUP_NO_WRITE = "SQUN_CONN_003",
  CONN_FAILOVER_EXHAUSTED = "SQUN_CONN_004",
  CONN_TENANT_NOT_FOUND = "SQUN_CONN_005",

  // ── Query ───────────────────────────────────────────────────────────
  QUERY_EXECUTION_FAILED = "SQUN_QUERY_001",
  QUERY_TIMEOUT = "SQUN_QUERY_002",
  NO_ROWS_FOUND = "SQUN_QUERY_003",
  MULTIPLE_ROWS_FOUND = "SQUN_QUERY_004",

  // ── Mapping ─────────────────────────────────────────────────────────
  NULL_VIOLATION = "SQUN_MAP_001",
  UNKNOWN_COLUMN = "SQUN_MAP_002",
  TYPE_CONVERSION_FAILED = "SQUN_MAP_003",

  // ── Validation ──────────────────────────────────────────────────────
  PARAM_MISSING = "SQUN_VAL_001",
  PARAM_EXTRA = "SQUN_VAL_002",
  TVP_SCHEMA_MISMATCH = "SQUN_VAL_003",
  TVP_EMPTY = "SQUN_VAL_004",

  // ── Transaction ─────────────────────────────────────────────────────
  TX_COMMIT_FAILED = "SQUN_TX_001",
  TX_ROLLBACK_FAILED = "SQUN_TX_002",
  TX_ALREADY_CLOSED = "SQUN_TX_003",

  // ── Pool ────────────────────────────────────────────────────────────
  POOL_QUEUE_FULL = "SQUN_POOL_002",

  // ── Adapter ─────────────────────────────────────────────────────────
  ADAPTER_NOT_SUPPORTED = "SQUN_ADPT_001",
  ADAPTER_DRIVER_ERROR = "SQUN_ADPT_002",

  // ── Readonly ────────────────────────────────────────────────────────
  READONLY_WRITE_BLOCKED = "SQUN_READONLY_001",
  READONLY_TX_WRITE = "SQUN_READONLY_002",
  READONLY_EXECUTE_BLOCKED = "SQUN_READONLY_003",
  READONLY_DDL_BLOCKED = "SQUN_READONLY_004",

  // ── Security ────────────────────────────────────────────────────────
  INJECTION_DETECTED = "SQUN_SEC_001",
  INVALID_IDENTIFIER = "SQUN_SEC_002",
  RAW_SQL_BLOCKED = "SQUN_SEC_003",
  SQL_VALIDATION_FAILED = "SQUN_SEC_004",
  MULTI_STATEMENT_BLOCKED = "SQUN_SEC_005",
  PLACEHOLDER_MISMATCH = "SQUN_SEC_006",
  UNRESOLVED_TVP_SENTINEL = "SQUN_SEC_007",

  // ── Config ──────────────────────────────────────────────────────────
  CONFIG_MISSING = "SQUN_CFG_001",
  CONFIG_INVALID_VALUE = "SQUN_CFG_002",
  CONFIG_PRODUCTION_GUARD = "SQUN_CFG_003",
  CONFIG_URL_MALFORMED = "SQUN_CFG_004",
  CONFIG_ENV_CONFLICT = "SQUN_CFG_005",

  // ── Auth ────────────────────────────────────────────────────────────
  AUTH_MISSING = "SQUN_AUTH_001",
  AUTH_INVALID_CREDENTIALS = "SQUN_AUTH_002",
  AUTH_UNSUPPORTED_TYPE = "SQUN_AUTH_003",
  AUTH_TOKEN_EXPIRED = "SQUN_AUTH_004",
  AUTH_PROVIDER_FAILED = "SQUN_AUTH_005",

  // ── Internal ────────────────────────────────────────────────────────
  INTERNAL_ERROR = "SQUN_INTERNAL_001",
}
