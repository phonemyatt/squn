import type { IDbAdapter } from "../adapters/base.ts";
import type { ConnectionRegistry } from "./registry.ts";

/**
 * Resolves the connection to use following the full precedence chain:
 * options.connection → .use() scope → queryBuilder.connection() → default.
 *
 * Throws ConnectionError(CONN_UNKNOWN) if the name is not found — handled by registry.get().
 */
export function resolveConnection<Names extends string>(
  registry: ConnectionRegistry<Names>,
  optionsConnection?: Names,
  useScope?: Names,
  builderConnection?: Names,
): IDbAdapter {
  const name = optionsConnection ?? useScope ?? builderConnection;
  return registry.get(name);
}
