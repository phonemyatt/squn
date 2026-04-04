import type { ConnectionRegistry } from "./registry.ts";

/** A function that resolves a tenant ID to a connection name. */
export type TenantResolver<Names extends string = string> = (
  tenantId: string,
) => Names;

/**
 * Resolves a tenant ID to an adapter via the registry.
 * The resolver function is called per-query — it can use caching internally.
 */
export function forTenant<Names extends string>(
  registry: ConnectionRegistry<Names>,
  resolver: TenantResolver<Names>,
  tenantId: string,
): Names {
  const name = resolver(tenantId);
  // Validate the name exists — registry.get() throws CONN_UNKNOWN if not
  registry.get(name);
  return name;
}

/**
 * Creates a scoped connection name from a tenant ID.
 * For use with QueryOptions.connection or .use().
 */
export function withTenant<Names extends string>(
  resolver: TenantResolver<Names>,
  tenantId: string,
): Names {
  return resolver(tenantId);
}
