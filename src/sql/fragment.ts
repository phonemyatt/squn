/** TVP value extracted from a SqlFragment by the sql tag. */
export interface TvpValue {
  readonly __isTvp: true;
  readonly tableType: unknown;
  readonly rows: readonly Record<string, unknown>[];
}

/** The return type of the sql tagged template and all composition helpers. */
export interface SqlFragment {
  readonly text: string;
  readonly params: readonly unknown[];
  readonly tvpValues: readonly TvpValue[];
  readonly __isSql: true;
}

/** Type guard for SqlFragment. */
export function isSqlFragment(x: unknown): x is SqlFragment {
  return typeof x === "object" && x !== null && (x as Record<string, unknown>).__isSql === true;
}

/** Type guard for TvpValue. */
export function isTvpValue(x: unknown): x is TvpValue {
  return typeof x === "object" && x !== null && (x as Record<string, unknown>).__isTvp === true;
}

/** Creates a SqlFragment from parts. */
export function createFragment(text: string, params: readonly unknown[], tvpValues: readonly TvpValue[] = []): SqlFragment {
  return { text, params, tvpValues, __isSql: true };
}
