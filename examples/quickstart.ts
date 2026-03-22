import { createDb, sql, SqliteAdapter, col, defineTable } from "../src/index.ts";

// 1. Define schema
const Users = defineTable("users", {
  id: col.int().primaryKey(),
  name: col.nvarchar(100).notNull(),
  email: col.nvarchar(255).notNull().unique(),
  age: col.int().nullable(),
});

// 2. Create database
const { adapter } = createDb(new SqliteAdapter({ file: ":memory:" }));

// 3. Create table
await adapter.execute(
  "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, age INTEGER)",
  [],
);

// 4. Insert data
await adapter.execute("INSERT INTO users (name, email, age) VALUES (?, ?, ?)", [
  "Alice",
  "alice@example.com",
  30,
]);
await adapter.execute("INSERT INTO users (name, email, age) VALUES (?, ?, ?)", [
  "Bob",
  "bob@example.com",
  null,
]);

// 5. Query
const rows = await adapter.query("SELECT * FROM users ORDER BY id", []);
console.log("All users:", rows);

// 6. SQL tagged template
const fragment = sql`SELECT * FROM users WHERE age >= ${18}`;
console.log("Fragment:", { text: fragment.text, params: fragment.params });

// 7. Schema info
console.log("Table:", Users.tableName);
console.log("Columns:", Users.columnNames);
console.log("id is readonly:", Users.columns.id.isReadonly);
console.log("age is nullable:", Users.columns.age.isNullable);

await adapter.close();
console.log("\nDone!");
