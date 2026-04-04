import { ErrorCode } from "../errors/codes.ts";
import { ReadonlyViolationError } from "../errors/types.ts";
import type { ReadonlyStrategy } from "./types.ts";

const WRITE_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|MERGE)\b/i;

export interface ReadonlyConnection {
  readonly readonly: boolean;
  readonly readonlyStrategy: ReadonlyStrategy;
}

/**
 * Throws ReadonlyViolationError if a write operation is attempted on a readonly
 * connection. Called before any SQL is sent to the adapter.
 *
 * In "strict" mode (default): throws immediately.
 * In "warn" mode: returns false to signal a warning should be logged, but allows the write.
 */
export function assertWritable(
  connection: ReadonlyConnection,
  operation: string,
  sql?: string,
): boolean {
  if (!connection.readonly) return true;

  const isWrite =
    sql !== undefined ? WRITE_RE.test(sql) : isWriteOperation(operation);
  if (!isWrite) return true;

  if (connection.readonlyStrategy === "strict") {
    throw new ReadonlyViolationError(
      ErrorCode.READONLY_WRITE_BLOCKED,
      `Write operation '${operation}' blocked on readonly connection`,
      { operation, ...(sql !== undefined ? { sql } : {}) },
    );
  }

  // "warn" mode — return false to signal the caller should log
  return false;
}

function isWriteOperation(operation: string): boolean {
  return ["execute", "insert", "update", "delete", "executeBatch"].includes(
    operation,
  );
}
