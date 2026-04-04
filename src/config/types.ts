import type { SqunLogger } from "../logging/logger.ts";

export type Environment = "development" | "production" | "test";

export type AdapterType = "sqlite" | "postgres" | "mysql" | "mssql";

export type AuthType =
  | "userpass"
  | "windows"
  | "windows-upn"
  | "connection-string"
  | "azure-ad";

export type ErrorVerbosity = "full" | "minimal";

export interface ConnectionConfig {
  readonly url?: string;
  readonly host?: string;
  readonly port?: number;
  readonly database?: string;
  readonly user?: string;
  readonly password?: string;
  readonly ssl?: boolean | "require";
  readonly authType?: AuthType;
  readonly domain?: string;
  readonly upn?: string;
  readonly readonly?: boolean;
}

export interface PoolConfig {
  readonly min?: number;
  readonly max?: number;
  readonly maxConnectionAgeMs?: number;
  readonly maxUseCount?: number;
  readonly maxQueueSize?: number;
}

export interface TimeoutConfig {
  readonly query?: number;
  readonly transaction?: number;
  readonly connect?: number;
  readonly acquire?: number;
}

export interface CacheConfig {
  readonly maxSize?: number;
  readonly ttlMs?: number | null;
  readonly maxAgeMs?: number | null;
  readonly reaperIntervalMs?: number | null;
}

export interface SecurityConfig {
  readonly detectInjection?: boolean;
  readonly strictRaw?: boolean;
  readonly validateSql?: boolean;
  readonly warnOnRawString?: boolean;
  readonly format?: {
    readonly normalizeKeywords?: boolean;
    readonly normalizeWhitespace?: boolean;
  };
}

export interface LogConfig {
  readonly logger?: SqunLogger;
  readonly level?: "debug" | "info" | "warn" | "error" | "fatal";
  readonly slowQueryMs?: number;
}

export interface AzureAdConfig {
  readonly tenantId?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly managedIdentity?: boolean;
}

export interface SqunConfig {
  readonly env?: Environment;
  readonly connection?: ConnectionConfig;
  readonly pool?: PoolConfig;
  readonly timeout?: TimeoutConfig;
  readonly cache?: CacheConfig;
  readonly security?: SecurityConfig;
  readonly log?: LogConfig;
  readonly azure?: AzureAdConfig;
  readonly errorVerbosity?: ErrorVerbosity;
  readonly maskSensitive?: boolean;
  readonly strict?: boolean;
  readonly deadlockRetries?: number;
  readonly tvpCopyThreshold?: number;
}
