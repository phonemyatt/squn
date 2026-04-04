import type { WindowsAuth, WindowsUpnAuth } from "./types.ts";

/**
 * Builds the MSSQL connection options for Windows Integrated Security.
 * When no domain/username is provided, uses the current process identity.
 */
export function buildWindowsAuthOptions(
  config: WindowsAuth,
): Record<string, unknown> {
  const options: Record<string, unknown> = {
    options: { trustedConnection: true },
  };

  if (config.domain !== undefined && config.username !== undefined) {
    options.domain = config.domain;
    options.user = config.username;
  }

  return options;
}

/**
 * Builds the MSSQL connection options for UPN-style Windows auth.
 * UPN format: user@domain.com with a password.
 */
export function buildWindowsUpnAuthOptions(
  config: WindowsUpnAuth,
): Record<string, unknown> {
  return {
    user: config.upn,
    password: config.password,
    options: { trustedConnection: false },
  };
}
