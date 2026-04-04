import { describe, expect, it } from "bun:test";
import { ErrorCode } from "../../../src/errors/codes.ts";
import { ReadonlyViolationError } from "../../../src/errors/types.ts";
import type { ReadonlyConnection } from "../../../src/readonly/guard.ts";
import { assertWritable } from "../../../src/readonly/guard.ts";

const strictReadonly: ReadonlyConnection = {
  readonly: true,
  readonlyStrategy: "strict",
};
const warnReadonly: ReadonlyConnection = {
  readonly: true,
  readonlyStrategy: "warn",
};
const writable: ReadonlyConnection = {
  readonly: false,
  readonlyStrategy: "strict",
};

describe("readonly/guard — assertWritable()", () => {
  describe("writable connection", () => {
    it("returns true for any operation on a writable connection", () => {
      expect(assertWritable(writable, "execute")).toBe(true);
      expect(assertWritable(writable, "query")).toBe(true);
    });

    it("returns true even for write operations on a writable connection", () => {
      expect(
        assertWritable(writable, "execute", "INSERT INTO users VALUES (1)"),
      ).toBe(true);
    });
  });

  describe("strict readonly connection", () => {
    it("throws READONLY_WRITE_BLOCKED for execute operation", () => {
      try {
        assertWritable(strictReadonly, "execute");
        expect.unreachable("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(ReadonlyViolationError);
        expect((e as ReadonlyViolationError).code).toBe(
          ErrorCode.READONLY_WRITE_BLOCKED,
        );
        expect((e as ReadonlyViolationError).message).toContain("execute");
      }
    });

    it("throws READONLY_WRITE_BLOCKED for INSERT SQL", () => {
      expect(() =>
        assertWritable(strictReadonly, "query", "INSERT INTO users VALUES (1)"),
      ).toThrow(ReadonlyViolationError);
    });

    it("throws READONLY_WRITE_BLOCKED for UPDATE SQL", () => {
      expect(() =>
        assertWritable(strictReadonly, "query", "UPDATE users SET name = 'x'"),
      ).toThrow(ReadonlyViolationError);
    });

    it("throws READONLY_WRITE_BLOCKED for DELETE SQL", () => {
      expect(() =>
        assertWritable(
          strictReadonly,
          "query",
          "DELETE FROM users WHERE id = 1",
        ),
      ).toThrow(ReadonlyViolationError);
    });

    it("throws READONLY_WRITE_BLOCKED for DROP SQL", () => {
      expect(() =>
        assertWritable(strictReadonly, "query", "DROP TABLE users"),
      ).toThrow(ReadonlyViolationError);
    });

    it("does not throw for SELECT on strict readonly", () => {
      expect(
        assertWritable(strictReadonly, "query", "SELECT * FROM users"),
      ).toBe(true);
    });

    it("does not throw for read operations without SQL", () => {
      expect(assertWritable(strictReadonly, "query")).toBe(true);
    });

    it("the error context includes the operation and sql", () => {
      try {
        assertWritable(strictReadonly, "execute", "DELETE FROM users");
        expect.unreachable("should throw");
      } catch (e) {
        expect((e as ReadonlyViolationError).context.operation).toBe("execute");
        expect((e as ReadonlyViolationError).context.sql).toBe(
          "DELETE FROM users",
        );
      }
    });
  });

  describe("warn readonly connection", () => {
    it("returns false for write operations (signal to log warning)", () => {
      expect(assertWritable(warnReadonly, "execute")).toBe(false);
    });

    it("does not throw for write operations in warn mode", () => {
      expect(() => assertWritable(warnReadonly, "execute")).not.toThrow();
    });

    it("returns false for INSERT SQL in warn mode", () => {
      expect(
        assertWritable(warnReadonly, "query", "INSERT INTO users VALUES (1)"),
      ).toBe(false);
    });

    it("returns true for SELECT on warn readonly", () => {
      expect(assertWritable(warnReadonly, "query", "SELECT * FROM users")).toBe(
        true,
      );
    });
  });
});
