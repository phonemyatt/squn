import { SqliteAdapter } from "../src/adapters/sqlite.ts";

const ITERATIONS = 10_000;

// Setup
const adapter = new SqliteAdapter({ file: ":memory:" });
await adapter.execute(
  "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)",
  [],
);
for (let i = 1; i <= 100; i++) {
  await adapter.execute("INSERT INTO users (name, age) VALUES (?, ?)", [
    `user_${i}`,
    20 + (i % 50),
  ]);
}

// Warm up
for (let i = 0; i < 100; i++) {
  await adapter.query("SELECT * FROM users WHERE id = ?", [1]);
}

// Benchmark: sequential SELECT queries
const start = Bun.nanoseconds();
for (let i = 0; i < ITERATIONS; i++) {
  await adapter.query("SELECT * FROM users WHERE id = ?", [(i % 100) + 1]);
}
const elapsed = Bun.nanoseconds() - start;

const elapsedMs = elapsed / 1_000_000;
const qps = Math.round((ITERATIONS / elapsedMs) * 1000);
const avgUs = Math.round((elapsed / ITERATIONS / 1000) * 100) / 100;

console.log(`SQLite adapter benchmark`);
console.log(`  ${ITERATIONS.toLocaleString()} sequential SELECT queries`);
console.log(`  Total: ${elapsedMs.toFixed(1)}ms`);
console.log(`  Avg:   ${avgUs}µs per query`);
console.log(`  QPS:   ${qps.toLocaleString()}`);

await adapter.close();
