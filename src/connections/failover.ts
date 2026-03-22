import type { IDbAdapter } from "../adapters/base.ts";
import { ErrorCode } from "../errors/codes.ts";
import { ConnectionError } from "../errors/types.ts";
import type { ConnectionRegistry } from "./registry.ts";

/**
 * Failover group. When primary is unreachable, promotes first healthy standby.
 *
 * **Important caveats:**
 * - In-flight transactions are lost on failover — they cannot be replayed.
 * - Replication lag creates a data loss window — reads from the new primary
 *   may return stale data until the standby catches up.
 * - Split-brain is not automatically prevented — if the original primary
 *   recovers while a standby has been promoted, both may accept writes.
 *   Use external fencing (e.g. pg_rewind, STONITH) to prevent this.
 */
export class FailoverGroup<Names extends string = string> {
  private readonly primaryName: Names;
  private readonly standbyNames: readonly Names[];
  private activeName: Names;

  constructor(
    private readonly registry: ConnectionRegistry<Names>,
    primaryName: Names,
    standbyNames: readonly Names[],
  ) {
    this.primaryName = primaryName;
    this.standbyNames = standbyNames;
    this.activeName = primaryName;
  }

  /** Returns the currently active adapter (primary or promoted standby). */
  getActive(): IDbAdapter {
    return this.registry.get(this.activeName);
  }

  /** Attempts to promote the first healthy standby. Throws if all unreachable. */
  async failover(): Promise<Names> {
    for (const name of this.standbyNames) {
      try {
        const adapter = this.registry.get(name);
        await adapter.ping();
        this.activeName = name;
        return name;
      } catch {
        // Try next standby
      }
    }

    throw new ConnectionError(
      ErrorCode.CONN_FAILOVER_EXHAUSTED,
      "All standbys unreachable — failover failed",
      { operation: "failover", registeredNames: this.registry.names() },
    );
  }

  /** Whether the active connection is still the original primary. */
  get isOnPrimary(): boolean {
    return this.activeName === this.primaryName;
  }

  get active(): Names {
    return this.activeName;
  }
}
