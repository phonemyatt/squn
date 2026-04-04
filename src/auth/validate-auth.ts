import { ErrorCode } from "../errors/codes.ts";
import { AuthError } from "../errors/types.ts";
import type { AuthConfig } from "./types.ts";

const USERNAME_RE = /^[a-zA-Z0-9_\-.\\@]+$/;
const PASSWORD_FORBIDDEN_RE = /[;{}"']/;
const DOMAIN_USER_RE = /^[a-zA-Z0-9_\-.]+\\[a-zA-Z0-9_\-.]+$/;
const UPN_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CTX = { operation: "validateAuth" } as const;

function fail(code: ErrorCode, message: string): never {
  throw new AuthError(code, message, CTX);
}

function validateUsername(username: string): void {
  if (!USERNAME_RE.test(username)) {
    fail(
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      `Invalid username: must match ${USERNAME_RE.source}`,
    );
  }
}

function validatePassword(password: string): void {
  if (PASSWORD_FORBIDDEN_RE.test(password)) {
    fail(
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      "Invalid password: must not contain ; { } \" '",
    );
  }
}

/**
 * Validates an AuthConfig using the exact regex patterns from PRD section 14.
 * Throws AuthError on any violation.
 */
export function validateAuth(config: AuthConfig): void {
  switch (config.type) {
    case "userpass": {
      validateUsername(config.username);
      validatePassword(config.password);
      return;
    }

    case "windows": {
      // No credentials = Integrated Security — valid
      if (config.domain !== undefined && config.username !== undefined) {
        const domainUser = `${config.domain}\\${config.username}`;
        if (!DOMAIN_USER_RE.test(domainUser)) {
          fail(
            ErrorCode.AUTH_INVALID_CREDENTIALS,
            `Invalid Windows domain\\user: must match ${DOMAIN_USER_RE.source}`,
          );
        }
      }
      return;
    }

    case "windows-upn": {
      if (!UPN_RE.test(config.upn)) {
        fail(
          ErrorCode.AUTH_INVALID_CREDENTIALS,
          `Invalid UPN: must match ${UPN_RE.source}`,
        );
      }
      validatePassword(config.password);
      return;
    }

    case "connection-string": {
      if (config.url.length === 0) {
        fail(ErrorCode.AUTH_MISSING, "Connection string URL must not be empty");
      }
      return;
    }

    case "azure-ad": {
      if (!GUID_RE.test(config.tenantId)) {
        fail(
          ErrorCode.AUTH_INVALID_CREDENTIALS,
          "Azure AD tenantId must be a valid GUID",
        );
      }
      if (!GUID_RE.test(config.clientId)) {
        fail(
          ErrorCode.AUTH_INVALID_CREDENTIALS,
          "Azure AD clientId must be a valid GUID",
        );
      }
      if (
        config.clientSecret === undefined &&
        config.managedIdentity !== true
      ) {
        fail(
          ErrorCode.AUTH_MISSING,
          "Azure AD requires either clientSecret or managedIdentity: true",
        );
      }
      return;
    }
  }
}
