import { describe, expect, it } from "bun:test";
import type { IDbAdapter, TvpMaterialised, TvpValue } from "../../../src/adapters/base.ts";
import { cursorPage, decodeCursor, encodeCursor } from "../../../src/pagination/cursor.ts";
import { createFragment } from "../../../src/sql/fragment.ts";
import type { Row } from "../../../src/types/primitives.ts";

interface Item {
  id: number;
  name: string;
  createdAt: string;
}

function mockAdapter(
  rows: Row[],
): IDbAdapter & { calls: Array<{ sql: string; params: readonly unknown[] }> } {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  return {
    type: "sqlite",
    calls,
    async query(sql: string, params: readonly unknown[]) {
      calls.push({ sql, params });
      return rows;
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

const baseFragment = createFragment("SELECT * FROM items WHERE active = $1", [true]);

describe("pagination/cursor — encodeCursor / decodeCursor", () => {
  it("round-trips a payload", () => {
    const payload = { value: "2024-01-01", id: 42 };
    const cursor = encodeCursor(payload);
    expect(typeof cursor).toBe("string");
    const decoded = decodeCursor(cursor);
    expect(decoded.value).toBe("2024-01-01");
    expect(decoded.id).toBe(42);
  });

  it("decodeCursor throws ValidationError on non-base64 junk", () => {
    expect(() => decodeCursor("!!!not-a-cursor!!!")).toThrow();
  });

  it("decodeCursor throws ValidationError when JSON is valid but missing fields", () => {
    const bad = Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64");
    expect(() => decodeCursor(bad)).toThrow();
  });
});

describe("pagination/cursor — cursorPage()", () => {
  describe("first page (no cursor)", () => {
    it("appends ORDER BY and LIMIT without a WHERE clause", async () => {
      const rows: Row[] = [
        { id: 1, name: "A", createdAt: "2024-01-01" },
        { id: 2, name: "B", createdAt: "2024-01-02" },
      ];
      const adapter = mockAdapter(rows);

      await cursorPage<Item>(adapter, baseFragment, {
        limit: 10,
        cursorColumn: "createdAt",
      });

      const call = adapter.calls[0];
      expect(call?.sql).toContain('ORDER BY "createdAt" ASC LIMIT $2');
      // No extra AND clause appended for cursor (first page)
      expect(call?.sql).not.toContain('AND "createdAt"');
      // params: existing [true] + [limit+1]
      expect(call?.params).toEqual([true, 11]);
    });

    it("prevCursor is null on the first page", async () => {
      const adapter = mockAdapter([{ id: 1, name: "A", createdAt: "2024-01-01" }]);
      const result = await cursorPage<Item>(adapter, baseFragment, {
        limit: 10,
        cursorColumn: "createdAt",
      });
      expect(result.prevCursor).toBeNull();
    });

    it("nextCursor is null when result count is within limit", async () => {
      const rows: Row[] = [{ id: 1, name: "A", createdAt: "2024-01-01" }];
      const adapter = mockAdapter(rows);

      const result = await cursorPage<Item>(adapter, baseFragment, {
        limit: 10,
        cursorColumn: "createdAt",
      });

      expect(result.nextCursor).toBeNull();
      expect(result.hasNext).toBe(false);
    });
  });

  describe("subsequent page (with cursor)", () => {
    it("appends AND cursorColumn > $n clause from the decoded cursor", async () => {
      const cursor = encodeCursor({ value: "2024-01-05", id: 5 });
      const adapter = mockAdapter([]);

      await cursorPage<Item>(adapter, baseFragment, {
        cursor,
        limit: 10,
        cursorColumn: "createdAt",
      });

      const call = adapter.calls[0];
      // existing param count = 1, so cursor value is $2, limit is $3
      expect(call?.sql).toContain('AND "createdAt" > $2');
      expect(call?.sql).toContain("LIMIT $3");
      expect(call?.params).toEqual([true, "2024-01-05", 11]);
    });

    it("uses < operator when direction=desc", async () => {
      const cursor = encodeCursor({ value: "2024-01-05", id: 5 });
      const adapter = mockAdapter([]);

      await cursorPage<Item>(adapter, baseFragment, {
        cursor,
        limit: 5,
        cursorColumn: "createdAt",
        direction: "desc",
      });

      const call = adapter.calls[0];
      expect(call?.sql).toContain('AND "createdAt" < $2');
      expect(call?.sql).toContain('ORDER BY "createdAt" DESC');
    });

    it("sets prevCursor from the first row when a cursor was passed", async () => {
      const incomingCursor = encodeCursor({ value: "2024-01-05", id: 5 });
      const rows: Row[] = [
        { id: 6, name: "F", createdAt: "2024-01-06" },
        { id: 7, name: "G", createdAt: "2024-01-07" },
      ];
      const adapter = mockAdapter(rows);

      const result = await cursorPage<Item>(adapter, baseFragment, {
        cursor: incomingCursor,
        limit: 10,
        cursorColumn: "createdAt",
      });

      expect(result.prevCursor).not.toBeNull();
      const decoded = decodeCursor(result.prevCursor as string);
      expect(decoded.value).toBe("2024-01-06");
    });
  });

  describe("hasNext detection via extra row", () => {
    it("hasNext=true and nextCursor set when adapter returns limit+1 rows", async () => {
      // limit=2, adapter returns 3 rows (limit+1)
      const rows: Row[] = [
        { id: 1, name: "A", createdAt: "2024-01-01" },
        { id: 2, name: "B", createdAt: "2024-01-02" },
        { id: 3, name: "C", createdAt: "2024-01-03" },
      ];
      const adapter = mockAdapter(rows);

      const result = await cursorPage<Item>(adapter, baseFragment, {
        limit: 2,
        cursorColumn: "createdAt",
      });

      expect(result.hasNext).toBe(true);
      expect(result.nextCursor).not.toBeNull();
      // Extra row trimmed — only 2 rows in the result
      expect(result.rows).toHaveLength(2);
    });

    it("nextCursor encodes the last returned row's cursor column value", async () => {
      const rows: Row[] = [
        { id: 1, name: "A", createdAt: "2024-01-01" },
        { id: 2, name: "B", createdAt: "2024-01-02" },
        { id: 3, name: "C", createdAt: "2024-01-03" }, // extra
      ];
      const adapter = mockAdapter(rows);

      const result = await cursorPage<Item>(adapter, baseFragment, {
        limit: 2,
        cursorColumn: "createdAt",
      });

      const decoded = decodeCursor(result.nextCursor as string);
      expect(decoded.value).toBe("2024-01-02"); // last of the 2 returned rows
    });

    it("hasNext=false and nextCursor=null when result count equals limit exactly", async () => {
      const rows: Row[] = [
        { id: 1, name: "A", createdAt: "2024-01-01" },
        { id: 2, name: "B", createdAt: "2024-01-02" },
      ];
      const adapter = mockAdapter(rows);

      const result = await cursorPage<Item>(adapter, baseFragment, {
        limit: 2,
        cursorColumn: "createdAt",
      });

      expect(result.hasNext).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.rows).toHaveLength(2);
    });
  });

  describe("fragment without existing params", () => {
    it("correctly numbers LIMIT placeholder as $1 when no existing params", async () => {
      const noParamFragment = createFragment("SELECT * FROM items", []);
      const adapter = mockAdapter([]);

      await cursorPage<Item>(adapter, noParamFragment, {
        limit: 5,
        cursorColumn: "id",
      });

      const call = adapter.calls[0];
      expect(call?.sql).toContain("LIMIT $1");
      expect(call?.params).toEqual([6]);
    });
  });
});
