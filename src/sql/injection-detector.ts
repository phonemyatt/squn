import { SQUN_REGEX } from "./regex.ts";

export type Severity = "critical" | "high" | "medium" | "low";

export interface DetectionResult {
  readonly detected: boolean;
  readonly severity: Severity | null;
  readonly pattern: string | null;
}

interface PatternEntry {
  readonly key: string;
  readonly regex: RegExp;
  readonly severity: Severity;
}

const PATTERNS: readonly PatternEntry[] = [
  { key: "NULL_BYTE", regex: SQUN_REGEX.NULL_BYTE, severity: "critical" },
  {
    key: "STACKED_STATEMENTS",
    regex: SQUN_REGEX.STACKED_STATEMENTS,
    severity: "critical",
  },
  {
    key: "MSSQL_DANGEROUS",
    regex: SQUN_REGEX.MSSQL_DANGEROUS,
    severity: "critical",
  },
  {
    key: "UNION_INJECTION",
    regex: SQUN_REGEX.UNION_INJECTION,
    severity: "high",
  },
  { key: "TAUTOLOGY", regex: SQUN_REGEX.TAUTOLOGY, severity: "high" },
  { key: "TIME_BASED", regex: SQUN_REGEX.TIME_BASED, severity: "high" },
  {
    key: "MYSQL_DANGEROUS",
    regex: SQUN_REGEX.MYSQL_DANGEROUS,
    severity: "high",
  },
  { key: "PG_DANGEROUS", regex: SQUN_REGEX.PG_DANGEROUS, severity: "high" },
  { key: "CHAR_ENCODING", regex: SQUN_REGEX.CHAR_ENCODING, severity: "medium" },
  { key: "HEX_ENCODING", regex: SQUN_REGEX.HEX_ENCODING, severity: "medium" },
  { key: "BLOCK_COMMENT", regex: SQUN_REGEX.BLOCK_COMMENT, severity: "low" },
  { key: "LINE_COMMENT", regex: SQUN_REGEX.LINE_COMMENT, severity: "low" },
];

/**
 * Checks text against all SQUN_REGEX injection patterns.
 * Returns the first match found (ordered by severity: critical → low).
 */
export function detectInjection(text: string): DetectionResult {
  for (const entry of PATTERNS) {
    if (entry.regex.test(text)) {
      return { detected: true, severity: entry.severity, pattern: entry.key };
    }
  }
  return { detected: false, severity: null, pattern: null };
}
