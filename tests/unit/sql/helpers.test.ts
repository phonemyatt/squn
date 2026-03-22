import { describe, expect, it } from "bun:test";
import { ErrorCode } from "../../../src/errors/codes.ts";
import { SecurityError } from "../../../src/errors/types.ts";
import {
  sqlIdentifier,
  sqlIf,
  sqlJoin,
  sqlQualifiedIdentifier,
  sqlRaw,
} from "../../../src/sql/helpers.ts";
import { sql } from "../../../src/sql/tag.ts";

describe("sql/helpers — sqlIf()", () => {
  it("returns the fragment when condition is true", () => {
    const f = sqlIf(true, sql`AND active = ${true}`);
    expect(f.text).toContain("AND active");
    expect(f.params).toEqual([true]);
  });

  it("returns an empty fragment when condition is false", () => {
    const f = sqlIf(false, sql`AND active = ${true}`);
    expect(f.text).toBe("");
    expect(f.params).toEqual([]);
  });
});

describe("sql/helpers — sqlJoin()", () => {
  it("joins fragments with the default separator", () => {
    const a = sql`a = ${1}`;
    const b = sql`b = ${2}`;
    const joined = sqlJoin([a, b]);
    expect(joined.text).toBe("a = $1, b = $2");
    expect(joined.params).toEqual([1, 2]);
  });

  it("joins fragments with a custom separator", () => {
    const a = sql`a = ${1}`;
    const b = sql`b = ${2}`;
    const joined = sqlJoin([a, b], " AND ");
    expect(joined.text).toBe("a = $1 AND b = $2");
  });

  it("returns an empty fragment for an empty array", () => {
    const joined = sqlJoin([]);
    expect(joined.text).toBe("");
    expect(joined.params).toEqual([]);
  });

  it("returns a single fragment unchanged", () => {
    const a = sql`x = ${42}`;
    const joined = sqlJoin([a]);
    expect(joined.params).toEqual([42]);
  });
});

describe("sql/helpers — sqlRaw()", () => {
  it("returns a fragment with the raw text and no params", () => {
    const f = sqlRaw("ORDER BY name ASC");
    expect(f.text).toBe("ORDER BY name ASC");
    expect(f.params).toEqual([]);
  });

  it("throws SecurityError on null byte", () => {
    expect(() => sqlRaw("abc\0def")).toThrow(SecurityError);
  });

  it("throws SecurityError on stacked statements", () => {
    expect(() => sqlRaw("; DROP TABLE users")).toThrow(SecurityError);
  });

  it("throws SecurityError on UNION SELECT", () => {
    expect(() => sqlRaw("UNION SELECT 1,2")).toThrow(SecurityError);
  });

  it("throws SecurityError on xp_cmdshell", () => {
    expect(() => sqlRaw("EXEC xp_cmdshell 'dir'")).toThrow(SecurityError);
  });

  it("does not throw on clean SQL text", () => {
    expect(() => sqlRaw("name ASC")).not.toThrow();
  });
});

describe("sql/helpers — sqlIdentifier()", () => {
  it("double-quotes a valid identifier", () => {
    const f = sqlIdentifier("users");
    expect(f.text).toBe('"users"');
  });

  it("throws INVALID_IDENTIFIER for an empty string", () => {
    try {
      sqlIdentifier("");
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(SecurityError);
      expect((e as SecurityError).code).toBe(ErrorCode.INVALID_IDENTIFIER);
    }
  });

  it("throws INVALID_IDENTIFIER for a string exceeding 128 chars", () => {
    expect(() => sqlIdentifier("a".repeat(129))).toThrow(SecurityError);
  });

  it("throws INVALID_IDENTIFIER for a string with invalid chars", () => {
    expect(() => sqlIdentifier("users; DROP")).toThrow(SecurityError);
  });

  it("accepts underscores and digits after first char", () => {
    const f = sqlIdentifier("user_2");
    expect(f.text).toBe('"user_2"');
  });
});

describe("sql/helpers — sqlQualifiedIdentifier()", () => {
  it("produces schema.table format", () => {
    const f = sqlQualifiedIdentifier("dbo", "users");
    expect(f.text).toBe('"dbo"."users"');
  });
});
