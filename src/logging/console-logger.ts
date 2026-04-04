import type { LogEntry, SqunLogger } from "./logger.ts";

const COLORS = {
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  fatal: "\x1b[35m", // magenta
  reset: "\x1b[0m",
  dim: "\x1b[2m",
} as const;

const PASSWORD_RE = /(:\/\/[^:]+:)[^@]+(@)/g;

function maskSql(sql: string): string {
  return sql.replace(PASSWORD_RE, "$1****$2");
}

function formatEntry(entry: LogEntry): string {
  const color = COLORS[entry.level];
  const tag = `${color}${entry.level.toUpperCase().padEnd(5)}${COLORS.reset}`;
  const ts = `${COLORS.dim}${entry.timestamp}${COLORS.reset}`;
  const trace = `${COLORS.dim}[${entry.traceId}]${COLORS.reset}`;

  let line = `${tag} ${ts} ${trace} ${entry.code} ${entry.message}`;

  if (entry.context.sql !== undefined) {
    line += `\n      sql: ${maskSql(entry.context.sql)}`;
  }

  if (
    entry.context.paramKeys !== undefined &&
    entry.context.paramKeys.length > 0
  ) {
    line += `\n      paramKeys: [${entry.context.paramKeys.join(", ")}]`;
  }

  if (entry.context.adapter !== undefined) {
    line += `\n      adapter: ${entry.context.adapter}`;
  }

  if (entry.context.table !== undefined) {
    line += `\n      table: ${entry.context.table}`;
  }

  if (entry.context.column !== undefined) {
    line += `\n      column: ${entry.context.column}`;
  }

  if (entry.context.txId !== undefined) {
    line += `\n      txId: ${entry.context.txId}`;
  }

  if (entry.durationMs !== undefined) {
    line += `\n      duration: ${entry.durationMs}ms`;
  }

  if (entry.rowCount !== undefined) {
    line += `\n      rows: ${entry.rowCount}`;
  }

  if (entry.cause !== undefined) {
    line += `\n      cause: ${entry.cause}`;
  }

  if (entry.stack !== undefined) {
    line += `\n${COLORS.dim}${entry.stack}${COLORS.reset}`;
  }

  return line;
}

/** Development logger — colorised, human-readable, pretty-printed. */
export const consoleLogger: SqunLogger = {
  debug(entry: LogEntry): void {
    process.stderr.write(`${formatEntry(entry)}\n`);
  },
  info(entry: LogEntry): void {
    process.stderr.write(`${formatEntry(entry)}\n`);
  },
  warn(entry: LogEntry): void {
    process.stderr.write(`${formatEntry(entry)}\n`);
  },
  error(entry: LogEntry): void {
    process.stderr.write(`${formatEntry(entry)}\n`);
  },
  fatal(entry: LogEntry): void {
    process.stderr.write(`${formatEntry(entry)}\n`);
  },
};
