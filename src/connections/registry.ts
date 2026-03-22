import type { IDbAdapter } from "../adapters/base.ts";
import { ErrorCode } from "../errors/codes.ts";
import { ConnectionError } from "../errors/types.ts";

/**
 * Holds all named Db instances. get() throws CONN_UNKNOWN if name not found.
 */
export class ConnectionRegistry<Names extends string = string> {
  private readonly map: Map<Names, IDbAdapter>;
  private readonly defaultName: Names;

  constructor(connections: Record<Names, IDbAdapter>, defaultName: Names) {
    this.map = new Map(Object.entries(connections) as [Names, IDbAdapter][]);
    this.defaultName = defaultName;

    if (!this.map.has(defaultName)) {
      throw new ConnectionError(
        ErrorCode.CONN_UNKNOWN,
        `Default connection '${defaultName}' is not in the registry`,
        {
          operation: "createConnections",
          requestedName: defaultName,
          registeredNames: this.names(),
        },
      );
    }
  }

  get(name?: Names): IDbAdapter {
    const resolved = name ?? this.defaultName;
    const adapter = this.map.get(resolved);
    if (adapter === undefined) {
      throw new ConnectionError(
        ErrorCode.CONN_UNKNOWN,
        `Connection '${resolved}' not found in registry`,
        { operation: "resolveConnection", requestedName: resolved, registeredNames: this.names() },
      );
    }
    return adapter;
  }

  names(): string[] {
    return [...this.map.keys()];
  }

  has(name: string): boolean {
    return this.map.has(name as Names);
  }

  async ping(name: Names): Promise<void> {
    const adapter = this.get(name);
    await adapter.ping();
  }

  async pingAll(): Promise<void> {
    const results = [...this.map.entries()].map(async ([name, adapter]) => {
      try {
        await adapter.ping();
      } catch (err) {
        throw new ConnectionError(
          ErrorCode.CONN_UNKNOWN,
          `Ping failed for connection '${name}'`,
          { operation: "pingAll", requestedName: name, registeredNames: this.names() },
          err,
        );
      }
    });
    await Promise.all(results);
  }

  get default(): Names {
    return this.defaultName;
  }
}
