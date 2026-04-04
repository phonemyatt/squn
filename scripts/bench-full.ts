import { SqliteAdapter } from "../src/adapters/sqlite.ts";
import { sql } from "../src/sql/tag.ts";
import { createFragment } from "../src/sql/fragment.ts";
import { formatSql } from "../src/sql/formatter.ts";
import { validateSql } from "../src/sql/validator.ts";
import { buildParams } from "../src/core/param-builder.ts";
import { QueryCache } from "../src/cache/query-cache.ts";
import { ParamBuffer } from "../src/cache/param-buffer.ts";
import { prepare } from "../src/api/prepared.ts";
import { detectInjection } from "../src/sql/injection-detector.ts";
import { compileMapper } from "../src/core/type-mapper.ts";
import { col } from "../src/types/col.ts";
import { defineTable } from "../src/types/table.ts";

const ITERATIONS = 50_000;
const WARM = 1_000;

function bench(name: string, fn: () => void): void {
  // warm up
  for (let i = 0; i < WARM; i++) fn();

  const start = Bun.nanoseconds();
  for (let i = 0; i < ITERATIONS; i++) fn();
  const elapsed = Bun.nanoseconds() - start;

  const avgNs = Math.round(elapsed / ITERATIONS);
  const opsPerSec = Math.round((ITERATIONS / elapsed) * 1_000_000_000);
  console.log(
    `  ${name.padEnd(40)} ${avgNs.toLocaleString().padStart(8)}ns   ${opsPerSec.toLocaleString().padStart(12)} ops/s`,
  );
}

async function benchAsync(
  name: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < WARM; i++) await fn();

  const start = Bun.nanoseconds();
  for (let i = 0; i < ITERATIONS; i++) await fn();
  const elapsed = Bun.nanoseconds() - start;

  const avgNs = Math.round(elapsed / ITERATIONS);
  const opsPerSec = Math.round((ITERATIONS / elapsed) * 1_000_000_000);
  console.log(
    `  ${name.padEnd(40)} ${avgNs.toLocaleString().padStart(8)}ns   ${opsPerSec.toLocaleString().padStart(12)} ops/s`,
  );
}

console.log(
  `\nSqun Performance Benchmark (${ITERATIONS.toLocaleString()} iterations)\n`,
);
console.log(
  "── SQL Layer ──────────────────────────────────────────────────────────",
);

bench("sql`` tag (1 param)", () => {
  sql`SELECT * FROM users WHERE id = ${42}`;
});

bench("sql`` tag (3 params)", () => {
  sql`SELECT * FROM users WHERE id = ${1} AND name = ${"Alice"} AND age > ${18}`;
});

bench("sql`` tag (nested fragment)", () => {
  const inner = sql`age > ${18}`;
  sql`SELECT * FROM users WHERE ${inner}`;
});

bench("formatSql()", () => {
  formatSql("select * from users where id = $1 and name = $2 order by id asc");
});

const validFrag = createFragment(
  "SELECT * FROM users WHERE id = $1 AND name = $2",
  [1, "a"],
);
bench("validateSql()", () => {
  validateSql(validFrag);
});

bench("detectInjection() — clean", () => {
  detectInjection("SELECT * FROM users WHERE id = $1");
});

bench("detectInjection() — dirty", () => {
  detectInjection("'; DROP TABLE users --");
});

bench("buildParams() — SQLite ?", () => {
  buildParams(
    "SELECT * FROM users WHERE name = @name AND age > @age",
    { name: "Alice", age: 18 },
    "sqlite",
  );
});

bench("buildParams() — PostgreSQL $N", () => {
  buildParams(
    "SELECT * FROM users WHERE name = @name AND age > @age",
    { name: "Alice", age: 18 },
    "postgres",
  );
});

console.log(
  "\n── Cache Layer ────────────────────────────────────────────────────────",
);

const cache = new QueryCache({ maxSize: 10_000 });
cache.set("SELECT * FROM users WHERE id = $1", {
  normalizedSql: "SELECT * FROM users WHERE id = $1",
  paramNames: ["id"],
});
bench("QueryCache.get() — hit", () => {
  cache.get("SELECT * FROM users WHERE id = $1");
});

bench("QueryCache.get() — miss", () => {
  cache.get("SELECT * FROM orders WHERE id = $1");
});

const buf = new ParamBuffer(8);
bench("ParamBuffer fill + reset (3 params)", () => {
  buf.reset();
  buf.push(1);
  buf.push("Alice");
  buf.push(18);
});

console.log(
  "\n── Type Mapper ────────────────────────────────────────────────────────",
);

const Users = defineTable("users", {
  id: col.int().primaryKey(),
  name: col.nvarchar(100).notNull(),
  email: col.nvarchar(255).notNull(),
  age: col.int().nullable(),
  active: col.boolean().notNull(),
});

const mapper = compileMapper(Users);
const sampleRow = {
  id: 1,
  name: "Alice",
  email: "alice@test.com",
  age: 30,
  active: 1,
};

bench("compileMapper() — map 1 row", () => {
  mapper(sampleRow);
});

console.log(
  "\n── Adapter Layer (SQLite :memory:) ─────────────────────────────────────",
);

const adapter = new SqliteAdapter({ file: ":memory:" });
await adapter.execute(
  "CREATE TABLE bench_users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)",
  [],
);
for (let i = 1; i <= 100; i++) {
  await adapter.execute("INSERT INTO bench_users (name, age) VALUES (?, ?)", [
    `user_${i}`,
    20 + (i % 50),
  ]);
}

await benchAsync("adapter.query() — SELECT 1 row", () =>
  adapter.query("SELECT * FROM bench_users WHERE id = ?", [1]),
);

await benchAsync("adapter.query() — SELECT 100 rows", () =>
  adapter.query("SELECT * FROM bench_users", []),
);

await benchAsync("adapter.execute() — UPDATE 1 row", () =>
  adapter.execute("UPDATE bench_users SET age = ? WHERE id = ?", [99, 1]),
);

console.log(
  "\n── PreparedQuery (end-to-end) ──────────────────────────────────────────",
);

const findById = prepare<
  { id: number; name: string; age: number },
  { id: number }
>(adapter, sql`SELECT * FROM bench_users WHERE id = ${0}`, ["id"]);

await benchAsync("PreparedQuery.first() — hot path", () =>
  findById.first({ id: 42 }),
);

const countQ = prepare<number, Record<string, never>>(
  adapter,
  sql`SELECT COUNT(*) as c FROM bench_users`,
  [],
);

await benchAsync("PreparedQuery.scalar() — count", () =>
  countQ.scalar({} as Record<string, never>),
);

console.log(
  "\n── Transaction ────────────────────────────────────────────────────────",
);

await benchAsync("beginTransaction + execute + commit", async () => {
  const tx = await adapter.beginTransaction();
  await tx.execute("UPDATE bench_users SET age = ? WHERE id = ?", [30, 1]);
  await tx.commit();
});

await adapter.close();

console.log("\nDone.\n");
