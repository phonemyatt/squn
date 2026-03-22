import type { IDbAdapter } from "./adapters/base.ts";
import type { SqunConfig } from "./config/types.ts";
import type { MultiDbConfig } from "./connections/types.ts";
import { resolveConfig } from "./config/resolve.ts";
import { validateConfig } from "./config/validate.ts";
import { validateProductionConfig } from "./config/validate-production.ts";
import { noopLogger } from "./logging/noop-logger.ts";
import { ConnectionRegistry } from "./connections/registry.ts";

export interface Db {
  readonly adapter: IDbAdapter;
  readonly config: SqunConfig;
}

/**
 * Single connection entry point.
 * Calls validateProductionConfig() synchronously — app never starts in invalid state.
 */
export function createDb(adapter: IDbAdapter, userConfig: Partial<SqunConfig> = {}): Db {
  const config = resolveConfig(userConfig);
  validateConfig(config);

  const logger = config.log?.logger ?? noopLogger;
  validateProductionConfig(
    config,
    adapter.type,
    config.connection ?? {},
    logger,
  );

  return { adapter, config };
}

export interface MultiDb<Names extends string = string> {
  readonly registry: ConnectionRegistry<Names>;
  readonly config: SqunConfig;
}

/**
 * Multi-connection entry point.
 * Infers Names = keyof Config["connections"] & string.
 * Validates all connections together at startup.
 */
export function createConnections<
  Config extends MultiDbConfig,
  Names extends string = keyof Config["connections"] & string,
>(multiConfig: Config): MultiDb<Names> {
  const config = resolveConfig({});

  const connections = multiConfig.connections as Record<Names, IDbAdapter>;
  const defaultName = multiConfig.default as Names;

  const registry = new ConnectionRegistry<Names>(connections, defaultName);

  return { registry, config };
}
