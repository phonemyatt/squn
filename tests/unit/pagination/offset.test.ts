import { describe, expect, it } from "bun:test";
import type { IDbAdapter, TvpMaterialised, TvpValue } from "../../../src/adapters/base.ts";
import { offsetPage } from "../../../src/pagination/offset.ts";
import { createFragment } from "../../../src/sql/fragment.ts";
import type { Row } from "../../../src/types/primitives.ts";

interface User {
  id: number;
  name: string;
}

/**
 * Mock adapter that records every (sql, params) pair passed to query().
 * First call returns `dataRows`, second call returns `[{ __count: totalCount }]`.
 */
function mockAdapter(
  dataRows: Row[],
  totalCount: number,
): IDbAdapter & { calls: Array<{ sql: string; params: readonly unknown[] }> } {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  let callIndex = 0;

  return {
    type: "sqlite",
    calls,
    async query(sql: string, params: readonly unknown[]) {
      calls.push({ sql, params });
      const idx = callIndex++;
      // We run two queries in parallel via Promise.all — order is paged first, count second.
      // We rely on push order in the mock: first query → data, second → count.
      if (idx === 0) return dataRows;
      return [{ __count: totalCount }] as Row[];
    },
    async execute(_s, _p) {
      return { rowsAffected: 0 };
    },
    async queryMultiple(_s, _p) {
      return [];
    },
    async executeBatch(_s, _rows, _p) {
      return { rowsAffected: 0 };
    },
    async beginTransaction() {
      throw new Error("not impl");
    },
    hasCursorSupport() {
      return false;
    },
    async ping() {},
    async close() {},
    async materializeTvp(_t: TvpValue, _i: number): Promise<TvpMaterialised> {
      throw new Error("not impl");
    },
  };
}

const baseFragment = createFragment("SELECT * FROM users WHERE active = $1", [true]);

describe("pagination/offset — offsetPage()", () => {
  describe("SQL construction", () => {
    it("appends LIMIT and OFFSET to the fragment SQL", async () => {
      const adapter = mockAdapter([], 0);
      await offsetPage(adapter, baseFragment, { page: 1, pageSize: 10 });

      const pagedCall = adapter.calls.find((c) => c.sql.includes("LIMIT"));
      expect(pagedCall).toBeDefined();
      expect(pagedCall?.sql).toContain("LIMIT $2 OFFSET $3");
    });

    it("wraps the fragment as a subquery for the count query", async () => {
      const adapter = mockAdapter([], 0);
      await offsetPage(adapter, baseFragment, { page: 1, pageSize: 10 });

      const countCall = adapter.calls.find((c) => c.sql.includes("COUNT(*)"));
      expect(countCall).toBeDefined();
      expect(countCall?.sql).toContain("SELECT COUNT(*) AS __count FROM (");
      expect(countCall?.sql).toContain(") AS __sq");
    });

    it("passes correct LIMIT and OFFSET params for page 1", async () => {
      const adapter = mockAdapter([], 20);
      await offsetPage(adapter, baseFragment, { page: 1, pageSize: 5 });

      const pagedCall = adapter.calls.find((c) => c.sql.includes("LIMIT"));
      // params: [true (existing), 5 (limit), 0 (offset)]
      expect(pagedCall?.params).toEqual([true, 5, 0]);
    });

    it("passes correct OFFSET for page 3 with pageSize 10", async () => {
      const adapter = mockAdapter([], 40);
      await offsetPage(adapter, baseFragment, { page: 3, pageSize: 10 });

      const pagedCall = adapter.calls.find((c) => c.sql.includes("LIMIT"));
      expect(pagedCall?.params).toEqual([true, 10, 20]);
    });

    it("re-uses existing fragment params in the count query", async () => {
      const adapter = mockAdapter([], 0);
      await offsetPage(adapter, baseFragment, { page: 1, pageSize: 5 });

      const countCall = adapter.calls.find((c) => c.sql.includes("COUNT(*)"));
      expect(countCall?.params).toEqual([true]);
    });
  });

  describe("page metadata", () => {
    it("returns the correct total from the count query", async () => {
      const rows: Row[] = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];
      const adapter = mockAdapter(rows, 25);
      const result = await offsetPage<User>(adapter, baseFragment, { page: 1, pageSize: 10 });

      expect(result.total).toBe(25);
    });

    it("computes totalPages correctly", async () => {
      const adapter = mockAdapter([], 25);
      const result = await offsetPage<User>(adapter, baseFragment, { page: 1, pageSize: 10 });

      expect(result.totalPages).toBe(3);
    });

    it("reflects the requested page and pageSize", async () => {
      const adapter = mockAdapter([], 50);
      const result = await offsetPage<User>(adapter, baseFragment, { page: 2, pageSize: 10 });

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
    });

    it("returns the rows from the data query", async () => {
      const rows: Row[] = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];
      const adapter = mockAdapter(rows, 2);
      const result = await offsetPage<User>(adapter, baseFragment, { page: 1, pageSize: 10 });

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.name).toBe("Alice");
    });
  });

  describe("hasPrev / hasNext flags", () => {
    it("page 1 hasPrev=false", async () => {
      const adapter = mockAdapter([], 20);
      const result = await offsetPage<User>(adapter, baseFragment, { page: 1, pageSize: 5 });
      expect(result.hasPrev).toBe(false);
    });

    it("page 1 hasNext=true when more pages exist", async () => {
      const adapter = mockAdapter([], 20);
      const result = await offsetPage<User>(adapter, baseFragment, { page: 1, pageSize: 5 });
      expect(result.hasNext).toBe(true);
    });

    it("last page hasNext=false", async () => {
      const adapter = mockAdapter([], 20);
      const result = await offsetPage<User>(adapter, baseFragment, { page: 4, pageSize: 5 });
      expect(result.hasNext).toBe(false);
    });

    it("last page hasPrev=true", async () => {
      const adapter = mockAdapter([], 20);
      const result = await offsetPage<User>(adapter, baseFragment, { page: 4, pageSize: 5 });
      expect(result.hasPrev).toBe(true);
    });

    it("single page hasPrev=false and hasNext=false", async () => {
      const adapter = mockAdapter([], 3);
      const result = await offsetPage<User>(adapter, baseFragment, { page: 1, pageSize: 10 });
      expect(result.hasPrev).toBe(false);
      expect(result.hasNext).toBe(false);
    });

    it("middle page hasPrev=true and hasNext=true", async () => {
      const adapter = mockAdapter([], 30);
      const result = await offsetPage<User>(adapter, baseFragment, { page: 2, pageSize: 10 });
      expect(result.hasPrev).toBe(true);
      expect(result.hasNext).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("total=0 gives totalPages=0 and no prev/next", async () => {
      const adapter = mockAdapter([], 0);
      const result = await offsetPage<User>(adapter, baseFragment, { page: 1, pageSize: 10 });
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(false);
    });

    it("works with a fragment that has no existing params", async () => {
      const noParamFragment = createFragment("SELECT * FROM items", []);
      const adapter = mockAdapter([], 5);
      await offsetPage<User>(adapter, noParamFragment, { page: 1, pageSize: 5 });

      const pagedCall = adapter.calls.find((c) => c.sql.includes("LIMIT"));
      expect(pagedCall?.sql).toContain("LIMIT $1 OFFSET $2");
      expect(pagedCall?.params).toEqual([5, 0]);
    });
  });
});
