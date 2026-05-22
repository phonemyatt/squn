import { SqliteAdapter } from "../src/adapters/sqlite.ts";
import { createConnections, createConnection } from "../src/db.ts";
import { splitAndMap } from "../src/mapping/nested-mapper.ts";
import {
  col,
  defineTable,
  ErrorCode,
  QueryError,
  sql,
} from "../src/index.ts";
import type { InferModel } from "../src/index.ts";
import { TableType } from "../src/core/tvp/table-type.ts";
import { tvp } from "../src/core/tvp/tvp-builder.ts";
import { ValidationError } from "../src/errors/types.ts";

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
pass("Users table defined with col builder");

// Step 3 — Create db
const db = createConnection(new SqliteAdapter({ file: ":memory:" }));
pass("createConnection() with SqliteAdapter :memory:");

// Step 4 — DDL
await db.execute(
  sql`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, age INTEGER, createdAt TEXT NOT NULL DEFAULT (datetime('now')))`,
);
pass("CREATE TABLE executed");

// Step 5 — Insert
await db.execute(
  sql`INSERT INTO users (name, email, age) VALUES (${"Alice"}, ${"alice@test.com"}, ${30})`,
);
pass("INSERT via sql template");

// Step 6 — query, queryFirst, querySingle, queryScalar
const allUsers = await db.query<User>(sql`SELECT * FROM users`);
assert(Array.isArray(allUsers), "query returns array");
assert(allUsers.length === 1, "query returns 1 row");
assert(allUsers[0]?.name === "Alice", "name matches");

const first = await db.queryFirst<User>(sql`SELECT * FROM users WHERE name = ${"Alice"}`);
assert(first !== null, "queryFirst returns non-null");
assert(first?.name === "Alice", "queryFirst name matches");

const missing = await db.queryFirst<User>(sql`SELECT * FROM users WHERE name = ${"Nobody"}`);
assert(missing === null, "queryFirst returns null for missing row");

try {
  await db.querySingle<User>(sql`SELECT * FROM users WHERE name = ${"Nobody"}`);
  throw new Error("should have thrown");
} catch (err) {
  assert(err instanceof QueryError, "error is QueryError");
  assert((err as QueryError).code === ErrorCode.NO_ROWS_FOUND, "code is NO_ROWS_FOUND");
}

const countRow = await db.queryScalar<number>(sql`SELECT COUNT(*) FROM users`);
assert(countRow === 1, `queryScalar count is 1, got ${countRow}`);
pass("query, queryFirst, querySingle, queryScalar all correct");

// Step 7 — atomically() with sql`` fragments (V2-2)
const inserted = await db.atomically(async (q) => {
  await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Bob"}, ${"bob@test.com"}, ${25})`);
  const rows = await q.query<User>(sql`SELECT * FROM users WHERE name = ${"Bob"}`);
  return rows[0] as User;
});
assert(inserted?.name === "Bob", "atomically returned Bob");

// atomically rollback
try {
  await db.atomically(async (q) => {
    await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Ghost"}, ${"ghost@test.com"}, ${99})`);
    throw new Error("intentional failure");
  });
} catch { /* expected */ }
const ghost = await db.queryFirst<User>(sql`SELECT * FROM users WHERE name = ${"Ghost"}`);
assert(ghost === null, "rolled-back row is not present");
pass("atomically() with sql`` fragments — commit and rollback");

// Step 8 — transaction() with savepoint rollback
await db.transaction(async (tx) => {
  await tx.execute("INSERT INTO users (name, email, age) VALUES ('PreSP', 'presp@test.com', 1)", []);
  const sp = await tx.savepoint();
  await tx.execute("INSERT INTO users (name, email, age) VALUES ('PostSP', 'postsp@test.com', 2)", []);
  await sp.rollback();
});
const preSp = await db.queryFirst<User>(sql`SELECT * FROM users WHERE name = ${"PreSP"}`);
const postSp = await db.queryFirst<User>(sql`SELECT * FROM users WHERE name = ${"PostSP"}`);
assert(preSp !== null, "pre-savepoint row is visible");
assert(postSp === null, "post-savepoint row was rolled back");
pass("transaction() with savepoint — partial rollback");

// Step 9 — prepare() — all(), first(), single(), scalar()
const findByName = db.prepare<User, { name: string }>(
  sql`SELECT * FROM users WHERE name = ${0}`,
  ["name"],
);
const aliceResult = await findByName.first({ name: "Alice" });
assert(aliceResult !== null && aliceResult.name === "Alice", "prepare().first() returns Alice");

const allResult = await findByName.all({ name: "Alice" });
assert(allResult.length === 1, "prepare().all() returns 1 row");

const countQ = db.prepare<number, Record<string, never>>(
  sql`SELECT COUNT(*) as cnt FROM users`,
  [],
);
const cnt = await countQ.scalar({} as Record<string, never>);
assert(cnt === 3, `prepare().scalar() count is 3, got ${cnt}`); // Alice, Bob, PreSP
pass("prepare() — all(), first(), scalar()");

// Step 10 — stream() — rows arrive individually
const streamed: User[] = [];
for await (const row of db.stream<User>(sql`SELECT * FROM users ORDER BY id`)) {
  streamed.push(row);
}
assert(streamed.length === 3, `stream yielded 3 rows, got ${streamed.length}`);
assert(streamed[0]?.name === "Alice", "first streamed row is Alice");
pass("stream() yields all rows");

// Step 11 — executeBatch() — 100 rows
const batchFragment = sql`INSERT INTO users (name, email, age) VALUES (@name, @email, @age)`;
const batchRows = Array.from({ length: 100 }, (_, i) => ({
  name: `batch_${i}`,
  email: `batch_${i}@test.com`,
  age: i,
}));
const batchResult = await db.executeBatch(batchFragment, batchRows);
assert(batchResult.rowsAffected === 100, `executeBatch affected 100, got ${batchResult.rowsAffected}`);
pass("executeBatch() with 100 rows — rowsAffected === 100");

// Step 12 — createConnections() — .use("replica").query() routes correctly
const primary = new SqliteAdapter({ file: ":memory:" });
const replica = new SqliteAdapter({ file: ":memory:" });
await createConnection(primary).execute(sql`CREATE TABLE pings (id INTEGER PRIMARY KEY)`);
await createConnection(replica).execute(sql`CREATE TABLE pings (id INTEGER PRIMARY KEY)`);
await createConnection(primary).execute(sql`INSERT INTO pings VALUES (1)`);
// replica has no rows

const multi = createConnections({ connections: { primary, replica }, default: "primary" });
const primaryRows = await multi.use("primary").query<{ id: number }>(sql`SELECT * FROM pings`);
const replicaRows = await multi.use("replica").query<{ id: number }>(sql`SELECT * FROM pings`);
assert(primaryRows.length === 1, "primary has 1 row");
assert(replicaRows.length === 0, "replica has 0 rows — correctly isolated");
pass("createConnections() — .use('replica').query() routes to replica");

// Step 13 — createConnections() — .query(sql, { connection: 'replica' })
const routedRows = await multi.query<{ id: number }>(sql`SELECT * FROM pings`, { connection: "replica" });
assert(routedRows.length === 0, "routed to replica — 0 rows");
const defaultRows = await multi.query<{ id: number }>(sql`SELECT * FROM pings`);
assert(defaultRows.length === 1, "default routes to primary — 1 row");
pass("createConnections() — .query(sql, { connection: ... }) routes correctly");

// Step 14 — TVP — tvp() validates schema and throws on mismatch
const OrderType = new TableType("dbo.OrderType", { orderId: "int", amount: "decimal(10,2)" });
const validTvp = tvp(OrderType, [{ orderId: 1, amount: 99.99 }]);
assert(validTvp.__isTvp === true, "tvp() returns TvpValue");
assert(validTvp.rows.length === 1, "tvp() has 1 row");

let tvpError: unknown;
try {
  tvp(OrderType, [{ orderId: 1 } as unknown as { orderId: unknown; amount: unknown }]);
} catch (e) {
  tvpError = e;
}
assert(tvpError instanceof ValidationError, "tvp() throws ValidationError on mismatch");
assert((tvpError as ValidationError).code === ErrorCode.TVP_SCHEMA_MISMATCH, "code is TVP_SCHEMA_MISMATCH");
pass("TVP — tvp() validates schema and throws on mismatch");

// Step 15 — splitAndMap() from mapping/nested-mapper
const joinRows = [
  { id: 1, name: "Alice", order_id: 10, order_total: 99.0 },
  { id: 1, name: "Alice", order_id: 11, order_total: 50.0 },
  { id: 2, name: "Bob", order_id: 12, order_total: 25.0 },
];
const mapped = splitAndMap(
  joinRows,
  ["order_id"],
  [
    (row) => ({ id: row["id"], name: row["name"] }),
    (row) => (row["order_id"] !== null ? { id: row["order_id"], total: row["order_total"] } : null),
  ],
);
assert(mapped.length === 2, `splitAndMap returned 2 root rows, got ${mapped.length}`);
pass("splitAndMap() from mapping/nested-mapper — JOIN result splitting");

console.log(`\n  All ${step} steps passed.`);
