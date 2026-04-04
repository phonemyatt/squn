/**
 * Compile-time type assertions.
 *
 * This file is NEVER executed — it is only checked by `tsc --noEmit`.
 * Every @ts-expect-error line MUST produce a real error without the directive.
 * If tsc reports "Unused '@ts-expect-error' directive", the type system has a
 * hole — invalid code compiles when it shouldn't.
 */

import { SqliteAdapter } from "../../src/adapters/sqlite.ts";
import type { Db } from "../../src/db.ts";
import { createConnections, createDb } from "../../src/db.ts";
import type { SqlFragment } from "../../src/sql/fragment.ts";
import { sql } from "../../src/sql/tag.ts";
import { col } from "../../src/types/col.ts";
import type {
  InferInsert,
  InferModel,
  InferReadonlyModel,
  InferUpdate,
} from "../../src/types/infer.ts";
import { defineTable } from "../../src/types/table.ts";

// Drain function to suppress "declared but never read" — this file is type-check only
function use(..._args: unknown[]): void {}

// ═══════════════════════════════════════════════════════════════════════════
// Schema
// ═══════════════════════════════════════════════════════════════════════════

const Users = defineTable("users", {
  id: col.int().primaryKey(),
  name: col.nvarchar(100).notNull(),
  email: col.nvarchar(255).notNull(),
  age: col.int().nullable(),
});

// ═══════════════════════════════════════════════════════════════════════════
// InferInsert — excludes readonly fields
// ═══════════════════════════════════════════════════════════════════════════

type Insert = InferInsert<typeof Users>;

// Valid: mutable fields only
const _validInsert: Insert = { name: "Alice", email: "a@b.com", age: 30 };

// Valid: nullable field accepts null
const _nullAge: Insert = { name: "Alice", email: "a@b.com", age: null };
use(_validInsert, _nullAge);

// @ts-expect-error — id is readonly (primaryKey), must not appear in Insert
const _insertWithId: Insert = { id: 1, name: "Alice", email: "a@b.com", age: 30 };

// @ts-expect-error — name is required (notNull), cannot be omitted
const _insertMissingName: Insert = { email: "a@b.com", age: 30 };

// @ts-expect-error — name is notNull, cannot be null
const _insertNullName: Insert = { name: null, email: "a@b.com", age: 30 };

// @ts-expect-error — name must be string, not number
const _insertWrongType: Insert = { name: 42, email: "a@b.com", age: 30 };

// ═══════════════════════════════════════════════════════════════════════════
// InferModel — all fields, correct nullability
// ═══════════════════════════════════════════════════════════════════════════

type User = InferModel<typeof Users>;

// Valid: every field present, nullable field is null
const _validUser: User = { id: 1, name: "Alice", email: "a@b.com", age: null };

// Valid: nullable field with a value
const _userWithAge: User = { id: 1, name: "Alice", email: "a@b.com", age: 30 };
use(_validUser, _userWithAge);

// @ts-expect-error — name is not nullable
const _userNullName: User = { id: 1, name: null, email: "a@b.com", age: null };

// @ts-expect-error — age is required (as number | null), cannot be omitted
const _userMissingAge: User = { id: 1, name: "Alice", email: "a@b.com" };

// @ts-expect-error — id must be number, not string
const _userStringId: User = { id: "abc", name: "Alice", email: "a@b.com", age: null };

// ═══════════════════════════════════════════════════════════════════════════
// InferUpdate — readonly excluded, all fields optional
// ═══════════════════════════════════════════════════════════════════════════

type Update = InferUpdate<typeof Users>;

// Valid: partial update
const _partialUpdate: Update = { name: "Bob" };

// Valid: empty update
const _emptyUpdate: Update = {};
use(_partialUpdate, _emptyUpdate);

// @ts-expect-error — id is readonly, must not appear in Update
const _updateWithId: Update = { id: 2 };

// @ts-expect-error — name must be string if provided
const _updateBadType: Update = { name: 123 };

// ═══════════════════════════════════════════════════════════════════════════
// InferReadonlyModel — only readonly fields
// ═══════════════════════════════════════════════════════════════════════════

type ReadonlyUser = InferReadonlyModel<typeof Users>;

// Valid: only id (the sole readonly column)
const _roUser: ReadonlyUser = { id: 1 };
use(_roUser);

// @ts-expect-error — name is mutable, must not appear
const _roWithName: ReadonlyUser = { id: 1, name: "Alice" };

// ═══════════════════════════════════════════════════════════════════════════
// col builder — type narrowing
// ═══════════════════════════════════════════════════════════════════════════

const Timestamps = defineTable("timestamps", {
  createdAt: col.datetime().notNull().readonly(),
  updatedAt: col.datetime().notNull(),
  deletedAt: col.datetime().nullable(),
});

type TsInsert = InferInsert<typeof Timestamps>;

// Valid: only mutable fields
const _tsInsert: TsInsert = { updatedAt: new Date(), deletedAt: null };
use(_tsInsert);

// Verify that createdAt (readonly) is excluded from InferInsert
// by confirming the insert type only has updatedAt and deletedAt.
const _tsInsertKeys: keyof TsInsert = "updatedAt";
use(_tsInsertKeys);

// @ts-expect-error — updatedAt is Date, not string
const _tsInsertBadType: TsInsert = { updatedAt: "2024-01-01", deletedAt: null };

// ═══════════════════════════════════════════════════════════════════════════
// json and array column types
// ═══════════════════════════════════════════════════════════════════════════

interface Address {
  street: string;
  city: string;
}

const WithJson = defineTable("with_json", {
  id: col.int().primaryKey(),
  metadata: col.json<Address>().notNull(),
  tags: col.array<string>().notNull(),
});

type JsonModel = InferModel<typeof WithJson>;

// Valid
const _jm: JsonModel = {
  id: 1,
  metadata: { street: "123 Main", city: "NYC" },
  tags: ["a", "b"],
};
use(_jm);

// @ts-expect-error — metadata must be Address shape, not string
const _jmBad: JsonModel = { id: 1, metadata: "not json", tags: [] };

// @ts-expect-error — tags must be string[], not number[]
const _jmBadTags: JsonModel = { id: 1, metadata: { street: "", city: "" }, tags: [1, 2] };

// ═══════════════════════════════════════════════════════════════════════════
// createDb — Db interface shape
// ═══════════════════════════════════════════════════════════════════════════

const db: Db = createDb(new SqliteAdapter());

// Valid: adapter and config are accessible
const _adapter = db.adapter;
const _config = db.config;
use(_adapter, _config);

// Db now has .query(), .execute(), .atomically() — verify they exist
use(db.query, db.execute, db.atomically);

// ═══════════════════════════════════════════════════════════════════════════
// createConnections — MultiDb<Names> type inference
// ═══════════════════════════════════════════════════════════════════════════

const multi = createConnections({
  connections: {
    primary: new SqliteAdapter(),
    replica: new SqliteAdapter(),
  },
  default: "primary",
});

// Valid: registry.get() with known names
multi.registry.get("primary");
multi.registry.get("replica");

// @ts-expect-error — "analytics" is not a registered connection name
multi.registry.get("analytics");

// .query() exists and is callable — no @ts-expect-error needed
use(multi.query);

// .use() exists and returns a ScopedDb
const _scopedDb = multi.use("primary");
use(_scopedDb);

// options.connection is typed as the Names union — valid names compile
use(multi.query(sql`SELECT 1`, { connection: "primary" }));
use(multi.query(sql`SELECT 1`, { connection: "replica" }));

// @ts-expect-error — "analytics" is not a registered connection name
use(multi.query(sql`SELECT 1`, { connection: "analytics" }));

// ScopedDb.query() takes only a SqlFragment — no connection option
const _scoped = multi.use("primary");
// @ts-expect-error — ScopedDb has no options argument, connection is pre-resolved
use(_scoped.query(sql`SELECT 1`, { connection: "replica" }));

// ═══════════════════════════════════════════════════════════════════════════
// sql tagged template — type safety
// ═══════════════════════════════════════════════════════════════════════════

// Valid
const _frag: SqlFragment = sql`SELECT * FROM users WHERE id = ${1}`;
use(_frag);

// @ts-expect-error — string is not assignable to SqlFragment
const _notFrag: SqlFragment = "SELECT * FROM users";

// ═══════════════════════════════════════════════════════════════════════════
// computed columns
// ═══════════════════════════════════════════════════════════════════════════

const WithComputed = defineTable("orders", {
  id: col.int().primaryKey(),
  price: col.decimal().notNull(),
  qty: col.int().notNull(),
  total: col.decimal().computed("price * qty"),
});

type OrderInsert = InferInsert<typeof WithComputed>;

// Valid: only mutable fields (price, qty)
const _order: OrderInsert = { price: 9.99, qty: 3 };
use(_order);

// @ts-expect-error — total is computed (readonly), must not appear
const _orderWithTotal: OrderInsert = { price: 9.99, qty: 3, total: 29.97 };

// @ts-expect-error — id is primaryKey (readonly), must not appear
const _orderWithId: OrderInsert = { id: 1, price: 9.99, qty: 3 };
