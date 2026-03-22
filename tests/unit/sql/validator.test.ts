import { describe, it, expect } from "bun:test";
import { validateSql } from "../../../src/sql/validator.ts";
import { createFragment } from "../../../src/sql/fragment.ts";
import { SecurityError } from "../../../src/errors/types.ts";
import { ErrorCode } from "../../../src/errors/codes.ts";

describe("sql/validator — validateSql()", () => {
  it("does not throw for a valid fragment", () => {
    const f = createFragment("SELECT * FROM users WHERE id = $1", [42]);
    expect(() => validateSql(f)).not.toThrow();
  });

  describe("placeholder/param count", () => {
    it("throws PLACEHOLDER_MISMATCH when placeholders exceed params", () => {
      const f = createFragment("SELECT * FROM users WHERE id = $1 AND name = $2", [42]);
      try {
        validateSql(f);
        expect.unreachable("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(SecurityError);
        expect((e as SecurityError).code).toBe(ErrorCode.PLACEHOLDER_MISMATCH);
      }
    });

    it("throws PLACEHOLDER_MISMATCH when params exceed placeholders", () => {
      const f = createFragment("SELECT * FROM users WHERE id = $1", [42, "extra"]);
      expect(() => validateSql(f)).toThrow(SecurityError);
    });

    it("passes when placeholder count matches param count exactly", () => {
      const f = createFragment("SELECT * FROM users WHERE id = $1 AND name = $2", [1, "a"]);
      expect(() => validateSql(f)).not.toThrow();
    });
  });

  describe("unbalanced parentheses", () => {
    it("throws SQL_VALIDATION_FAILED for unclosed opening paren", () => {
      const f = createFragment("SELECT * FROM users WHERE (id = $1", [1]);
      expect(() => validateSql(f)).toThrow(SecurityError);
    });

    it("throws SQL_VALIDATION_FAILED for extra closing paren", () => {
      const f = createFragment("SELECT * FROM users WHERE id = $1)", [1]);
      expect(() => validateSql(f)).toThrow(SecurityError);
    });

    it("passes for balanced parentheses", () => {
      const f = createFragment("SELECT * FROM users WHERE (id = $1 AND (name = $2))", [1, "a"]);
      expect(() => validateSql(f)).not.toThrow();
    });
  });

  describe("unresolved TVP sentinels", () => {
    it("throws UNRESOLVED_TVP_SENTINEL when __TVP_0__ is in text with no tvpValues", () => {
      const f = createFragment("SELECT * FROM __TVP_0__", []);
      try {
        validateSql(f);
        expect.unreachable("should throw");
      } catch (e) {
        expect((e as SecurityError).code).toBe(ErrorCode.UNRESOLVED_TVP_SENTINEL);
      }
    });

    it("does not throw when tvpValues are present (pre-materialisation)", () => {
      const f = { text: "SELECT * FROM __TVP_0__", params: [], tvpValues: [{ __isTvp: true as const, tableType: {}, rows: [] }], __isSql: true as const };
      expect(() => validateSql(f)).not.toThrow();
    });
  });

  describe("multiple statements", () => {
    it("throws MULTI_STATEMENT_BLOCKED by default", () => {
      const f = createFragment("SELECT 1; SELECT 2", []);
      try {
        validateSql(f);
        expect.unreachable("should throw");
      } catch (e) {
        expect((e as SecurityError).code).toBe(ErrorCode.MULTI_STATEMENT_BLOCKED);
      }
    });

    it("passes when multiStatement: true", () => {
      const f = createFragment("SELECT 1; SELECT 2", []);
      expect(() => validateSql(f, { multiStatement: true })).not.toThrow();
    });
  });

  describe("readonly connection", () => {
    it("throws for write statements on readonly", () => {
      const f = createFragment("INSERT INTO users VALUES ($1)", [1]);
      expect(() => validateSql(f, { readonly: true })).toThrow(SecurityError);
    });

    it("passes for SELECT on readonly", () => {
      const f = createFragment("SELECT * FROM users WHERE id = $1", [1]);
      expect(() => validateSql(f, { readonly: true })).not.toThrow();
    });
  });
});
