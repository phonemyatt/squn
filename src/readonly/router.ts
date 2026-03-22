import type { IDbAdapter } from "../adapters/base.ts";

export interface RouterConfig {
  readonly write: IDbAdapter;
  readonly read: IDbAdapter;
}

export interface RouterResult {
  readonly connections: {
    readonly primary: IDbAdapter;
    readonly replica: IDbAdapter;
  };
  readonly default: "primary";
  readonly groups: {
    readonly default: {
      readonly write: "primary";
      readonly read: readonly string[];
      readonly readMode: "round-robin";
    };
  };
}

/**
 * Convenience wrapper — one writable primary, one read replica.
 * Returns the config shape that createConnections() expects.
 * Not a separate code path — just builds the standard multi-connection config.
 */
export function createRouter(config: RouterConfig): RouterResult {
  return {
    connections: {
      primary: config.write,
      replica: config.read,
    },
    default: "primary",
    groups: {
      default: {
        write: "primary",
        read: ["replica"],
        readMode: "round-robin",
      },
    },
  };
}
