import { describe, expect, it, mock } from "bun:test";
import { consoleLogger } from "../../../src/logging/console-logger.ts";
import { jsonLogger } from "../../../src/logging/json-logger.ts";
import type { LogEntry } from "../../../src/logging/logger.ts";
import { EventCode } from "../../../src/logging/logger.ts";
import { noopLogger } from "../../../src/logging/noop-logger.ts";

function makeEntry(overrides?: Partial<LogEntry>): LogEntry {
  return {
    level: "info",
    timestamp: new Date().toISOString(),
    traceId: crypto.randomUUID(),
    code: EventCode.QUERY_START,
    message: "test message",
    context: { operation: "query", adapter: "sqlite" },
    ...overrides,
  };
}

describe("logging/console-logger — consoleLogger", () => {
  it("debug() does not throw given a valid LogEntry", () => {
    const entry = makeEntry({ level: "debug" });
    expect(() => consoleLogger.debug(entry)).not.toThrow();
  });
});

describe("logging/json-logger — jsonLogger", () => {
  it("info() outputs a valid JSON line to stdout", () => {
    const entry = makeEntry({ level: "info" });
    const chunks: string[] = [];
    const original = process.stdout.write;
    process.stdout.write = mock((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      jsonLogger.info(entry);
    } finally {
      process.stdout.write = original;
    }

    expect(chunks.length).toBeGreaterThan(0);
    const parsed = JSON.parse(chunks[0] as string) as Record<string, unknown>;
    expect(parsed.msg).toBe("test message");
    expect(parsed.level).toBe(30);
    expect(parsed.code).toBe(EventCode.QUERY_START);
    expect(parsed.traceId).toBe(entry.traceId);
  });
});

describe("logging/noop-logger — noopLogger", () => {
  it("does nothing for all five log levels", () => {
    const entry = makeEntry();
    expect(() => noopLogger.debug(entry)).not.toThrow();
    expect(() => noopLogger.info(entry)).not.toThrow();
    expect(() => noopLogger.warn(entry)).not.toThrow();
    expect(() => noopLogger.error(entry)).not.toThrow();
    expect(() => noopLogger.fatal(entry)).not.toThrow();
  });
});

describe("logging — password masking", () => {
  it("jsonLogger masks passwords in sql context field before output", () => {
    const entry = makeEntry({
      context: {
        operation: "query",
        sql: "SELECT * FROM postgresql://admin:s3cret@db.host:5432/mydb",
      },
    });

    const chunks: string[] = [];
    const original = process.stdout.write;
    process.stdout.write = mock((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      jsonLogger.info(entry);
    } finally {
      process.stdout.write = original;
    }

    const output = chunks[0] as string;
    expect(output).not.toContain("s3cret");
    expect(output).toContain("****");

    const parsed = JSON.parse(output) as { context: { sql: string } };
    expect(parsed.context.sql).toContain("://admin:****@");
  });

  it("consoleLogger masks passwords in sql context field before output", () => {
    const entry = makeEntry({
      level: "debug",
      context: {
        operation: "query",
        sql: "SELECT * FROM postgresql://admin:s3cret@db.host:5432/mydb",
      },
    });

    const chunks: string[] = [];
    const original = process.stderr.write;
    process.stderr.write = mock((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stderr.write;

    try {
      consoleLogger.debug(entry);
    } finally {
      process.stderr.write = original;
    }

    const output = chunks[0] as string;
    expect(output).not.toContain("s3cret");
    expect(output).toContain("****");
  });
});
