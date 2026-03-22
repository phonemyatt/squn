import { describe, it, expect } from "bun:test";
import { col } from "../../../src/types/col.ts";
import { defineTable } from "../../../src/types/table.ts";

describe("types/table — defineTable()", () => {
  const Users = defineTable("users", {
    id:        col.int().primaryKey(),
    name:      col.nvarchar(100).notNull(),
    email:     col.nvarchar(255).notNull().unique(),
    age:       col.int().nullable(),
    createdAt: col.datetime().notNull().readonly(),
  });

  it("carries the table name", () => {
    expect(Users.tableName).toBe("users");
  });

  it("has the __brand set to 'TableDefinition'", () => {
    expect(Users.__brand).toBe("TableDefinition");
  });

  it("contains all declared columns in the columns map", () => {
    expect(Object.keys(Users.columns)).toEqual(["id", "name", "email", "age", "createdAt"]);
  });

  it("columnNames contains every column key as a string array", () => {
    expect([...Users.columnNames].sort()).toEqual(["age", "createdAt", "email", "id", "name"]);
  });

  it("each column retains its metadata", () => {
    expect(Users.columns.id.isPrimaryKey).toBe(true);
    expect(Users.columns.id.isReadonly).toBe(true);

    expect(Users.columns.name.isNullable).toBe(false);
    expect(Users.columns.name.dbType).toBe("nvarchar");
    expect(Users.columns.name.dbMaxLength).toBe(100);

    expect(Users.columns.email.isUnique).toBe(true);

    expect(Users.columns.age.isNullable).toBe(true);

    expect(Users.columns.createdAt.isReadonly).toBe(true);
    expect(Users.columns.createdAt.isNullable).toBe(false);
  });

  it("defining a second table does not affect the first", () => {
    const Orders = defineTable("orders", {
      id:     col.int().primaryKey(),
      total:  col.decimal().notNull(),
    });

    expect(Orders.tableName).toBe("orders");
    expect(Users.tableName).toBe("users");
    expect(Object.keys(Orders.columns)).toEqual(["id", "total"]);
  });
});
