import { ErrorCode } from "../errors/codes.ts";
import { SqunConfigError } from "../errors/types.ts";
import type { SqunLogger } from "../logging/logger.ts";
import { EventCode } from "../logging/logger.ts";
import { SQUN_ENV_VARS } from "./env-vars.ts";
import type { AdapterType, ConnectionConfig, SqunConfig } from "./types.ts";

const SUPERUSERS = new Set(["root", "sa", "postgres"]);
const LOCALHOST = new Set(["localhost", "127.0.0.1"]);

const URL_RE = /^[a-z][a-z0-9+\-.]*:\/\/.+/;

interface AdapterEnvHints {
  readonly url: string;
  readonly host: string;
  readonly password: string;
  readonly file?: string;
}

const ENV_HINTS: Record<AdapterType, AdapterEnvHints> = {
  postgres: {
    url: SQUN_ENV_VARS.PG_URL,
    host: SQUN_ENV_VARS.PG_HOST,
    password: SQUN_ENV_VARS.PG_PASSWORD,
  },
  mysql: {
    url: SQUN_ENV_VARS.MYSQL_URL,
    host: SQUN_ENV_VARS.MYSQL_HOST,
    password: SQUN_ENV_VARS.MYSQL_PASSWORD,
  },
  mssql: {
    url: SQUN_ENV_VARS.MSSQL_URL,
    host: SQUN_ENV_VARS.MSSQL_HOST,
    password: SQUN_ENV_VARS.MSSQL_PASSWORD,
  },
  sqlite: {
    url: SQUN_ENV_VARS.SQLITE_FILE,
    host: "",
    password: "",
    file: SQUN_ENV_VARS.SQLITE_FILE,
  },
};

function warnEntry(logger: SqunLogger, message: string, adapter: string): void {
  logger.warn({
    level: "warn",
    timestamp: new Date().toISOString(),
    traceId: crypto.randomUUID(),
    code: EventCode.CONN_OPENED,
    message,
    context: { operation: "validateProductionConfig", adapter },
  });
}

/**
 * Validates a connection config for production.
 * Throws SqunConfigError listing ALL missing fields in one error.
 * Warns (does not throw) for localhost, disabled SSL, and superuser connections.
 */
export function validateProductionConfig(
  config: SqunConfig,
  adapter: AdapterType,
  connection: ConnectionConfig,
  logger: SqunLogger,
): void {
  if (config.env !== "production") return;

  const hints = ENV_HINTS[adapter];
  const missing: string[] = [];

  if (adapter === "sqlite") {
    // SQLite: file is required and cannot be :memory:
    if (connection.url === undefined) {
      missing.push(`file is required. Set ${hints.file}`);
    } else if (connection.url === ":memory:") {
      throw new SqunConfigError(
        ErrorCode.CONFIG_PRODUCTION_GUARD,
        `SQLite :memory: is not allowed in production. Set ${hints.file} to a file path.`,
        { operation: "validateProductionConfig", adapter },
      );
    }

    if (missing.length > 0) {
      throw new SqunConfigError(
        ErrorCode.CONFIG_MISSING,
        formatMissingMessage(adapter, missing),
        {
          operation: "validateProductionConfig",
          adapter,
        },
      );
    }
    return;
  }

  // Network adapters: need either URL or host+password
  if (connection.url !== undefined) {
    // Validate URL format
    if (!URL_RE.test(connection.url)) {
      throw new SqunConfigError(
        ErrorCode.CONFIG_URL_MALFORMED,
        `Connection URL is malformed. Set ${hints.url} to a valid URL.`,
        { operation: "validateProductionConfig", adapter },
      );
    }
  } else {
    // Individual fields required
    if (connection.host === undefined) {
      missing.push(`host is required. Set ${hints.host} or ${hints.url}`);
    }
    if (connection.password === undefined) {
      missing.push(`password is required. Set ${hints.password}`);
    }
  }

  // Auth config must be present for MSSQL
  if (
    adapter === "mssql" &&
    connection.authType === undefined &&
    connection.url === undefined
  ) {
    missing.push(
      `auth config is required. Set ${SQUN_ENV_VARS.MSSQL_AUTH_TYPE}`,
    );
  }

  if (missing.length > 0) {
    throw new SqunConfigError(
      ErrorCode.CONFIG_MISSING,
      formatMissingMessage(adapter, missing),
      {
        operation: "validateProductionConfig",
        adapter,
      },
    );
  }

  // Warnings — do not throw
  const host = connection.host;
  if (host !== undefined && LOCALHOST.has(host)) {
    warnEntry(
      logger,
      `Production ${adapter} is connecting to ${host}. This is likely a misconfiguration.`,
      adapter,
    );
  }

  if (connection.ssl === false || connection.ssl === undefined) {
    warnEntry(
      logger,
      `Production ${adapter} has SSL disabled. Consider enabling SSL.`,
      adapter,
    );
  }

  const user = connection.user;
  if (user !== undefined && SUPERUSERS.has(user)) {
    warnEntry(
      logger,
      `Production ${adapter} is connecting as superuser '${user}'. Use a dedicated application user.`,
      adapter,
    );
  }
}

function formatMissingMessage(
  adapter: string,
  missing: readonly string[],
): string {
  const lines = missing.map((m) => `  ✗  ${m}`).join("\n");
  return `Production ${adapter} config is incomplete:\n${lines}`;
}
