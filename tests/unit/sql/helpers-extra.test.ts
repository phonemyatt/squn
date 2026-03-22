import { describe, expect, it } from "bun:test";
import { SecurityError } from "../../../src/errors/types.ts";
import { sqlIdentifier, sqlRaw } from "../../../src/sql/helpers.ts";

describe("sql/helpers — sqlRaw() additional injection patterns", () => {
  it("throws on WAITFOR DELAY (time-based)", () => {
    expect(() => sqlRaw("WAITFOR DELAY '00:00:05'")).toThrow(SecurityError);
  });

  it("throws on LOAD_FILE (MySQL dangerous)", () => {
    expect(() => sqlRaw("LOAD_FILE('/etc/passwd')")).toThrow(SecurityError);
  });

  it("throws on pg_read_file (PG dangerous)", () => {
    expect(() => sqlRaw("pg_read_file('/etc/passwd')")).toThrow(SecurityError);
  });

  it("throws on tautology OR '1'='1'", () => {
    expect(() => sqlRaw("OR '1'='1'")).toThrow(SecurityError);
  });
});

describe("sql/helpers — sqlIdentifier() edge cases", () => {
  it("accepts 128-character identifier", () => {
    const name = "a".repeat(128);
    const f = sqlIdentifier(name);
    expect(f.text).toBe(`"${name}"`);
  });

  it("reports exact invalid characters in the error", () => {
    try {
      sqlIdentifier("table name!");
      expect.unreachable("should throw");
    } catch (e) {
      expect((e as SecurityError).message).toContain(" ");
      expect((e as SecurityError).message).toContain("!");
    }
  });
});
