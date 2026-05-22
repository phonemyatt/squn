import type { IDbAdapter } from "../adapters/base.ts";
import { ErrorCode } from "../errors/codes.ts";
import { ConnectionError } from "../errors/types.ts";
import type { ConnectionRegistry } from "./registry.ts";
import type { GroupConfig } from "./types.ts";

/**
 * Connection group with read/write routing.
 * Reads are load-balanced across replicas. Writes and transactions always go to the write connection.
 */
export class ConnectionGroup<Names extends string = string> {
  private readonly writeName: Names;
  private readonly readNames: readonly Names[];
  private readonly readMode: "round-robin" | "least-load" | "random";
  private roundRobinIndex = 0;

  constructor(
    private readonly registry: ConnectionRegistry<Names>,
    config: GroupConfig,
  ) {
    this.writeName = config.write as Names;
    this.readNames = config.read as Names[];
    this.readMode = config.readMode ?? "round-robin";
  }

  /** Returns the write adapter. Transactions always use this. */
  getWrite(): IDbAdapter {
    return this.registry.get(this.writeName);
  }

  /** Returns a read adapter based on the configured readMode. */
  getRead(): IDbAdapter {
    if (this.readNames.length === 0) {
      return this.getWrite();
    }

    let name: Names;
    switch (this.readMode) {
      case "round-robin": {
        name = this.pickRead(this.roundRobinIndex++);
        break;
      }
      case "random": {
        name = this.pickRead(Math.floor(Math.random() * this.readNames.length));
        break;
      }
      case "least-load": {
        // Fallback to round-robin — real implementation needs pool stats
        name = this.pickRead(this.roundRobinIndex++);
        break;
      }
    }

    return this.registry.get(name);
  }

  private pickRead(idx: number): Names {
    const name = this.readNames[idx % this.readNames.length];
    if (name === undefined) {
      throw new ConnectionError(
        ErrorCode.INTERNAL_ERROR,
        "Read replica list is unexpectedly empty",
        { operation: "getRead" },
      );
    }
    return name;
  }
}
