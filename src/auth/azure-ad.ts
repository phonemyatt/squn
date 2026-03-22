import { ErrorCode } from "../errors/codes.ts";
import { AuthError } from "../errors/types.ts";
import type { AzureAdAuth } from "./types.ts";

const CTX = { operation: "acquireAzureToken" } as const;

const TOKEN_URL_TEMPLATE = "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token";
const MANAGED_IDENTITY_URL = "http://169.254.169.254/metadata/identity/oauth2/token";
const DATABASE_SCOPE = "https://database.windows.net/.default";

/**
 * Acquires an Azure AD access token for MSSQL authentication.
 * Supports both service principal (clientSecret) and managed identity paths.
 */
export async function acquireAzureToken(config: AzureAdAuth): Promise<string> {
  if (config.managedIdentity === true) {
    return acquireManagedIdentityToken(config.clientId);
  }

  if (config.clientSecret === undefined) {
    throw new AuthError(
      ErrorCode.AUTH_MISSING,
      "Azure AD requires either clientSecret or managedIdentity: true",
      CTX,
    );
  }

  return acquireServicePrincipalToken(config.tenantId, config.clientId, config.clientSecret);
}

async function acquireServicePrincipalToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const tokenUrl = TOKEN_URL_TEMPLATE.replace("{tenantId}", tenantId);

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: DATABASE_SCOPE,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new AuthError(
      ErrorCode.AUTH_PROVIDER_FAILED,
      `Azure AD token request failed: ${response.status} ${response.statusText}`,
      CTX,
    );
  }

  const data = (await response.json()) as { access_token?: string };

  if (data.access_token === undefined) {
    throw new AuthError(
      ErrorCode.AUTH_PROVIDER_FAILED,
      "Azure AD response did not contain an access_token",
      CTX,
    );
  }

  return data.access_token;
}

async function acquireManagedIdentityToken(clientId: string): Promise<string> {
  const url = new URL(MANAGED_IDENTITY_URL);
  url.searchParams.set("api-version", "2018-02-01");
  url.searchParams.set("resource", DATABASE_SCOPE);
  url.searchParams.set("client_id", clientId);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Metadata: "true" },
  });

  if (!response.ok) {
    throw new AuthError(
      ErrorCode.AUTH_PROVIDER_FAILED,
      `Managed Identity token request failed: ${response.status} ${response.statusText}`,
      CTX,
    );
  }

  const data = (await response.json()) as { access_token?: string };

  if (data.access_token === undefined) {
    throw new AuthError(
      ErrorCode.AUTH_PROVIDER_FAILED,
      "Managed Identity response did not contain an access_token",
      CTX,
    );
  }

  return data.access_token;
}
