export interface UserPassAuth {
  readonly type: "userpass";
  readonly username: string;
  readonly password: string;
}

export interface WindowsAuth {
  readonly type: "windows";
  readonly domain?: string;
  readonly username?: string;
}

export interface WindowsUpnAuth {
  readonly type: "windows-upn";
  readonly upn: string;
  readonly password: string;
}

export interface ConnectionStringAuth {
  readonly type: "connection-string";
  readonly url: string;
}

export interface AzureAdAuth {
  readonly type: "azure-ad";
  readonly tenantId: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly managedIdentity?: boolean;
}

export type AuthConfig =
  | UserPassAuth
  | WindowsAuth
  | WindowsUpnAuth
  | ConnectionStringAuth
  | AzureAdAuth;
