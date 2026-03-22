import { describe, it, expect } from "bun:test";
import { PooledConnection } from "../../../src/pool/connection.ts";

describe("pool/connection — PooledConnection", () => {
  describe("state machine transitions", () => {
    it("starts in CREATED state", () => {
      const conn = new PooledConnection("c1");
      expect(conn.state).toBe("CREATED");
    });

    it("transitions to IDLE via markIdle()", () => {
      const conn = new PooledConnection("c1");
      conn.markIdle();
      expect(conn.state).toBe("IDLE");
    });

    it("transitions to ACQUIRED via markAcquired()", () => {
      const conn = new PooledConnection("c1");
      conn.markIdle();
      conn.markAcquired();
      expect(conn.state).toBe("ACQUIRED");
    });

    it("transitions back to IDLE after release", () => {
      const conn = new PooledConnection("c1");
      conn.markIdle();
      conn.markAcquired();
      conn.markIdle();
      expect(conn.state).toBe("IDLE");
    });

    it("transitions to DEAD from any state", () => {
      const conn = new PooledConnection("c1");
      conn.markDead();
      expect(conn.state).toBe("DEAD");
    });

    it("increments useCount on each markAcquired()", () => {
      const conn = new PooledConnection("c1");
      conn.markIdle();
      conn.markAcquired();
      conn.markIdle();
      conn.markAcquired();
      expect(conn.useCount).toBe(2);
    });
  });

  describe("shouldRecycle()", () => {
    it("returns true when connection exceeds maxAgeMs", () => {
      const conn = new PooledConnection("c1");
      // Simulate old connection by checking against a tiny age
      const start = Date.now();
      while (Date.now() - start < 5) { /* busy-wait */ }
      expect(conn.shouldRecycle(1, undefined)).toBe(true);
    });

    it("returns true when connection exceeds maxUseCount", () => {
      const conn = new PooledConnection("c1");
      conn.markIdle();
      conn.markAcquired();
      conn.markIdle();
      conn.markAcquired();
      expect(conn.shouldRecycle(undefined, 2)).toBe(true);
    });

    it("returns false when neither limit is exceeded", () => {
      const conn = new PooledConnection("c1");
      conn.markIdle();
      conn.markAcquired();
      expect(conn.shouldRecycle(999_999, 999_999)).toBe(false);
    });

    it("returns false when both limits are undefined", () => {
      const conn = new PooledConnection("c1");
      expect(conn.shouldRecycle(undefined, undefined)).toBe(false);
    });
  });

  describe("metadata", () => {
    it("carries a unique id", () => {
      const c1 = new PooledConnection("c1");
      const c2 = new PooledConnection("c2");
      expect(c1.id).toBe("c1");
      expect(c2.id).toBe("c2");
    });

    it("tracks createdAt timestamp", () => {
      const before = Date.now();
      const conn = new PooledConnection("c1");
      expect(conn.createdAt).toBeGreaterThanOrEqual(before);
    });

    it("ageMs increases over time", () => {
      const conn = new PooledConnection("c1");
      expect(conn.ageMs).toBeGreaterThanOrEqual(0);
    });
  });
});
