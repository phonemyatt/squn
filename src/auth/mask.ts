/** Masks password in URL format: scheme://user:password@host → scheme://user:****@host */
const PASSWORD_IN_URL_RE = /(:\/\/[^:]+:)([^@]+)(@)/g;

/** Masks password in key=value format: Password=secret; → Password=****; */
const PASSWORD_KV_RE = /((?:password|pwd)\s*=\s*)([^;]*)/gi;

/**
 * Strips passwords from both URL format and key=value connection strings.
 * Passwords must never appear in any log output.
 */
export function maskConnectionString(s: string): string {
  return s
    .replace(PASSWORD_IN_URL_RE, "$1****$3")
    .replace(PASSWORD_KV_RE, "$1****");
}
