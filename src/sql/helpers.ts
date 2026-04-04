import { ErrorCode } from "../errors/codes.ts";
import { SecurityError } from "../errors/types.ts";
import type { SqlFragment } from "./fragment.ts";
import { createFragment } from "./fragment.ts";
import { SQUN_REGEX } from "./regex.ts";

/** Includes fragment only if condition is true. Returns empty fragment otherwise. */
export function sqlIf(condition: boolean, fragment: SqlFragment): SqlFragment {
  if (condition) return fragment;
  return createFragment("", []);
}

/** Joins multiple fragments with a separator string. */
export function sqlJoin(
  fragments: readonly SqlFragment[],
  separator: string = ", ",
): SqlFragment {
  if (fragments.length === 0) return createFragment("", []);

  const textParts: string[] = [];
  const params: unknown[] = [];
  let offset = 0;

  for (let i = 0; i < fragments.length; i++) {
    if (i > 0) textParts.push(separator);
    const f = fragments[i] as SqlFragment;
    const renumbered = f.text.replace(
      /\$(\d+)/g,
      (_, n: string) => `$${Number.parseInt(n, 10) + offset}`,
    );
    textParts.push(renumbered);
    for (const p of f.params) {
      params.push(p);
      offset++;
    }
  }

  return createFragment(textParts.join(""), params);
}

/**
 * Raw SQL escape hatch. Injects text directly — no parameterization.
 * Throws SecurityError on critical/high injection patterns.
 */
export function sqlRaw(text: string): SqlFragment {
  // Check critical patterns
  if (SQUN_REGEX.NULL_BYTE.test(text)) {
    throw new SecurityError(
      ErrorCode.INJECTION_DETECTED,
      "Null byte detected in sqlRaw()",
      {
        operation: "sqlRaw",
        sql: text,
      },
    );
  }
  if (SQUN_REGEX.STACKED_STATEMENTS.test(text)) {
    throw new SecurityError(
      ErrorCode.INJECTION_DETECTED,
      "Stacked statements detected in sqlRaw()",
      { operation: "sqlRaw", sql: text },
    );
  }
  if (SQUN_REGEX.MSSQL_DANGEROUS.test(text)) {
    throw new SecurityError(
      ErrorCode.INJECTION_DETECTED,
      "Dangerous MSSQL procedure detected in sqlRaw()",
      { operation: "sqlRaw", sql: text },
    );
  }
  // Check high patterns
  if (SQUN_REGEX.UNION_INJECTION.test(text)) {
    throw new SecurityError(
      ErrorCode.INJECTION_DETECTED,
      "UNION injection detected in sqlRaw()",
      {
        operation: "sqlRaw",
        sql: text,
      },
    );
  }
  if (SQUN_REGEX.TAUTOLOGY.test(text)) {
    throw new SecurityError(
      ErrorCode.INJECTION_DETECTED,
      "Tautology detected in sqlRaw()",
      {
        operation: "sqlRaw",
        sql: text,
      },
    );
  }
  if (SQUN_REGEX.TIME_BASED.test(text)) {
    throw new SecurityError(
      ErrorCode.INJECTION_DETECTED,
      "Time-based injection detected in sqlRaw()",
      { operation: "sqlRaw", sql: text },
    );
  }
  if (SQUN_REGEX.MYSQL_DANGEROUS.test(text)) {
    throw new SecurityError(
      ErrorCode.INJECTION_DETECTED,
      "Dangerous MySQL operation detected in sqlRaw()",
      { operation: "sqlRaw", sql: text },
    );
  }
  if (SQUN_REGEX.PG_DANGEROUS.test(text)) {
    throw new SecurityError(
      ErrorCode.INJECTION_DETECTED,
      "Dangerous PostgreSQL function detected in sqlRaw()",
      { operation: "sqlRaw", sql: text },
    );
  }

  return createFragment(text, []);
}

/** Validates and double-quotes a SQL identifier. Max 128 chars. */
export function sqlIdentifier(name: string): SqlFragment {
  if (name.length === 0) {
    throw new SecurityError(
      ErrorCode.INVALID_IDENTIFIER,
      "Identifier must not be empty",
      {
        operation: "sqlIdentifier",
      },
    );
  }
  if (name.length > 128) {
    throw new SecurityError(
      ErrorCode.INVALID_IDENTIFIER,
      `Identifier exceeds 128 characters: ${name.length}`,
      { operation: "sqlIdentifier" },
    );
  }
  if (!SQUN_REGEX.VALID_IDENTIFIER.test(name)) {
    const invalid = [...name].filter((c) => !/[a-zA-Z0-9_]/.test(c));
    throw new SecurityError(
      ErrorCode.INVALID_IDENTIFIER,
      `Invalid identifier characters: ${invalid.join(", ")}`,
      { operation: "sqlIdentifier" },
    );
  }
  return createFragment(`"${name}"`, []);
}

/** Validates and double-quotes a qualified identifier: "schema"."table". */
export function sqlQualifiedIdentifier(
  schema: string,
  table: string,
): SqlFragment {
  const s = sqlIdentifier(schema);
  const t = sqlIdentifier(table);
  return createFragment(`${s.text}.${t.text}`, []);
}
