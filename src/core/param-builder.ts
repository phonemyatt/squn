import type { AdapterType } from "../config/types.ts";
import { ErrorCode } from "../errors/codes.ts";
import { ValidationError } from "../errors/types.ts";

const NAMED_PARAM_RE = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;

/** @internal */
export interface BuildResult {
  readonly text: string;
  readonly params: readonly unknown[];
  readonly paramOrder: readonly string[];
}

/**
 * Translates @name placeholders to positional placeholders (? or $N)
 * and extracts parameter values in the correct order.
 * @internal
 *
 * - SQLite / MySQL / MSSQL: @name → ?
 * - PostgreSQL: @name → $1, $2… (same name reuses same index)
 * - Array values are expanded inline for IN clauses.
 * - Missing params throw ValidationError(PARAM_MISSING).
 * - Extra params throw ValidationError(PARAM_EXTRA).
 */
export function buildParams(
  sql: string,
  params: Record<string, unknown>,
  adapterType: AdapterType,
): BuildResult {
  const usesPositional = adapterType === "postgres";
  const referenced = new Set<string>();
  const paramOrder: string[] = [];
  const paramIndexMap = new Map<string, number>();
  const values: unknown[] = [];

  const text = sql.replace(NAMED_PARAM_RE, (_, name: string) => {
    referenced.add(name);

    const value = params[name];
    if (!(name in params)) {
      throw new ValidationError(
        ErrorCode.PARAM_MISSING,
        `Parameter @${name} referenced in SQL but not provided`,
        { operation: "buildParams", paramKeys: [name] },
      );
    }

    // IN clause expansion for arrays
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return "(NULL)";
      }
      if (usesPositional) {
        const placeholders = value.map((v) => {
          values.push(v);
          return `$${values.length}`;
        });
        return `(${placeholders.join(", ")})`;
      }
      const placeholders = value.map((v) => {
        values.push(v);
        return "?";
      });
      return `(${placeholders.join(", ")})`;
    }

    if (usesPositional) {
      const existing = paramIndexMap.get(name);
      if (existing !== undefined) {
        return `$${existing}`;
      }
      values.push(value);
      const idx = values.length;
      paramIndexMap.set(name, idx);
      paramOrder.push(name);
      return `$${idx}`;
    }

    // ? style — always append
    values.push(value);
    paramOrder.push(name);
    return "?";
  });

  // Check for extra keys not referenced in SQL
  const providedKeys = Object.keys(params);
  const extra = providedKeys.filter((k) => !referenced.has(k));
  if (extra.length > 0) {
    throw new ValidationError(
      ErrorCode.PARAM_EXTRA,
      `Extra parameters provided but not referenced in SQL: ${extra.join(", ")}`,
      { operation: "buildParams", paramKeys: extra },
    );
  }

  return { text, params: values, paramOrder };
}
