import { ErrorCode } from "../errors/codes.ts";
import { ConnectionError } from "../errors/types.ts";
import { PooledConnection } from "./connection.ts";
import { ConnectionReaper } from "./reaper.ts";
import type { PoolStatsSnapshot } from "./stats.ts";
import { PoolStats } from "./stats.ts";

export interface PoolConfig {
  readonly min?: number;
  readonly max?: number;
  readonly acquireTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly maxConnectionAgeMs?: number;
  readonly maxUseCount?: number;
  readonly reapIntervalMs?: number;
  readonly maxQueueSize?: number;
  readonly onConnect?: (conn: PooledConnection) => void;
  readonly onAcquire?: (conn: PooledConnection) => void;
  readonly onRelease?: (conn: PooledConnection) => void;
  readonly onDestroy?: (conn: PooledConnection) => void;
  readonly onError?: (err: unknown) => void;
}

interface Waiter {
  resolve: (conn: PooledConnection) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Connection pool for MSSQL. Bun.SQL (PG/MySQL) manages its own pool internally.
 */
export class ConnectionPool {
  private readonly idle: PooledConnection[] = [];
  private readonly acquired = new Set<PooledConnection>();
  private readonly queue: Waiter[] = [];
  private readonly stats: PoolStats;
  private readonly reaper: ConnectionReaper;
  private readonly config: Required<
    Pick<PoolConfig, "min" | "max" | "acquireTimeoutMs" | "idleTimeoutMs" | "maxQueueSize">
  > &
    PoolConfig;
  private totalCreated = 0;
  private drained = false;

  constructor(config: PoolConfig = {}) {
    this.config = {
      ...config,
      min: config.min ?? 1,
      max: config.max ?? 10,
      acquireTimeoutMs: config.acquireTimeoutMs ?? 5_000,
      idleTimeoutMs: config.idleTimeoutMs ?? 30_000,
      maxQueueSize: config.maxQueueSize ?? 100,
    };
    this.stats = new PoolStats();
    this.reaper = new ConnectionReaper();

    const reapInterval = config.reapIntervalMs ?? 1_000;
    if (reapInterval > 0) {
      this.reaper.start(
        reapInterval,
        this.config.idleTimeoutMs,
        () => [...this.idle],
        (conn) => this.destroyConnection(conn),
      );
    }
  }

  /** Acquires a connection from the pool. */
  acquire(): Promise<PooledConnection> {
    if (this.drained) {
      return Promise.reject(
        new ConnectionError(ErrorCode.POOL_QUEUE_FULL, "Pool has been drained", {
          operation: "acquire",
        }),
      );
    }

    // Try idle connection
    const conn = this.idle.pop();
    if (conn !== undefined) {
      if (conn.shouldRecycle(this.config.maxConnectionAgeMs, this.config.maxUseCount)) {
        this.destroyConnection(conn);
        return this.acquire();
      }
      conn.markAcquired();
      this.acquired.add(conn);
      this.stats.recordAcquire(0);
      this.config.onAcquire?.(conn);
      return Promise.resolve(conn);
    }

    // Create new if under max
    if (this.idle.length + this.acquired.size < this.config.max) {
      const newConn = this.createConnection();
      newConn.markIdle();
      newConn.markAcquired();
      this.acquired.add(newConn);
      this.stats.recordAcquire(0);
      this.config.onAcquire?.(newConn);
      return Promise.resolve(newConn);
    }

    // Queue
    if (this.queue.length >= this.config.maxQueueSize) {
      return Promise.reject(
        new ConnectionError(ErrorCode.POOL_QUEUE_FULL, "Pool acquire queue is full", {
          operation: "acquire",
        }),
      );
    }

    const start = Date.now();
    return new Promise<PooledConnection>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(
          new ConnectionError(ErrorCode.POOL_QUEUE_FULL, "Pool acquire timeout", {
            operation: "acquire",
            durationMs: Date.now() - start,
          }),
        );
      }, this.config.acquireTimeoutMs);

      this.queue.push({ resolve, reject, timer });
    });
  }

  /** Releases a connection back to the pool. */
  release(conn: PooledConnection): void {
    this.acquired.delete(conn);
    const useMs = conn.acquiredAt !== null ? Date.now() - conn.acquiredAt : 0;
    this.stats.recordUse(useMs);
    this.config.onRelease?.(conn);

    if (conn.shouldRecycle(this.config.maxConnectionAgeMs, this.config.maxUseCount)) {
      this.destroyConnection(conn);
      return;
    }

    // Hand to a waiter if any
    const waiter = this.queue.shift();
    if (waiter !== undefined) {
      clearTimeout(waiter.timer);
      conn.markAcquired();
      this.acquired.add(conn);
      this.stats.recordAcquire(0);
      this.config.onAcquire?.(conn);
      waiter.resolve(conn);
      return;
    }

    conn.markIdle();
    this.idle.push(conn);
    this.stats.recordIdle(0);
  }

  /** Gracefully drains the pool — stops new acquires, waits for in-flight, closes all. */
  async drain(options?: { timeoutMs?: number }): Promise<void> {
    this.drained = true;
    this.reaper.stop();

    // Reject all waiters
    for (const waiter of this.queue) {
      clearTimeout(waiter.timer);
      waiter.reject(
        new ConnectionError(ErrorCode.POOL_QUEUE_FULL, "Pool is draining", {
          operation: "drain",
        }),
      );
    }
    this.queue.length = 0;

    // Wait for acquired connections to be released
    if (this.acquired.size > 0 && options?.timeoutMs !== undefined) {
      await Promise.race([
        new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (this.acquired.size === 0) {
              clearInterval(check);
              resolve();
            }
          }, 50);
        }),
        Bun.sleep(options.timeoutMs),
      ]);
    }

    // Destroy all remaining
    for (const conn of [...this.idle]) {
      this.destroyConnection(conn);
    }
    for (const conn of [...this.acquired]) {
      this.destroyConnection(conn);
    }
  }

  /** Returns a snapshot of current pool metrics. */
  poolStats(): PoolStatsSnapshot {
    return this.stats.snapshot(
      this.idle.length,
      this.acquired.size,
      this.queue.length,
      this.config.min,
      this.config.max,
    );
  }

  private createConnection(): PooledConnection {
    this.totalCreated++;
    const conn = new PooledConnection(`conn-${this.totalCreated}`);
    this.stats.recordCreated();
    this.config.onConnect?.(conn);
    return conn;
  }

  private destroyConnection(conn: PooledConnection): void {
    conn.markDead();
    this.acquired.delete(conn);
    const idx = this.idle.indexOf(conn);
    if (idx !== -1) this.idle.splice(idx, 1);
    this.stats.recordDestroyed();
    this.config.onDestroy?.(conn);
  }
}
