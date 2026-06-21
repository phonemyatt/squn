import { describe, expect, it, mock } from "bun:test";
import type {
  IDbAdapter,
  IDbTransaction,
  TvpMaterialised,
  TvpValue,
} from "../../../src/adapters/base.ts";
import { createCachedDb } from "../../../src/cache/cached-db.ts";
import type { Row } from "../../../src/types/primitives.ts";

// ---------------------------------------------------------------------------
// Minimal stub adapter
// ---------------------------------------------------------------------------

function makeStubAdapter(overrides: Partial<IDbAdapter> = {}): IDbAdapter & {
  queryCalls: number;
} {
  let queryCalls = 0;

  const stub = {
    get queryCalls() {
      return queryCalls;
    },
    type: "sqlite" as const,
    async query(_sql: string, _params: readonly unknown[]): Promise<Row[]> {
      queryCalls++;
      return [{ value: queryCalls }];
    },
    async execute(_sql: string, _params: readonly unknown[]) {
      return { rowsAffected: 1 };
    },
    async queryMultiple(_sql: string, _params: readonly unknown[]) {
      return [] as Row[][];
    },
    async executeBatch(
      _sql: string,
      _rows: readonly Record<string, unknown>[],
      _paramNames: readonly string[],
    ) {
      return { rowsAffected: 0 };
    },
    async beginTransaction(): Promise<IDbTransaction> {
      throw new Error("not implemented in stub");
    },
    hasCursorSupport() {
      return false;
    },
    async ping() {},
    async close() {},
    async materializeTvp(_tvp: TvpValue, _index: number): Promise<TvpMaterialised> {
      throw new Error("not implemented in stub");
    },
    ...overrides,
  };

  return stub;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cache/cached-db — createCachedDb()", () => {
  describe("cache miss", () => {
    it("calls the underlying adapter on the first query", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 5_000 });

      const rows = await db.query("SELECT 1", []);
      expect(adapter.queryCalls).toBe(1);
      expect(rows).toEqual([{ value: 1 }]);
    });

    it("records the miss in stats()", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 5_000 });

      await db.query("SELECT 1", []);
      expect(db.stats().misses).toBe(1);
      expect(db.stats().hits).toBe(0);
    });
  });

  describe("cache hit", () => {
    it("does not call the adapter on the second query with the same sql+params", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 5_000 });

      await db.query("SELECT 1", []);
      await db.query("SELECT 1", []);

      expect(adapter.queryCalls).toBe(1);
    });

    it("returns the same rows on subsequent hits", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 5_000 });

      const first = await db.query("SELECT 1", []);
      const second = await db.query("SELECT 1", []);

      expect(second).toEqual(first);
    });

    it("records hit in stats()", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 5_000 });

      await db.query("SELECT 1", []);
      await db.query("SELECT 1", []);

      const s = db.stats();
      expect(s.hits).toBe(1);
      expect(s.misses).toBe(1);
    });

    it("treats different params as different cache keys", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 5_000 });

      await db.query("SELECT $1", [1]);
      await db.query("SELECT $1", [2]);

      expect(adapter.queryCalls).toBe(2);
    });

    it("treats different SQL as different cache keys", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 5_000 });

      await db.query("SELECT 1", []);
      await db.query("SELECT 2", []);

      expect(adapter.queryCalls).toBe(2);
    });
  });

  describe("TTL expiry", () => {
    it("re-fetches after the TTL window has elapsed", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 1 });

      await db.query("SELECT 1", []);

      // Busy-wait until at least 5 ms have passed (TTL = 1 ms)
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait
      }

      await db.query("SELECT 1", []);
      expect(adapter.queryCalls).toBe(2);
    });

    it("records a second miss after TTL expiry", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 1 });

      await db.query("SELECT 1", []);

      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait
      }

      await db.query("SELECT 1", []);
      expect(db.stats().misses).toBe(2);
    });
  });

  describe("invalidate()", () => {
    it("no-argument call clears all entries", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 60_000 });

      await db.query("SELECT 1", []);
      await db.query("SELECT 2", []);
      expect(db.stats().size).toBe(2);

      db.invalidate();
      expect(db.stats().size).toBe(0);
    });

    it("after invalidate() the adapter is called again on the next query", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 60_000 });

      await db.query("SELECT 1", []);
      db.invalidate();
      await db.query("SELECT 1", []);

      expect(adapter.queryCalls).toBe(2);
    });

    it("string argument removes only that exact key", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, {
        ttl: 60_000,
        keyFn: (sql, _params) => sql, // predictable key = the SQL itself
      });

      await db.query("SELECT 1", []);
      await db.query("SELECT 2", []);

      db.invalidate("SELECT 1");

      // SELECT 1 must be re-fetched; SELECT 2 should still be cached
      await db.query("SELECT 1", []);
      await db.query("SELECT 2", []);

      expect(adapter.queryCalls).toBe(3); // 1+1+1 = original two + one re-fetch
    });

    it("RegExp argument removes all matching keys", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, {
        ttl: 60_000,
        keyFn: (sql, _params) => sql,
      });

      await db.query("SELECT users", []);
      await db.query("SELECT orders", []);
      await db.query("SELECT products", []);

      db.invalidate(/^SELECT (users|orders)$/);

      // Both matched entries should be re-fetched
      await db.query("SELECT users", []);
      await db.query("SELECT orders", []);
      // products should still be cached
      await db.query("SELECT products", []);

      expect(adapter.queryCalls).toBe(5); // 3 initial + 2 re-fetches
    });
  });

  describe("stats()", () => {
    it("starts at zero", () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 5_000 });

      const s = db.stats();
      expect(s.hits).toBe(0);
      expect(s.misses).toBe(0);
      expect(s.size).toBe(0);
    });

    it("reflects correct size after entries are added", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 60_000 });

      await db.query("SELECT 1", []);
      await db.query("SELECT 2", []);
      await db.query("SELECT 1", []); // hit, no new entry

      const s = db.stats();
      expect(s.size).toBe(2);
      expect(s.hits).toBe(1);
      expect(s.misses).toBe(2);
    });

    it("size drops to zero after invalidate()", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 60_000 });

      await db.query("SELECT 1", []);
      db.invalidate();

      expect(db.stats().size).toBe(0);
    });
  });

  describe("maxSize eviction", () => {
    it("does not grow beyond maxSize", async () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, {
        ttl: 60_000,
        maxSize: 2,
        keyFn: (sql, _params) => sql,
      });

      await db.query("A", []);
      await db.query("B", []);
      await db.query("C", []);

      expect(db.stats().size).toBe(2);
    });
  });

  describe("custom keyFn", () => {
    it("uses the provided keyFn to build cache keys", async () => {
      const keyFn = mock((_sql: string, _params: readonly unknown[]) => "constant-key");

      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 60_000, keyFn });

      await db.query("SELECT 1", [1]);
      await db.query("SELECT 99", [2]); // different sql+params but same key → hit

      expect(keyFn).toHaveBeenCalledTimes(2);
      expect(adapter.queryCalls).toBe(1);
    });
  });

  describe("delegation — non-query methods", () => {
    it("delegates execute() to the underlying adapter", async () => {
      let called = false;
      const adapter = makeStubAdapter({
        async execute(_sql, _params) {
          called = true;
          return { rowsAffected: 3 };
        },
      });
      const db = createCachedDb(adapter, { ttl: 5_000 });

      const result = await db.execute("DELETE FROM t", []);
      expect(called).toBe(true);
      expect(result.rowsAffected).toBe(3);
    });

    it("exposes the underlying adapter's type", () => {
      const adapter = makeStubAdapter();
      const db = createCachedDb(adapter, { ttl: 5_000 });
      expect(db.type).toBe("sqlite");
    });
  });
});
