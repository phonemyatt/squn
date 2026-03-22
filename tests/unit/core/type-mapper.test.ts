import { describe, it, expect } from "bun:test";
import { col } from "../../../src/types/col.ts";
import { defineTable } from "../../../src/types/table.ts";
import { compileMapper } from "../../../src/core/type-mapper.ts";
import { TypeHandlerRegistry } from "../../../src/core/type-handler.ts";
import { MappingError } from "../../../src/errors/types.ts";
import { ErrorCode } from "../../../src/errors/codes.ts";

const Users = defineTable("users", {
  id:    col.int().primaryKey(),
  name:  col.nvarchar(100).notNull(),
  email: col.nvarchar(255).notNull(),
  age:   col.int().nullable(),
  bio:   col.text().nullable(),
  active: col.boolean().notNull(),
  createdAt: col.datetime().notNull(),
});

const registry = new TypeHandlerRegistry();

describe("core/type-mapper — compileMapper()", () => {
  describe("basic column type mapping", () => {
    it("maps an int column from raw to number", () => {
      const mapper = compileMapper(Users, registry);
      const row = { id: 1, name: "Alice", email: "a@b.com", age: 30, bio: null, active: 1, createdAt: new Date() };
      const result = mapper(row) as Record<string, unknown>;
      expect(result.id).toBe(1);
    });

    it("maps a string column from raw to string", () => {
      const mapper = compileMapper(Users, registry);
      const row = { id: 1, name: "Alice", email: "a@b.com", age: null, bio: null, active: true, createdAt: new Date() };
      const result = mapper(row) as Record<string, unknown>;
      expect(result.name).toBe("Alice");
    });

    it("maps a boolean column — converts 1 to true", () => {
      const mapper = compileMapper(Users, registry);
      const row = { id: 1, name: "A", email: "a@b.com", age: null, bio: null, active: 1, createdAt: new Date() };
      const result = mapper(row) as Record<string, unknown>;
      expect(result.active).toBe(true);
    });

    it("maps a boolean column — converts 0 to false", () => {
      const mapper = compileMapper(Users, registry);
      const row = { id: 1, name: "A", email: "a@b.com", age: null, bio: null, active: 0, createdAt: new Date() };
      const result = mapper(row) as Record<string, unknown>;
      expect(result.active).toBe(false);
    });

    it("maps a datetime column — passes Date through", () => {
      const d = new Date("2025-01-01");
      const mapper = compileMapper(Users, registry);
      const row = { id: 1, name: "A", email: "a@b.com", age: null, bio: null, active: true, createdAt: d };
      const result = mapper(row) as Record<string, unknown>;
      expect(result.createdAt).toBe(d);
    });

    it("maps a datetime column — parses ISO string to Date", () => {
      const mapper = compileMapper(Users, registry);
      const row = { id: 1, name: "A", email: "a@b.com", age: null, bio: null, active: true, createdAt: "2025-01-01T00:00:00Z" };
      const result = mapper(row) as Record<string, unknown>;
      expect(result.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("null handling", () => {
    it("maps null on a nullable column to null", () => {
      const mapper = compileMapper(Users, registry);
      const row = { id: 1, name: "A", email: "a@b.com", age: null, bio: null, active: true, createdAt: new Date() };
      const result = mapper(row) as Record<string, unknown>;
      expect(result.age).toBeNull();
      expect(result.bio).toBeNull();
    });

    it("throws NULL_VIOLATION in strict mode when a notNull column receives null", () => {
      const mapper = compileMapper(Users, registry, true);
      const row = { id: 1, name: null, email: "a@b.com", age: null, bio: null, active: true, createdAt: new Date() };
      try {
        mapper(row);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(MappingError);
        expect((e as MappingError).code).toBe(ErrorCode.NULL_VIOLATION);
        expect((e as MappingError).context.column).toBe("name");
        expect((e as MappingError).context.table).toBe("users");
      }
    });

    it("returns null without throwing in lenient mode when a notNull column receives null", () => {
      const mapper = compileMapper(Users, registry, false);
      const row = { id: 1, name: null, email: "a@b.com", age: null, bio: null, active: true, createdAt: new Date() };
      const result = mapper(row) as Record<string, unknown>;
      expect(result.name).toBeNull();
    });
  });

  describe("unknown column in result", () => {
    it("throws UNKNOWN_COLUMN in strict mode for a column not in the schema", () => {
      const mapper = compileMapper(Users, registry, true);
      const row = { id: 1, name: "A", email: "a@b.com", age: null, bio: null, active: true, createdAt: new Date(), extra: "oops" };
      try {
        mapper(row);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(MappingError);
        expect((e as MappingError).code).toBe(ErrorCode.UNKNOWN_COLUMN);
        expect((e as MappingError).context.column).toBe("extra");
      }
    });

    it("ignores unknown columns in lenient mode", () => {
      const mapper = compileMapper(Users, registry, false);
      const row = { id: 1, name: "A", email: "a@b.com", age: null, bio: null, active: true, createdAt: new Date(), extra: "ok" };
      const result = mapper(row) as Record<string, unknown>;
      expect(result.extra).toBeUndefined();
      expect(result.id).toBe(1);
    });
  });

  describe("compiled mapper reuse", () => {
    it("the same mapper instance can map multiple rows correctly", () => {
      const mapper = compileMapper(Users, registry);
      const row1 = { id: 1, name: "Alice", email: "a@b.com", age: 30, bio: null, active: true, createdAt: new Date() };
      const row2 = { id: 2, name: "Bob", email: "b@c.com", age: null, bio: "Hi", active: false, createdAt: new Date() };
      const r1 = mapper(row1) as Record<string, unknown>;
      const r2 = mapper(row2) as Record<string, unknown>;
      expect(r1.name).toBe("Alice");
      expect(r2.name).toBe("Bob");
      expect(r2.age).toBeNull();
      expect(r2.bio).toBe("Hi");
    });
  });
});
