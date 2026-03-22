import type { SqlFragment } from "./fragment.ts";
import { ErrorCode } from "../errors/codes.ts";
import { SecurityError } from "../errors/types.ts";

export interface ValidateOptions {
  readonly multiStatement?: boolean;
  readonly readonly?: boolean;
}

const WRITE_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|MERGE)\b/i;
const TVP_SENTINEL_RE = /__TVP_\d+__/;
const MULTI_STATEMENT_RE = /;\s*\S/;

/**
 * Validates a SqlFragment before execution.
 * Checks: placeholder/param count, unbalanced parens, unresolved TVP sentinels,
 * multiple statements, write on readonly.
 */
export function validateSql(fragment: SqlFragment, options: ValidateOptions = {}): void {
  const { text, params, tvpValues } = fragment;

  // Placeholder count must match param count
  const placeholders = text.match(/\$\d+/g);
  const placeholderCount = placeholders ? new Set(placeholders).size : 0;
  if (placeholderCount !== params.length) {
    throw new SecurityError(
      ErrorCode.PLACEHOLDER_MISMATCH,
      `Placeholder count (${placeholderCount}) does not match param count (${params.length})`,
      { operation: "validateSql", sql: text },
    );
  }

  // No unbalanced parentheses
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth < 0) {
      throw new SecurityError(
        ErrorCode.SQL_VALIDATION_FAILED,
        "Unbalanced parentheses in SQL — extra closing parenthesis",
        { operation: "validateSql", sql: text },
      );
    }
  }
  if (depth !== 0) {
    throw new SecurityError(
      ErrorCode.SQL_VALIDATION_FAILED,
      "Unbalanced parentheses in SQL — unclosed opening parenthesis",
      { operation: "validateSql", sql: text },
    );
  }

  // No unresolved TVP sentinels (should be replaced by adapter before reaching here)
  if (tvpValues.length === 0 && TVP_SENTINEL_RE.test(text)) {
    throw new SecurityError(
      ErrorCode.UNRESOLVED_TVP_SENTINEL,
      "Unresolved TVP sentinel in SQL text — materialisation may have failed",
      { operation: "validateSql", sql: text },
    );
  }

  // No multiple statements unless explicitly allowed
  if (options.multiStatement !== true && MULTI_STATEMENT_RE.test(text)) {
    throw new SecurityError(
      ErrorCode.MULTI_STATEMENT_BLOCKED,
      "Multiple statements detected. Set multiStatement: true to allow.",
      { operation: "validateSql", sql: text },
    );
  }

  // No write on readonly connections
  if (options.readonly === true && WRITE_RE.test(text)) {
    throw new SecurityError(
      ErrorCode.SQL_VALIDATION_FAILED,
      "Write statement detected on a readonly connection",
      { operation: "validateSql", sql: text },
    );
  }
}
