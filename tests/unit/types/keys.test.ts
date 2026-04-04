import { describe, expect, it } from "bun:test";
import { col } from "../../../src/types/col.ts";
import type {
  IsNullable,
  MutableKeys,
  NotNullKeys,
  NullableKeys,
  ReadonlyKeys,
} from "../../../src/types/infer.ts";
import { defineTable } from "../../../src/types/table.ts";

const Users = defineTable("users", {
  id: col.int().primaryKey(),
  name: col.nvarchar(100).notNull(),
  email: col.nvarchar(255).notNull().unique(),
  age: col.int().nullable(),
  bio: col.nvarchar("MAX").nullable(),
  createdAt: col.datetime().notNull().readonly(),
  fullName: col.nvarchar(201).computed("expr"),
});

// Compile-time type assertions — these assignments must compile.
// If the type utilities produce the wrong union, tsc will error here.

type _NullableCheck = NullableKeys<typeof Users>;
const _n1: _NullableCheck = "age";
const _n2: _NullableCheck = "bio";

type _NotNullCheck = NotNullKeys<typeof Users>;
const _nn1: _NotNullCheck = "id";
const _nn2: _NotNullCheck = "name";
const _nn3: _NotNullCheck = "email";
const _nn4: _NotNullCheck = "createdAt";
const _nn5: _NotNullCheck = "fullName";

type _ReadonlyCheck = ReadonlyKeys<typeof Users>;
const _r1: _ReadonlyCheck = "id";
const _r2: _ReadonlyCheck = "createdAt";
const _r3: _ReadonlyCheck = "fullName";

type _MutableCheck = MutableKeys<typeof Users>;
const _m1: _MutableCheck = "name";
const _m2: _MutableCheck = "email";
const _m3: _MutableCheck = "age";
const _m4: _MutableCheck = "bio";

type _IsNullableAge = IsNullable<typeof Users, "age">;
const _inAge: _IsNullableAge = true;

type _IsNullableName = IsNullable<typeof Users, "name">;
const _inName: _IsNullableName = false;

// Suppress unused variable warnings — these are compile-time checks only
void _n1;
void _n2;
void _nn1;
void _nn2;
void _nn3;
void _nn4;
void _nn5;
void _r1;
void _r2;
void _r3;
void _m1;
void _m2;
void _m3;
void _m4;
void _inAge;
void _inName;

describe("types/keys — key utility types", () => {
  describe("NullableKeys", () => {
    it("identifies nullable columns at runtime by checking isNullable", () => {
      const nullableKeys = Object.entries(Users.columns)
        .filter(([_, c]) => c.isNullable)
        .map(([k]) => k)
        .sort();
      expect(nullableKeys).toEqual(["age", "bio"]);
    });
  });

  describe("NotNullKeys", () => {
    it("identifies non-null columns at runtime by checking isNullable === false", () => {
      const notNullKeys = Object.entries(Users.columns)
        .filter(([_, c]) => !c.isNullable)
        .map(([k]) => k)
        .sort();
      expect(notNullKeys).toEqual([
        "createdAt",
        "email",
        "fullName",
        "id",
        "name",
      ]);
    });
  });

  describe("ReadonlyKeys", () => {
    it("identifies readonly columns at runtime by checking isReadonly", () => {
      const readonlyKeys = Object.entries(Users.columns)
        .filter(([_, c]) => c.isReadonly)
        .map(([k]) => k)
        .sort();
      expect(readonlyKeys).toEqual(["createdAt", "fullName", "id"]);
    });
  });

  describe("MutableKeys", () => {
    it("identifies writable columns at runtime by checking isReadonly === false", () => {
      const mutableKeys = Object.entries(Users.columns)
        .filter(([_, c]) => !c.isReadonly)
        .map(([k]) => k)
        .sort();
      expect(mutableKeys).toEqual(["age", "bio", "email", "name"]);
    });
  });

  describe("IsNullable", () => {
    it("age is nullable", () => {
      expect(Users.columns.age.isNullable).toBe(true);
    });

    it("name is not nullable", () => {
      expect(Users.columns.name.isNullable).toBe(false);
    });

    it("id is not nullable", () => {
      expect(Users.columns.id.isNullable).toBe(false);
    });
  });
});
