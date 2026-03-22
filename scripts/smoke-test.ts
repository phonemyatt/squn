import {
  createDb,
  defineTable,
  col,
  sql,
  ErrorCode,
  QueryError,
} from "../src/index.ts";
import type { InferModel, InferInsert } from "../src/index.ts";
import { SqliteAdapter } from "../src/adapters/sqlite.ts";

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

let step = 0;
function pass(desc: string): void {
  step++;
  console.log(`  ✓ Step ${step} — ${desc}`);
}

// Step 1 — Imports
pass("Imports resolved without errors");

// Step 2 — Define schema
const Users = defineTable("users", {
  id: col.int().primaryKey().readonly(),
  name: col.nvarchar(100).notNull(),
  email: col.nvarchar(255).notNull(),
  age: col.int().nullable(),
  createdAt: col.datetime().notNull().readonly(),
});
type User = InferModel<typeof Users>;
type UserInsert = InferInsert<typeof Users>;
pass("Users table defined with col builder");

// Step 3 — Create db
const db = createDb(new SqliteAdapter({ file: ":memory:" }));
pass("createDb() with SqliteAdapter :memory:");

// Step 4 — DDL
await db.execute(
  sql`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, age INTEGER, createdAt TEXT NOT NULL DEFAULT (datetime('now')))`,
);
pass("CREATE TABLE executed");

// Step 5 — Insert
await db.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Alice"}, ${"alice@test.com"}, ${30})`);
pass("INSERT via sql template");

// Step 6 — Query all
const allUsers = await db.query<User>(sql`SELECT * FROM users`);
assert(Array.isArray(allUsers), "query returns array");
assert(allUsers.length === 1, "query returns 1 row");
assert(allUsers[0]?.name === "Alice", "name matches");
pass("query<User>() returns correct rows");

// Step 7 — queryFirst existing
const first = await db.queryFirst<User>(sql`SELECT * FROM users WHERE name = ${"Alice"}`);
assert(first !== null, "queryFirst returns non-null for existing row");
pass("queryFirst() returns existing row");

// Step 8 — queryFirst non-existent
const missing = await db.queryFirst<User>(sql`SELECT * FROM users WHERE name = ${"Nobody"}`);
assert(missing === null, "queryFirst returns null for missing row");
pass("queryFirst() returns null for non-existent row");

// Step 9 — querySingle throws
try {
  await db.querySingle<User>(sql`SELECT * FROM users WHERE name = ${"Nobody"}`);
  throw new Error("should have thrown");
} catch (err) {
  assert(err instanceof QueryError, "error is QueryError");
  assert((err as QueryError).code === ErrorCode.NO_ROWS_FOUND, "code is QUERY_003");
}
pass("querySingle() throws QueryError(NO_ROWS_FOUND)");

// Step 10 — atomically commit
const inserted = await db.atomically(async (q) => {
  await q.execute("INSERT INTO users (name, email, age) VALUES ('Bob', 'bob@test.com', 25)", []);
  const rows = await q.query("SELECT * FROM users WHERE name = 'Bob'", []);
  return rows[0] as User;
});
assert(inserted?.name === "Bob", "atomically returned Bob");
pass("atomically() commit — row visible");

// Step 11 — atomically rollback
try {
  await db.atomically(async (q) => {
    await q.execute("INSERT INTO users (name, email, age) VALUES ('Ghost', 'ghost@test.com', 99)", []);
    throw new Error("intentional failure");
  });
} catch {
  // expected
}
const ghost = await db.queryFirst<User>(sql`SELECT * FROM users WHERE name = ${"Ghost"}`);
assert(ghost === null, "rolled-back row is not present");
pass("atomically() rollback — row not visible");

// Step 12 — prepare first
const findByName = db.prepare<User, { name: string }>(
  sql`SELECT * FROM users WHERE name = ${0}`,
  ["name"],
);
const alice = await findByName.first({ name: "Alice" });
assert(alice !== null && alice.name === "Alice", "prepared first returns Alice");
pass("prepare().first() returns correct row");

// Step 13 — prepare scalar
const countQ = db.prepare<number, Record<string, never>>(
  sql`SELECT COUNT(*) as cnt FROM users`,
  [],
);
const count = await countQ.scalar({} as Record<string, never>);
assert(count === 2, `scalar count is 2, got ${count}`);
pass("prepare().scalar() returns correct count");

// Step 14 — executeBatch
const batchFragment = sql`INSERT INTO users (name, email, age) VALUES (@name, @email, @age)`;
const batchRows = Array.from({ length: 100 }, (_, i) => ({
  name: `batch_${i}`,
  email: `batch_${i}@test.com`,
  age: i,
}));
const batchResult = await db.executeBatch(batchFragment, batchRows);
assert(batchResult.rowsAffected === 100, `executeBatch affected 100, got ${batchResult.rowsAffected}`);
pass("executeBatch() with 100 rows");

// Step 15 — stream
const streamed: User[] = [];
for await (const row of db.stream<User>(sql`SELECT * FROM users ORDER BY id`)) {
  streamed.push(row);
}
assert(streamed.length === 102, `stream yielded 102 rows, got ${streamed.length}`);
assert(streamed[0]?.name === "Alice", "first streamed row is Alice");
pass("stream() yields all rows in order");

// Step 16 — transaction with savepoint
await db.transaction(async (tx) => {
  await tx.execute("INSERT INTO users (name, email, age) VALUES ('PreSP', 'presp@test.com', 1)", []);
  const sp = await tx.savepoint();
  await tx.execute("INSERT INTO users (name, email, age) VALUES ('PostSP', 'postsp@test.com', 2)", []);
  await sp.rollback();
  // Only PreSP should survive after commit
});
const preSp = await db.queryFirst<User>(sql`SELECT * FROM users WHERE name = ${"PreSP"}`);
const postSp = await db.queryFirst<User>(sql`SELECT * FROM users WHERE name = ${"PostSP"}`);
assert(preSp !== null, "pre-savepoint row is visible");
assert(postSp === null, "post-savepoint row was rolled back");
pass("transaction() with savepoint — partial rollback");

console.log(`\n  All ${step} steps passed.`);
