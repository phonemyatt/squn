import { describe, expect, it } from "bun:test";
import { buildParams } from "../../../src/core/param-builder.ts";
import { ErrorCode } from "../../../src/errors/codes.ts";
import { ValidationError } from "../../../src/errors/types.ts";

describe("core/param-builder — buildParams()", () => {
  describe("named parameter translation for SQLite and MySQL (? style)", () => {
    it("replaces @name with ? and extracts the value in order", () => {
      const result = buildParams("SELECT * FROM users WHERE id = @id", { id: 42 }, "sqlite");
      expect(result.text).toBe("SELECT * FROM users WHERE id = ?");
      expect(result.params).toEqual([42]);
    });

    it("handles multiple different named params in a single query", () => {
      const result = buildParams(
        "SELECT * FROM users WHERE name = @name AND age > @age",
        { name: "Alice", age: 18 },
        "mysql",
      );
      expect(result.text).toBe("SELECT * FROM users WHERE name = ? AND age > ?");
      expect(result.params).toEqual(["Alice", 18]);
    });

    it("handles the same param name appearing twice — uses the value once per occurrence", () => {
      const result = buildParams(
        "SELECT * FROM users WHERE name = @name OR alias = @name",
        { name: "Bob" },
        "sqlite",
      );
      expect(result.text).toBe("SELECT * FROM users WHERE name = ? OR alias = ?");
      expect(result.params).toEqual(["Bob", "Bob"]);
    });

    it("throws ValidationError when a param in the SQL has no matching key in the object", () => {
      try {
        buildParams("SELECT * FROM users WHERE id = @id", {}, "sqlite");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).code).toBe(ErrorCode.PARAM_MISSING);
        expect((e as ValidationError).message).toContain("@id");
      }
    });

    it("throws ValidationError when extra keys are in the object but not in the SQL", () => {
      try {
        buildParams("SELECT * FROM users WHERE id = @id", { id: 1, unused: "value" }, "sqlite");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).code).toBe(ErrorCode.PARAM_EXTRA);
        expect((e as ValidationError).message).toContain("unused");
      }
    });
  });

  describe("named parameter translation for PostgreSQL ($1 style)", () => {
    it("replaces @name with $1, $2… in order of appearance", () => {
      const result = buildParams(
        "SELECT * FROM users WHERE name = @name AND age > @age",
        { name: "Alice", age: 25 },
        "postgres",
      );
      expect(result.text).toBe("SELECT * FROM users WHERE name = $1 AND age > $2");
      expect(result.params).toEqual(["Alice", 25]);
    });

    it("the same @name appearing twice produces the same $N index both times", () => {
      const result = buildParams(
        "SELECT * FROM users WHERE name = @name OR alias = @name",
        { name: "Bob" },
        "postgres",
      );
      expect(result.text).toBe("SELECT * FROM users WHERE name = $1 OR alias = $1");
      expect(result.params).toEqual(["Bob"]);
    });
  });

  describe("IN clause expansion", () => {
    it("expands an array value to (?, ?, ?) with one placeholder per element", () => {
      const result = buildParams(
        "SELECT * FROM users WHERE id IN @ids",
        { ids: [1, 2, 3] },
        "sqlite",
      );
      expect(result.text).toBe("SELECT * FROM users WHERE id IN (?, ?, ?)");
      expect(result.params).toEqual([1, 2, 3]);
    });

    it("expands an empty array to (NULL) to avoid invalid SQL", () => {
      const result = buildParams("SELECT * FROM users WHERE id IN @ids", { ids: [] }, "sqlite");
      expect(result.text).toBe("SELECT * FROM users WHERE id IN (NULL)");
      expect(result.params).toEqual([]);
    });

    it("expands correctly when mixed with non-array params", () => {
      const result = buildParams(
        "SELECT * FROM users WHERE active = @active AND id IN @ids",
        { active: true, ids: [10, 20] },
        "sqlite",
      );
      expect(result.text).toBe("SELECT * FROM users WHERE active = ? AND id IN (?, ?)");
      expect(result.params).toEqual([true, 10, 20]);
    });

    it("expands array values to ($N, $N+1, …) for PostgreSQL", () => {
      const result = buildParams(
        "SELECT * FROM users WHERE id IN @ids",
        { ids: [1, 2, 3] },
        "postgres",
      );
      expect(result.text).toBe("SELECT * FROM users WHERE id IN ($1, $2, $3)");
      expect(result.params).toEqual([1, 2, 3]);
    });
  });

  describe("edge cases", () => {
    it("handles a query with no parameters", () => {
      const result = buildParams("SELECT 1", {}, "sqlite");
      expect(result.text).toBe("SELECT 1");
      expect(result.params).toEqual([]);
    });

    it("handles null parameter values", () => {
      const result = buildParams(
        "UPDATE users SET deleted_at = @deletedAt WHERE id = @id",
        { deletedAt: null, id: 5 },
        "sqlite",
      );
      expect(result.text).toBe("UPDATE users SET deleted_at = ? WHERE id = ?");
      expect(result.params).toEqual([null, 5]);
    });
  });
});
