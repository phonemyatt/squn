import { ErrorCode } from "../errors/codes.ts";
import { SqunConfigError } from "../errors/types.ts";

const URL_RE = /^[a-z][a-z0-9+\-.]*:\/\/.+/;
const PASSWORD_RE = /(:\/\/[^:]+:)([^@]+)(@)/g;

/**
 * Validates that a connection URL has a recognisable scheme and structure.
 * Throws SqunConfigError if the URL is malformed.
 */
export function validateUrl(url: string): void {
  if (!URL_RE.test(url)) {
    throw new SqunConfigError(
      ErrorCode.CONFIG_URL_MALFORMED,
      `Connection URL is malformed: expected scheme://... but got "${maskUrl(url)}"`,
      { operation: "validateUrl" },
    );
  }

  try {
    new URL(url);
  } catch {
    throw new SqunConfigError(
      ErrorCode.CONFIG_URL_MALFORMED,
      `Connection URL failed to parse: "${maskUrl(url)}"`,
      { operation: "validateUrl" },
    );
  }
}

/**
 * Masks the password portion of a connection URL for safe logging.
 * postgresql://user:s3cret@host → postgresql://user:****@host
 */
export function maskUrl(url: string): string {
  return url.replace(PASSWORD_RE, "$1****$3");
}
