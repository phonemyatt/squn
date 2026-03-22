import { SQUN_ENV_VARS } from "./env-vars.ts";
import type { AdapterType, AuthType, ConnectionConfig } from "./types.ts";

function env(name: string): string | undefined {
  return process.env[name];
}

function envInt(name: string): number | undefined {
  const raw = env(name);
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
}

function envBool(name: string): boolean | undefined {
  const raw = env(name);
  if (raw === undefined) return undefined;
  return raw === "true";
}

function envSsl(name: string): boolean | "require" | undefined {
  const raw = env(name);
  if (raw === undefined) return undefined;
  if (raw === "require") return "require";
  return raw === "true";
}

function envAuthType(name: string): AuthType | undefined {
  const raw = env(name);
  if (raw === undefined) return undefined;
  return raw as AuthType;
}

interface EnvFieldMap {
  readonly url: string;
  readonly host: string;
  readonly port: string;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  readonly ssl?: string;
  readonly authType?: string;
  readonly domain?: string;
  readonly upn?: string;
  readonly readonly?: string;
}

const ADAPTER_ENV_FIELDS: Record<AdapterType, EnvFieldMap> = {
  postgres: {
    url: SQUN_ENV_VARS.PG_URL,
    host: SQUN_ENV_VARS.PG_HOST,
    port: SQUN_ENV_VARS.PG_PORT,
    database: SQUN_ENV_VARS.PG_DATABASE,
    user: SQUN_ENV_VARS.PG_USER,
    password: SQUN_ENV_VARS.PG_PASSWORD,
    ssl: SQUN_ENV_VARS.PG_SSL,
  },
  mysql: {
    url: SQUN_ENV_VARS.MYSQL_URL,
    host: SQUN_ENV_VARS.MYSQL_HOST,
    port: SQUN_ENV_VARS.MYSQL_PORT,
    database: SQUN_ENV_VARS.MYSQL_DATABASE,
    user: SQUN_ENV_VARS.MYSQL_USER,
    password: SQUN_ENV_VARS.MYSQL_PASSWORD,
  },
  mssql: {
    url: SQUN_ENV_VARS.MSSQL_URL,
    host: SQUN_ENV_VARS.MSSQL_HOST,
    port: SQUN_ENV_VARS.MSSQL_PORT,
    database: SQUN_ENV_VARS.MSSQL_DATABASE,
    user: SQUN_ENV_VARS.MSSQL_USER,
    password: SQUN_ENV_VARS.MSSQL_PASSWORD,
    authType: SQUN_ENV_VARS.MSSQL_AUTH_TYPE,
    domain: SQUN_ENV_VARS.MSSQL_DOMAIN,
    upn: SQUN_ENV_VARS.MSSQL_UPN,
  },
  sqlite: {
    url: SQUN_ENV_VARS.SQLITE_FILE,
    host: "",
    port: "",
    database: "",
    user: "",
    password: "",
  },
};

function buildFromEnvFields(fields: EnvFieldMap): ConnectionConfig {
  const config: Record<string, unknown> = {};

  const url = env(fields.url);
  if (url !== undefined) config.url = url;

  // SQLite only uses url (file path) — skip the rest
  if (fields.host === "") return config as ConnectionConfig;

  const host = env(fields.host);
  if (host !== undefined) config.host = host;

  const port = envInt(fields.port);
  if (port !== undefined) config.port = port;

  const database = env(fields.database);
  if (database !== undefined) config.database = database;

  const user = env(fields.user);
  if (user !== undefined) config.user = user;

  const password = env(fields.password);
  if (password !== undefined) config.password = password;

  if (fields.ssl !== undefined) {
    const ssl = envSsl(fields.ssl);
    if (ssl !== undefined) config.ssl = ssl;
  }

  if (fields.authType !== undefined) {
    const authType = envAuthType(fields.authType);
    if (authType !== undefined) config.authType = authType;
  }

  if (fields.domain !== undefined) {
    const domain = env(fields.domain);
    if (domain !== undefined) config.domain = domain;
  }

  if (fields.upn !== undefined) {
    const upn = env(fields.upn);
    if (upn !== undefined) config.upn = upn;
  }

  return config as ConnectionConfig;
}

/**
 * Builds a ConnectionConfig from SQUN_* environment variables for the given adapter.
 *
 * The `defaults` parameter supplies the environment preset (localhost values).
 * Env vars override defaults; an explicit `overrides` config wins over both.
 *
 * Precedence: overrides → env vars → defaults
 */
export function resolveConnectionConfig(
  adapter: AdapterType,
  defaults: ConnectionConfig,
  overrides?: ConnectionConfig,
): ConnectionConfig {
  const fields = ADAPTER_ENV_FIELDS[adapter];
  const fromEnv = buildFromEnvFields(fields);

  const result: Record<string, unknown> = {};

  // Start with defaults
  for (const [key, value] of Object.entries(defaults)) {
    if (value !== undefined) result[key] = value;
  }

  // Layer env vars on top
  for (const [key, value] of Object.entries(fromEnv)) {
    if (value !== undefined) result[key] = value;
  }

  // Layer explicit overrides on top
  if (overrides !== undefined) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) result[key] = value;
    }
  }

  return result as ConnectionConfig;
}

/**
 * Builds a ConnectionConfig from SQUN_CONN_{NAME}_* environment variables
 * for a named connection in a multi-connection setup.
 */
export function resolveNamedConnectionConfig(name: string): ConnectionConfig {
  const prefix = `${SQUN_ENV_VARS.CONN_PREFIX}${name.toUpperCase()}_`;
  const config: Record<string, unknown> = {};

  const url = env(`${prefix}URL`);
  if (url !== undefined) config.url = url;

  const host = env(`${prefix}HOST`);
  if (host !== undefined) config.host = host;

  const port = envInt(`${prefix}PORT`);
  if (port !== undefined) config.port = port;

  const database = env(`${prefix}DATABASE`);
  if (database !== undefined) config.database = database;

  const user = env(`${prefix}USER`);
  if (user !== undefined) config.user = user;

  const password = env(`${prefix}PASSWORD`);
  if (password !== undefined) config.password = password;

  const ssl = envSsl(`${prefix}SSL`);
  if (ssl !== undefined) config.ssl = ssl;

  const authType = envAuthType(`${prefix}AUTH_TYPE`);
  if (authType !== undefined) config.authType = authType;

  const domain = env(`${prefix}DOMAIN`);
  if (domain !== undefined) config.domain = domain;

  const upn = env(`${prefix}UPN`);
  if (upn !== undefined) config.upn = upn;

  const readonly = envBool(`${prefix}READONLY`);
  if (readonly !== undefined) config.readonly = readonly;

  return config as ConnectionConfig;
}
