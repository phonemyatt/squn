import { SQUN_ENV_VARS } from "../config/env-vars.ts";
import { resolveNamedConnectionConfig } from "../config/resolve-connection.ts";
import type { ConnectionConfig } from "../config/types.ts";

/**
 * Discovers all SQUN_CONN_{NAME}_* env vars at startup.
 * Returns a map of connection name → ConnectionConfig.
 */
export function discoverNamedConnections(): Map<string, ConnectionConfig> {
  const prefix = SQUN_ENV_VARS.CONN_PREFIX;
  const discovered = new Map<string, ConnectionConfig>();
  const names = new Set<string>();

  for (const key of Object.keys(process.env)) {
    if (key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      const underscoreIdx = rest.indexOf("_");
      if (underscoreIdx > 0) {
        const name = rest.slice(0, underscoreIdx).toLowerCase();
        names.add(name);
      }
    }
  }

  for (const name of names) {
    discovered.set(name, resolveNamedConnectionConfig(name));
  }

  return discovered;
}
