import { describe, it, expect } from "bun:test";
import { col } from "../../../src/types/col.ts";
import { defineTable } from "../../../src/types/table.ts";
import type { InferModel, InferInsert, InferUpdate, InferReadonlyModel } from "../../../src/types/infer.ts";

const Users = defineTable("users", {
  id:        col.int().primaryKey(),
  name:      col.nvarchar(100).notNull(),
  email:     col.nvarchar(255).notNull().unique(),
  age:       col.int().nullable(),
  createdAt: col.datetime().notNull().readonly(),
  fullName:  col.nvarchar(201).computed("firstName + ' ' + lastName"),
});

describe("types/infer — InferModel", () => {
  it("includes every column from the table definition", () => {
    // Runtime check: we verify the columns exist by accessing them on the table
    const columnKeys = Object.keys(Users.columns);
    expect(columnKeys).toContain("id");
    expect(columnKeys).toContain("name");
    expect(columnKeys).toContain("email");
    expect(columnKeys).toContain("age");
    expect(columnKeys).toContain("createdAt");
    expect(columnKeys).toContain("fullName");

    // Type-level check: this assignment must compile
    const _model: InferModel<typeof Users> = {
      id: 1,
      name: "Alice",
      email: "alice@example.com",
      age: null,
      createdAt: new Date(),
      fullName: "Alice Smith",
    };
    expect(_model.id).toBe(1);
  });
});

describe("types/infer — InferInsert", () => {
  it("excludes primaryKey and readonly columns", () => {
    // id is primaryKey (readonly), createdAt is readonly, fullName is computed (readonly)
    // InferInsert should only have: name, email, age
    const _insert: InferInsert<typeof Users> = {
      name: "Bob",
      email: "bob@example.com",
      age: 30,
    };
    expect(_insert.name).toBe("Bob");

    // Verify at runtime that readonly columns are excluded from the mutable set
    expect(Users.columns.id.isReadonly).toBe(true);
    expect(Users.columns.createdAt.isReadonly).toBe(true);
    expect(Users.columns.fullName.isReadonly).toBe(true);
    expect(Users.columns.name.isReadonly).toBe(false);
    expect(Users.columns.email.isReadonly).toBe(false);
    expect(Users.columns.age.isReadonly).toBe(false);
  });
});

describe("types/infer — InferUpdate", () => {
  it("excludes readonly columns and makes remaining fields optional", () => {
    // InferUpdate should only have: name?, email?, age? (all optional)
    const _updatePartial: InferUpdate<typeof Users> = { name: "Charlie" };
    const _updateEmpty: InferUpdate<typeof Users> = {};
    expect(_updatePartial.name).toBe("Charlie");
    expect(Object.keys(_updateEmpty)).toHaveLength(0);
  });
});

describe("types/infer — InferReadonlyModel", () => {
  it("includes only readonly columns", () => {
    // id, createdAt, fullName are readonly
    const _ro: InferReadonlyModel<typeof Users> = {
      id: 1,
      createdAt: new Date(),
      fullName: "Alice Smith",
    };
    expect(_ro.id).toBe(1);

    expect(Users.columns.id.isReadonly).toBe(true);
    expect(Users.columns.createdAt.isReadonly).toBe(true);
    expect(Users.columns.fullName.isReadonly).toBe(true);
  });
});
