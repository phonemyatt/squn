import type { LogEntry, SqunLogger } from "./logger.ts";

const PINO_LEVELS: Record<LogEntry["level"], number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const PASSWORD_RE = /(:\/\/[^:]+:)[^@]+(@)/g;

function maskSql(sql: string): string {
  return sql.replace(PASSWORD_RE, "$1****$2");
}

function serialize(entry: LogEntry): string {
  const ctx =
    entry.context.sql !== undefined
      ? { ...entry.context, sql: maskSql(entry.context.sql) }
      : entry.context;

  const record: Record<string, unknown> = {
    level: PINO_LEVELS[entry.level],
    time: entry.timestamp,
    msg: entry.message,
    code: entry.code,
    traceId: entry.traceId,
    context: ctx,
  };

  if (entry.durationMs !== undefined) {
    record.durationMs = entry.durationMs;
  }

  if (entry.rowCount !== undefined) {
    record.rowCount = entry.rowCount;
  }

  if (entry.stack !== undefined) {
    record.stack = entry.stack;
  }

  if (entry.cause !== undefined) {
    record.cause = entry.cause;
  }

  return JSON.stringify(record);
}

function write(entry: LogEntry): void {
  process.stdout.write(`${serialize(entry)}\n`);
}

/** Production logger — structured JSON, one object per line, pino-compatible. */
export const jsonLogger: SqunLogger = {
  debug: write,
  info: write,
  warn: write,
  error: write,
  fatal: write,
};
