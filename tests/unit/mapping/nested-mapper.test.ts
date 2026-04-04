import { describe, expect, it } from "bun:test";
import { splitAndMap } from "../../../src/mapping/nested-mapper.ts";
import type { Row } from "../../../src/types/primitives.ts";

const identity = (row: Row): Row => ({ ...row });

describe("mapping/nested-mapper — splitAndMap()", () => {
  it("splits rows at splitOn boundary into nested objects", () => {
    const rows: Row[] = [
      { user_id: 1, user_name: "Alice", role_id: 10, role_name: "Admin" },
    ];
    const result = splitAndMap(
      rows,
      ["role_id"],
      [identity, identity],
    ) as Record<string, unknown>[];
    expect(result).toHaveLength(1);
    expect(result[0]?.user_id).toBe(1);
    expect((result[0]?.role_id as Row).role_id).toBe(10);
  });

  it("deduplicates by primary key", () => {
    const rows: Row[] = [
      { user_id: 1, user_name: "Alice", role_id: 10, role_name: "Admin" },
      { user_id: 1, user_name: "Alice", role_id: 20, role_name: "User" },
    ];
    const result = splitAndMap(
      rows,
      ["role_id"],
      [identity, identity],
    ) as Record<string, unknown>[];
    // Deduplicated by user_id — only one user
    expect(result).toHaveLength(1);
    expect(result[0]?.user_id).toBe(1);
  });

  it("left join sides become null when splitOn column value is null", () => {
    const rows: Row[] = [
      { user_id: 1, user_name: "Alice", role_id: null, role_name: null },
    ];
    const result = splitAndMap(
      rows,
      ["role_id"],
      [identity, identity],
    ) as Record<string, unknown>[];
    expect(result).toHaveLength(1);
    expect(result[0]?.role_id).toBeNull();
  });

  it("returns empty array for empty input", () => {
    expect(splitAndMap([], ["role_id"], [identity, identity])).toEqual([]);
  });

  it("handles multiple rows with different primary keys", () => {
    const rows: Row[] = [
      { id: 1, name: "A", dept_id: 10, dept_name: "Eng" },
      { id: 2, name: "B", dept_id: 20, dept_name: "Sales" },
    ];
    const result = splitAndMap(
      rows,
      ["dept_id"],
      [identity, identity],
    ) as Record<string, unknown>[];
    expect(result).toHaveLength(2);
  });
});
