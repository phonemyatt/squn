import { describe, it, expect } from "bun:test";
import { sql } from "../../../src/sql/tag.ts";
import type { TvpValue } from "../../../src/sql/fragment.ts";

describe("sql — tagged template literal", () => {
  describe("interpolation — scalar values (path 1)", () => {
    it("replaces a single interpolated value with a placeholder and captures the value in params", () => {
      const f = sql`SELECT * FROM users WHERE id = ${42}`;
      expect(f.text).toBe("SELECT * FROM users WHERE id = $1");
      expect(f.params).toEqual([42]);
    });

    it("replaces multiple interpolated values with sequential placeholders in order", () => {
      const f = sql`SELECT * FROM users WHERE active = ${true} AND age >= ${18}`;
      expect(f.text).toBe("SELECT * FROM users WHERE active = $1 AND age >= $2");
      expect(f.params).toEqual([true, 18]);
    });

    it("handles a string value correctly", () => {
      const f = sql`SELECT * FROM users WHERE name = ${"Alice"}`;
      expect(f.params).toEqual(["Alice"]);
    });

    it("handles a number value correctly", () => {
      const f = sql`SELECT * FROM users WHERE id = ${99}`;
      expect(f.params).toEqual([99]);
    });

    it("handles a boolean value correctly", () => {
      const f = sql`SELECT * FROM users WHERE active = ${false}`;
      expect(f.params).toEqual([false]);
    });

    it("handles a null value correctly", () => {
      const f = sql`SELECT * FROM users WHERE deleted_at = ${null}`;
      expect(f.params).toEqual([null]);
    });

    it("handles a Date value correctly", () => {
      const d = new Date("2025-01-01");
      const f = sql`SELECT * FROM users WHERE created_at > ${d}`;
      expect(f.params).toEqual([d]);
    });
  });

  describe("interpolation — nested SqlFragment (path 2)", () => {
    it("merges a nested fragment's text inline at the interpolation site", () => {
      const filter = sql`deleted_at IS NULL AND active = ${true}`;
      const query = sql`SELECT * FROM users WHERE ${filter}`;
      expect(query.text).toBe("SELECT * FROM users WHERE deleted_at IS NULL AND active = $1");
    });

    it("appends a nested fragment's params to the outer params array in correct order", () => {
      const filter = sql`active = ${true} AND age >= ${18}`;
      const query = sql`SELECT * FROM users WHERE ${filter} LIMIT ${10}`;
      expect(query.params).toEqual([true, 18, 10]);
    });

    it("handles three levels of nesting without losing params", () => {
      const inner = sql`age >= ${18}`;
      const middle = sql`active = ${true} AND ${inner}`;
      const outer = sql`SELECT * FROM users WHERE ${middle} LIMIT ${5}`;
      expect(outer.params).toEqual([true, 18, 5]);
      expect(outer.text).toContain("active = $1 AND age >= $2");
      expect(outer.text).toContain("LIMIT $3");
    });

    it("does not insert an extra placeholder when merging a nested fragment", () => {
      const filter = sql`deleted_at IS NULL`;
      const query = sql`SELECT * FROM users WHERE ${filter}`;
      expect(query.text).toBe("SELECT * FROM users WHERE deleted_at IS NULL");
      expect(query.params).toEqual([]);
    });
  });

  describe("interpolation — TvpValue (path 3)", () => {
    const tvpVal: TvpValue = { __isTvp: true, tableType: { name: "UserTvp" }, rows: [{ name: "A" }] };

    it("places a __TVP_0__ sentinel in the text when a TvpValue is interpolated", () => {
      const f = sql`INSERT INTO users SELECT * FROM ${tvpVal}`;
      expect(f.text).toContain("__TVP_0__");
    });

    it("does not add the TvpValue to the params array", () => {
      const f = sql`INSERT INTO users SELECT * FROM ${tvpVal}`;
      expect(f.params).toEqual([]);
    });

    it("places the TvpValue in the tvpValues array at the correct index", () => {
      const f = sql`INSERT INTO users SELECT * FROM ${tvpVal}`;
      expect(f.tvpValues).toHaveLength(1);
      expect(f.tvpValues[0]).toBe(tvpVal);
    });

    it("increments the sentinel index for each additional TVP", () => {
      const tvp2: TvpValue = { __isTvp: true, tableType: { name: "OrderTvp" }, rows: [] };
      const f = sql`SELECT * FROM ${tvpVal} JOIN ${tvp2}`;
      expect(f.text).toContain("__TVP_0__");
      expect(f.text).toContain("__TVP_1__");
      expect(f.tvpValues).toHaveLength(2);
    });

    it("handles a template with both scalar params and a TVP", () => {
      const f = sql`SELECT * FROM ${tvpVal} WHERE active = ${true}`;
      expect(f.tvpValues).toHaveLength(1);
      expect(f.params).toEqual([true]);
      expect(f.text).toContain("__TVP_0__");
      expect(f.text).toContain("$1");
    });
  });

  describe("SqlFragment brand", () => {
    it("returns an object with __isSql: true", () => {
      const f = sql`SELECT 1`;
      expect(f.__isSql).toBe(true);
    });

    it("returns an object with a tvpValues array — empty when no TVP was interpolated", () => {
      const f = sql`SELECT 1`;
      expect(f.tvpValues).toEqual([]);
    });
  });
});
