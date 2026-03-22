import { describe, expect, it } from "bun:test";
import type { TypeHandler } from "../../../src/core/type-handler.ts";
import { TypeHandlerRegistry } from "../../../src/core/type-handler.ts";

describe("core/type-handler — TypeHandlerRegistry", () => {
  describe("registry lookup", () => {
    it("returns a handler for every built-in type", () => {
      const registry = new TypeHandlerRegistry();
      const types = [
        "int",
        "bigint",
        "smallint",
        "float",
        "decimal",
        "boolean",
        "text",
        "nvarchar",
        "varchar",
        "char",
        "datetime",
        "date",
        "time",
        "uuid",
        "blob",
        "json",
        "array",
      ];
      for (const t of types) {
        expect(registry.get(t)).toBeDefined();
      }
    });

    it("returns an identity handler for unknown types", () => {
      const registry = new TypeHandlerRegistry();
      const handler = registry.get("unknown_type");
      expect(handler.fromDb("hello")).toBe("hello");
      expect(handler.toDb(42)).toBe(42);
    });

    it("allows registering a custom handler that overrides built-in", () => {
      const registry = new TypeHandlerRegistry();
      const custom: TypeHandler<string> = {
        fromDb: (raw) => `custom:${raw}`,
        toDb: (value) => value.replace("custom:", ""),
      };
      registry.register("int", custom);
      expect(registry.get("int").fromDb(42)).toBe("custom:42");
    });
  });

  describe("built-in string handler", () => {
    it("converts a number to string via fromDb", () => {
      const registry = new TypeHandlerRegistry();
      expect(registry.fromDb("text", 123)).toBe("123");
    });

    it("passes a string through toDb unchanged", () => {
      const registry = new TypeHandlerRegistry();
      expect(registry.toDb("text", "hello")).toBe("hello");
    });
  });

  describe("built-in number handler", () => {
    it("converts a string to number via fromDb", () => {
      const registry = new TypeHandlerRegistry();
      expect(registry.fromDb("int", "42")).toBe(42);
    });

    it("passes a number through toDb unchanged", () => {
      const registry = new TypeHandlerRegistry();
      expect(registry.toDb("int", 99)).toBe(99);
    });
  });

  describe("built-in boolean handler", () => {
    it("converts 0 to false via fromDb", () => {
      const registry = new TypeHandlerRegistry();
      expect(registry.fromDb("boolean", 0)).toBe(false);
    });

    it("converts 1 to true via fromDb", () => {
      const registry = new TypeHandlerRegistry();
      expect(registry.fromDb("boolean", 1)).toBe(true);
    });

    it("converts string 'true' to true via fromDb", () => {
      const registry = new TypeHandlerRegistry();
      expect(registry.fromDb("boolean", "true")).toBe(true);
    });
  });

  describe("built-in date handler", () => {
    it("passes a Date instance through fromDb unchanged", () => {
      const registry = new TypeHandlerRegistry();
      const d = new Date("2025-01-01");
      expect(registry.fromDb("datetime", d)).toBe(d);
    });

    it("parses an ISO string to Date via fromDb", () => {
      const registry = new TypeHandlerRegistry();
      const result = registry.fromDb("datetime", "2025-06-15T12:00:00Z");
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe("built-in json handler", () => {
    it("parses a JSON string via fromDb", () => {
      const registry = new TypeHandlerRegistry();
      expect(registry.fromDb("json", '{"a":1}')).toEqual({ a: 1 });
    });

    it("serializes an object to JSON string via toDb", () => {
      const registry = new TypeHandlerRegistry();
      expect(registry.toDb("json", { a: 1 })).toBe('{"a":1}');
    });

    it("passes a string value through toDb unchanged", () => {
      const registry = new TypeHandlerRegistry();
      expect(registry.toDb("json", '{"a":1}')).toBe('{"a":1}');
    });
  });

  describe("null handling", () => {
    it("fromDb returns null when raw is null regardless of type", () => {
      const registry = new TypeHandlerRegistry();
      expect(registry.fromDb("int", null)).toBeNull();
      expect(registry.fromDb("text", null)).toBeNull();
      expect(registry.fromDb("datetime", null)).toBeNull();
    });

    it("toDb returns null when value is null regardless of type", () => {
      const registry = new TypeHandlerRegistry();
      expect(registry.toDb("int", null)).toBeNull();
    });

    it("fromDb returns null when raw is undefined", () => {
      const registry = new TypeHandlerRegistry();
      expect(registry.fromDb("int", undefined)).toBeNull();
    });
  });
});
