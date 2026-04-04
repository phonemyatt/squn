import type { IDbAdapter } from "../adapters/base.ts";
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
        name = this.readNames[
          this.roundRobinIndex % this.readNames.length
        ] as Names;
        this.roundRobinIndex++;
        break;
      }
      case "random": {
        const idx = Math.floor(Math.random() * this.readNames.length);
        name = this.readNames[idx] as Names;
        break;
      }
      case "least-load": {
        // Fallback to round-robin — real implementation needs pool stats
        name = this.readNames[
          this.roundRobinIndex % this.readNames.length
        ] as Names;
        this.roundRobinIndex++;
        break;
      }
    }

    return this.registry.get(name);
  }
}
