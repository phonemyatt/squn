import { describe, it, expect } from "bun:test";
import { createFragment, isSqlFragment, isTvpValue } from "../../../src/sql/fragment.ts";
import type { TvpValue } from "../../../src/sql/fragment.ts";

describe("sql/fragment — SqlFragment", () => {
  it("createFragment returns an object with __isSql: true", () => {
    const f = createFragment("SELECT 1", []);
    expect(f.__isSql).toBe(true);
    expect(f.text).toBe("SELECT 1");
    expect(f.params).toEqual([]);
    expect(f.tvpValues).toEqual([]);
  });

  it("returns an object with a tvpValues array — empty when no TVP", () => {
    const f = createFragment("SELECT 1", [42]);
    expect(f.tvpValues).toEqual([]);
    expect(f.params).toEqual([42]);
  });
});

describe("sql/fragment — isSqlFragment()", () => {
  it("returns true for a SqlFragment", () => {
    const f = createFragment("SELECT 1", []);
    expect(isSqlFragment(f)).toBe(true);
  });

  it("returns false for a plain object", () => {
    expect(isSqlFragment({ text: "hi" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isSqlFragment(null)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isSqlFragment("SELECT 1")).toBe(false);
  });
});

describe("sql/fragment — isTvpValue()", () => {
  it("returns true for a TvpValue", () => {
    const tvp: TvpValue = { __isTvp: true, tableType: {}, rows: [] };
    expect(isTvpValue(tvp)).toBe(true);
  });

  it("returns false for a SqlFragment", () => {
    const f = createFragment("SELECT 1", []);
    expect(isTvpValue(f)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isTvpValue(null)).toBe(false);
  });
});
