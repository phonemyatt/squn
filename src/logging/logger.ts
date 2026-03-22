import type { ErrorCode } from "../errors/codes.ts";
import type { ErrorContext } from "../errors/context.ts";

/** Lifecycle event codes — used in debug/info/warn log entries with no associated error. */
export const enum EventCode {
  QUERY_START      = "SQUN_EVT_001",
  QUERY_END        = "SQUN_EVT_002",
  CONN_OPENED      = "SQUN_EVT_003",
  CONN_CLOSED      = "SQUN_EVT_004",
  TX_START         = "SQUN_EVT_005",
  TX_COMMIT        = "SQUN_EVT_006",
  TX_ROLLBACK      = "SQUN_EVT_007",
  SLOW_QUERY       = "SQUN_EVT_008",
  RAW_SQL_USED     = "SQUN_EVT_009",
  POOL_ACQUIRED    = "SQUN_EVT_010",
  POOL_RELEASED    = "SQUN_EVT_011",
  TVP_MATERIALISED = "SQUN_EVT_012",
}

/** Structured log entry emitted by every logging call in the library. */
export interface LogEntry {
  readonly level: "debug" | "info" | "warn" | "error" | "fatal";
  readonly timestamp: string;
  readonly traceId: string;
  readonly code: ErrorCode | EventCode;
  readonly message: string;
  readonly context: ErrorContext;
  readonly stack?: string;
  readonly cause?: string;
  readonly durationMs?: number;
  readonly rowCount?: number;
}

/** Logger contract — every built-in logger and user-provided logger must satisfy this. */
export interface SqunLogger {
  debug(entry: LogEntry): void;
  info(entry: LogEntry): void;
  warn(entry: LogEntry): void;
  error(entry: LogEntry): void;
  fatal(entry: LogEntry): void;
}
