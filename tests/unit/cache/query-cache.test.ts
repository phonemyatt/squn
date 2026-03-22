import { describe, it, expect, afterEach } from "bun:test";
import { QueryCache } from "../../../src/cache/query-cache.ts";
import type { CompiledQuery } from "../../../src/cache/query-cache.ts";

function compiled(sql: string): CompiledQuery {
  return { normalizedSql: sql, paramNames: [] };
}

describe("cache/query-cache — QueryCache", () => {
  let cache: QueryCache;

  afterEach(() => {
    cache.clear();
  });

  describe("cache hit", () => {
    it("returns the stored CompiledQuery on a cache hit", () => {
      cache = new QueryCache({ maxSize: 10 });
      const q = compiled("SELECT 1");
      cache.set("SELECT 1", q);
      const result = cache.get("SELECT 1");
      expect(result).toBe(q);
    });

    it("returns the same object reference on repeated gets", () => {
      cache = new QueryCache({ maxSize: 10 });
      const q = compiled("SELECT 1");
      cache.set("SELECT 1", q);
      expect(cache.get("SELECT 1")).toBe(cache.get("SELECT 1"));
    });
  });

  describe("cache miss", () => {
    it("returns undefined for a key that was never set", () => {
      cache = new QueryCache({ maxSize: 10 });
      expect(cache.get("SELECT 999")).toBeUndefined();
    });

    it("always returns undefined when maxSize is 0 (disabled)", () => {
      cache = new QueryCache({ maxSize: 0 });
      cache.set("SELECT 1", compiled("SELECT 1"));
      expect(cache.get("SELECT 1")).toBeUndefined();
    });

    it("does not store entries when maxSize is 0", () => {
      cache = new QueryCache({ maxSize: 0 });
      cache.set("SELECT 1", compiled("SELECT 1"));
      expect(cache.size).toBe(0);
    });
  });

  describe("LRU eviction", () => {
    it("evicts the oldest entry when maxSize is reached", () => {
      cache = new QueryCache({ maxSize: 2 });
      cache.set("A", compiled("A"));
      cache.set("B", compiled("B"));
      cache.set("C", compiled("C"));

      expect(cache.get("A")).toBeUndefined();
      expect(cache.get("B")).toBeDefined();
      expect(cache.get("C")).toBeDefined();
      expect(cache.size).toBe(2);
    });

    it("accessing an entry makes it the most recently used", () => {
      cache = new QueryCache({ maxSize: 2 });
      cache.set("A", compiled("A"));
      cache.set("B", compiled("B"));

      // Touch A so B becomes the oldest
      cache.get("A");
      cache.set("C", compiled("C"));

      expect(cache.get("A")).toBeDefined();
      expect(cache.get("B")).toBeUndefined();
      expect(cache.get("C")).toBeDefined();
    });

    it("re-setting an existing key updates it without growing size", () => {
      cache = new QueryCache({ maxSize: 2 });
      cache.set("A", compiled("A-v1"));
      cache.set("B", compiled("B"));
      cache.set("A", compiled("A-v2"));

      expect(cache.size).toBe(2);
      expect(cache.get("A")?.normalizedSql).toBe("A-v2");
    });
  });

  describe("TTL expiry", () => {
    it("evicts an entry that has not been used within the TTL window", () => {
      cache = new QueryCache({ maxSize: 10, ttlMs: 1 });
      cache.set("A", compiled("A"));

      // Wait for TTL to expire
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait
      }

      expect(cache.get("A")).toBeUndefined();
    });
  });

  describe("max-age expiry", () => {
    it("evicts an entry that has exceeded its max age since creation", () => {
      cache = new QueryCache({ maxSize: 10, maxAgeMs: 1 });
      cache.set("A", compiled("A"));

      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait
      }

      expect(cache.get("A")).toBeUndefined();
    });
  });

  describe("clear()", () => {
    it("removes all entries", () => {
      cache = new QueryCache({ maxSize: 10 });
      cache.set("A", compiled("A"));
      cache.set("B", compiled("B"));
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get("A")).toBeUndefined();
    });
  });

  describe("hash collision handling", () => {
    it("distinct SQL strings produce distinct cache entries", () => {
      cache = new QueryCache({ maxSize: 100 });
      const q1 = compiled("SELECT id FROM users");
      const q2 = compiled("SELECT name FROM users");
      cache.set("SELECT id FROM users", q1);
      cache.set("SELECT name FROM users", q2);

      expect(cache.get("SELECT id FROM users")).toBe(q1);
      expect(cache.get("SELECT name FROM users")).toBe(q2);
      expect(cache.size).toBe(2);
    });
  });
});
