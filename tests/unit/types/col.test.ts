import { describe, it, expect } from "bun:test";
import { col } from "../../../src/types/col.ts";

describe("types/col — col builder", () => {
  describe("basic column creation", () => {
    it("col.int() creates a column with dbType 'int'", () => {
      const c = col.int();
      expect(c.dbType).toBe("int");
      expect(c.isNullable).toBe(false);
      expect(c.isReadonly).toBe(false);
      expect(c.isPrimaryKey).toBe(false);
      expect(c.isComputed).toBe(false);
      expect(c.isUnique).toBe(false);
    });

    it("col.nvarchar(100) captures the max length", () => {
      const c = col.nvarchar(100);
      expect(c.dbType).toBe("nvarchar");
      expect(c.dbMaxLength).toBe(100);
    });

    it("col.nvarchar('MAX') captures MAX as a string", () => {
      const c = col.nvarchar("MAX");
      expect(c.dbMaxLength).toBe("MAX");
    });

    it("col.datetime() has dbType 'datetime'", () => {
      const c = col.datetime();
      expect(c.dbType).toBe("datetime");
    });

    it("col.boolean() has dbType 'boolean'", () => {
      const c = col.boolean();
      expect(c.dbType).toBe("boolean");
    });

    it("col.text() has null maxLength", () => {
      const c = col.text();
      expect(c.dbType).toBe("text");
      expect(c.dbMaxLength).toBeNull();
    });
  });

  describe("nullable() modifier", () => {
    it("sets isNullable to true", () => {
      const c = col.int().nullable();
      expect(c.isNullable).toBe(true);
    });

    it("does not affect other flags", () => {
      const c = col.int().nullable();
      expect(c.isReadonly).toBe(false);
      expect(c.isPrimaryKey).toBe(false);
    });
  });

  describe("notNull() modifier", () => {
    it("sets isNullable to false", () => {
      const c = col.int().notNull();
      expect(c.isNullable).toBe(false);
    });

    it("overrides a previous nullable()", () => {
      const c = col.int().nullable().notNull();
      expect(c.isNullable).toBe(false);
    });
  });

  describe("readonly() modifier", () => {
    it("sets isReadonly to true", () => {
      const c = col.int().readonly();
      expect(c.isReadonly).toBe(true);
    });
  });

  describe("primaryKey() modifier", () => {
    it("sets isPrimaryKey to true", () => {
      const c = col.int().primaryKey();
      expect(c.isPrimaryKey).toBe(true);
    });

    it("implies readonly — isReadonly is true", () => {
      const c = col.int().primaryKey();
      expect(c.isReadonly).toBe(true);
    });
  });

  describe("computed() modifier", () => {
    it("sets isComputed to true and stores the expression", () => {
      const c = col.nvarchar(201).computed("firstName + ' ' + lastName");
      expect(c.isComputed).toBe(true);
      expect(c.computedExpr).toBe("firstName + ' ' + lastName");
    });

    it("implies readonly — isReadonly is true", () => {
      const c = col.nvarchar(201).computed("expr");
      expect(c.isReadonly).toBe(true);
    });
  });

  describe("unique() modifier", () => {
    it("sets isUnique to true", () => {
      const c = col.nvarchar(255).unique();
      expect(c.isUnique).toBe(true);
    });

    it("does not affect nullability or readonly", () => {
      const c = col.nvarchar(255).unique();
      expect(c.isNullable).toBe(false);
      expect(c.isReadonly).toBe(false);
    });
  });

  describe("chaining multiple modifiers", () => {
    it("primaryKey().readonly() both set isReadonly to true", () => {
      const c = col.int().primaryKey().readonly();
      expect(c.isPrimaryKey).toBe(true);
      expect(c.isReadonly).toBe(true);
    });

    it("notNull().unique() sets both flags independently", () => {
      const c = col.nvarchar(255).notNull().unique();
      expect(c.isNullable).toBe(false);
      expect(c.isUnique).toBe(true);
    });

    it("nullable().readonly() sets both flags", () => {
      const c = col.datetime().nullable().readonly();
      expect(c.isNullable).toBe(true);
      expect(c.isReadonly).toBe(true);
    });

    it("each modifier returns a new object — does not mutate the original", () => {
      const base = col.int();
      const nullable = base.nullable();
      expect(base.isNullable).toBe(false);
      expect(nullable.isNullable).toBe(true);
    });
  });
});
