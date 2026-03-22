import { describe, it, expect } from "bun:test";
import { ConnectionPool } from "../../../src/pool/pool.ts";
import { ConnectionError } from "../../../src/errors/types.ts";
import { ErrorCode } from "../../../src/errors/codes.ts";

describe("pool/pool — ConnectionPool", () => {
  describe("acquire()", () => {
    it("returns a connection immediately when pool is below max", async () => {
      const pool = new ConnectionPool({ max: 5, reapIntervalMs: 0 });
      const conn = await pool.acquire();
      expect(conn).toBeDefined();
      expect(conn.state).toBe("ACQUIRED");
      pool.release(conn);
    });

    it("creates a new connection when none are idle and pool is below max", async () => {
      const pool = new ConnectionPool({ max: 2, reapIntervalMs: 0 });
      const c1 = await pool.acquire();
      const c2 = await pool.acquire();
      expect(c1.id).not.toBe(c2.id);
      pool.release(c1);
      pool.release(c2);
    });

    it("resolves a queued request when a connection is released", async () => {
      const pool = new ConnectionPool({ max: 1, reapIntervalMs: 0 });
      const c1 = await pool.acquire();

      const pending = pool.acquire();
      // Release c1 so the pending acquire can resolve
      setTimeout(() => pool.release(c1), 10);
      const c2 = await pending;
      expect(c2).toBeDefined();
      pool.release(c2);
    });

    it("throws POOL_QUEUE_FULL when the queue reaches maxQueueSize", async () => {
      const pool = new ConnectionPool({ max: 1, maxQueueSize: 1, acquireTimeoutMs: 50, reapIntervalMs: 0 });
      const c1 = await pool.acquire();

      // Fill the queue
      void pool.acquire().catch(() => {});
      try {
        await pool.acquire();
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ConnectionError);
        expect((e as ConnectionError).code).toBe(ErrorCode.POOL_QUEUE_FULL);
      }
      pool.release(c1);
    });

    it("throws after drain() is called", async () => {
      const pool = new ConnectionPool({ reapIntervalMs: 0 });
      await pool.drain();
      try {
        await pool.acquire();
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ConnectionError);
      }
    });
  });

  describe("release()", () => {
    it("returns the connection to the idle pool when no waiters are queued", async () => {
      const pool = new ConnectionPool({ max: 5, reapIntervalMs: 0 });
      const conn = await pool.acquire();
      pool.release(conn);
      expect(conn.state).toBe("IDLE");
    });

    it("hands the connection directly to a waiter when queue is non-empty", async () => {
      const pool = new ConnectionPool({ max: 1, reapIntervalMs: 0 });
      const c1 = await pool.acquire();

      let resolved = false;
      const pending = pool.acquire().then((c) => {
        resolved = true;
        return c;
      });

      pool.release(c1);
      const c2 = await pending;
      expect(resolved).toBe(true);
      expect(c2.state).toBe("ACQUIRED");
      pool.release(c2);
    });
  });

  describe("drain()", () => {
    it("stops new acquire() calls from succeeding", async () => {
      const pool = new ConnectionPool({ reapIntervalMs: 0 });
      await pool.drain();
      await expect(pool.acquire()).rejects.toThrow();
    });

    it("resolves when the pool is empty", async () => {
      const pool = new ConnectionPool({ reapIntervalMs: 0 });
      const conn = await pool.acquire();
      pool.release(conn);
      await pool.drain();
      const stats = pool.poolStats();
      expect(stats.idle).toBe(0);
    });
  });

  describe("stats()", () => {
    it("reports correct idle and acquired counts", async () => {
      const pool = new ConnectionPool({ max: 5, reapIntervalMs: 0 });
      const c1 = await pool.acquire();
      const c2 = await pool.acquire();

      let stats = pool.poolStats();
      expect(stats.acquired).toBe(2);

      pool.release(c1);
      stats = pool.poolStats();
      expect(stats.idle).toBe(1);
      expect(stats.acquired).toBe(1);

      pool.release(c2);
    });
  });
});
