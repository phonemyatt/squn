import type { PooledConnection } from "./connection.ts";

export type ReapCallback = (conn: PooledConnection) => void;

/**
 * Background reaper that evicts idle and dead MSSQL connections on an interval.
 * Calls the provided callback for each connection that should be destroyed.
 */
export class ConnectionReaper {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(
    intervalMs: number,
    idleTimeoutMs: number,
    getIdleConnections: () => PooledConnection[],
    onEvict: ReapCallback,
  ): void {
    if (this.timer !== null) return;

    this.timer = setInterval(() => {
      const now = Date.now();
      const idle = getIdleConnections();
      for (const conn of idle) {
        if (conn.state === "DEAD") {
          onEvict(conn);
          continue;
        }
        if (now - conn.lastUsedAt >= idleTimeoutMs) {
          conn.markDead();
          onEvict(conn);
        }
      }
    }, intervalMs);

    if (typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
