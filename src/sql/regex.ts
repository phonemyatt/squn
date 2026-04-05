/**
 * Every named regex pattern used for injection detection, identifier validation,
 * and auth credential validation. A single exported constant — fully testable.
 */
export const SQUN_REGEX = {
  // ── Injection detection (PRD 15.2) ──────────────────────────────────

  /** Critical — null byte anywhere in the string. */
  NULL_BYTE: /\0/,

  /** Critical — semicolon followed by a SQL keyword (stacked statements). */
  STACKED_STATEMENTS: /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|TRUNCATE|MERGE)\b/i,

  /** Critical — MSSQL dangerous procedures. */
  MSSQL_DANGEROUS:
    /\b(xp_cmdshell|sp_oacreate|sp_oamethod|OPENROWSET|OPENDATASOURCE|xp_regread|xp_regwrite)\b/i,

  /** High — UNION [ALL] SELECT injection. */
  UNION_INJECTION: /\bUNION\s+(ALL\s+)?SELECT\b/i,

  /** High — tautology patterns like OR '1'='1', OR 1=1, OR true. */
  TAUTOLOGY: /\bOR\s+((['"])\w+\2\s*=\s*(['"])\w+\3|1\s*=\s*1|\btrue\b)/i,

  /** High — time-based blind injection (WAITFOR, SLEEP, PG_SLEEP, BENCHMARK). */
  TIME_BASED: /\b(WAITFOR\s+DELAY|SLEEP\s*\(|PG_SLEEP\s*\(|BENCHMARK\s*\()/i,

  /** High — MySQL file operations. */
  MYSQL_DANGEROUS: /\b(LOAD_FILE\s*\(|INTO\s+(OUT|DUMP)FILE\b)/i,

  /** High — PostgreSQL system functions. */
  PG_DANGEROUS: /\b(pg_read_file|pg_ls_dir|pg_stat_file|lo_import|lo_export)\s*\(/i,

  /** Medium — CHAR() encoding to bypass filters. */
  CHAR_ENCODING: /\bCHAR\s*\(\s*\d+/i,

  /** Medium — hex encoding (0x41 style). */
  HEX_ENCODING: /0x[0-9a-fA-F]{2,}/,

  /** Low — block comments that can hide SQL. */
  BLOCK_COMMENT: /\/\*[\s\S]*?\*\//,

  /** Low — line comments (-- or #). */
  LINE_COMMENT: /--|#/,

  // ── Identifier validation (PRD 15.3) ────────────────────────────────

  /** Valid SQL identifier — letters, digits, underscores, starts with letter or underscore. */
  VALID_IDENTIFIER: /^[a-zA-Z_][a-zA-Z0-9_]*$/,

  // ── Auth validation (PRD 14.2–14.3) ─────────────────────────────────

  /** Valid username for userpass auth. */
  VALID_USERNAME: /^[a-zA-Z0-9_\-.\\@]+$/,

  /** Valid Windows DOMAIN\username format. */
  VALID_DOMAIN_USER: /^[a-zA-Z0-9_\-.]+\\[a-zA-Z0-9_\-.]+$/,

  /** Valid UPN format (user@domain.tld). */
  VALID_UPN: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  // ── Password masking (PRD 14.5) ─────────────────────────────────────

  /** Matches the password portion of a URL: ://user:PASSWORD@ */
  PASSWORD_IN_URL: /(:\/\/[^:]+:)([^@]+)(@)/g,
} as const;
