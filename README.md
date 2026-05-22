# squn

[![npm](https://img.shields.io/npm/v/@phonemyatt/squn)](https://www.npmjs.com/package/@phonemyatt/squn)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Type-safe SQL query library for [Bun](https://bun.sh). Supports SQLite, PostgreSQL, MySQL, and MSSQL with a unified API, no codegen, and zero magic.

## Install

```bash
bun add @phonemyatt/squn
```

MSSQL requires one extra package:

```bash
bun add mssql
```

## Adapters

| Database   | Adapter           | Driver              |
|------------|-------------------|---------------------|
| SQLite     | `SqliteAdapter`   | `bun:sqlite` (built-in) |
| PostgreSQL | `PostgresAdapter` | Bun's native Postgres |
| MySQL      | `MysqlAdapter`    | Bun's native MySQL  |
| MSSQL      | `MssqlAdapter`    | `mssql` npm package |

## Quick start

### SQLite

```typescript
import { createDb, SqliteAdapter, sql } from "@phonemyatt/squn";

const db = createDb(new SqliteAdapter({ filename: "app.db" }));
// or in-memory:
const db = createDb(new SqliteAdapter({ filename: ":memory:" }));

interface User { id: number; name: string; email: string; age: number | null; }

// CREATE TABLE
await db.execute(sql`
  CREATE TABLE IF NOT EXISTS users (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    age   INTEGER
  )
`);

// INSERT
await db.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Alice"}, ${"alice@example.com"}, ${30})`);

// SELECT
const users  = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);
const user   = await db.querySingle<User>(sql`SELECT * FROM users WHERE email = ${"alice@example.com"}`);
const maybe  = await db.queryFirst<User>(sql`SELECT * FROM users WHERE id = ${99}`);
const count  = await db.queryScalar<number>(sql`SELECT COUNT(*) FROM users`);

// UPDATE / DELETE
await db.execute(sql`UPDATE users SET age = ${31} WHERE id = ${user.id}`);
await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);

// TRANSACTION
await db.atomically(async (q) => {
  await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Bob"}, ${"bob@example.com"}, ${25})`);
  await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Carol"}, ${"carol@example.com"}, ${28})`);
  // rolls back both inserts automatically if either throws
});

// BATCH INSERT
await db.executeBatch(
  sql`INSERT INTO users (name, email, age) VALUES (@name, @email, @age)`,
  [
    { name: "Bob",   email: "bob@example.com",   age: 25 },
    { name: "Carol", email: "carol@example.com", age: 28 },
  ],
);
```

### PostgreSQL

```typescript
import { createDb, PostgresAdapter, sql } from "@phonemyatt/squn";

const db = createDb(new PostgresAdapter({
  url: "postgresql://user:password@localhost:5432/mydb",
}));

interface User { id: number; name: string; email: string; age: number | null; }

// CREATE TABLE
await db.execute(sql`
  CREATE TABLE IF NOT EXISTS users (
    id    SERIAL PRIMARY KEY,
    name  TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    age   INTEGER
  )
`);

// INSERT returning the new row
const [newUser] = await db.query<User>(
  sql`INSERT INTO users (name, email, age) VALUES (${"Alice"}, ${"alice@example.com"}, ${30}) RETURNING *`
);

// SELECT
const users  = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);
const user   = await db.querySingle<User>(sql`SELECT * FROM users WHERE email = ${"alice@example.com"}`);
const maybe  = await db.queryFirst<User>(sql`SELECT * FROM users WHERE id = ${99}`);
const count  = await db.queryScalar<number>(sql`SELECT COUNT(*) FROM users`);

// UPDATE / DELETE
await db.execute(sql`UPDATE users SET age = ${31} WHERE id = ${user.id}`);
await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);

// TRANSACTION with row-level locking
await db.atomically(async (q) => {
  const [sender]   = await q.query<User>(sql`SELECT * FROM users WHERE id = ${1} FOR UPDATE`);
  const [receiver] = await q.query<User>(sql`SELECT * FROM users WHERE id = ${2} FOR UPDATE`);
  await q.execute(sql`UPDATE accounts SET balance = balance - ${100} WHERE user_id = ${sender.id}`);
  await q.execute(sql`UPDATE accounts SET balance = balance + ${100} WHERE user_id = ${receiver.id}`);
});

// BATCH INSERT
await db.executeBatch(
  sql`INSERT INTO users (name, email, age) VALUES (@name, @email, @age)`,
  [
    { name: "Bob",   email: "bob@example.com",   age: 25 },
    { name: "Carol", email: "carol@example.com", age: 28 },
  ],
);
```

### MySQL

```typescript
import { createDb, MysqlAdapter, sql } from "@phonemyatt/squn";

const db = createDb(new MysqlAdapter({
  url: "mysql://user:password@localhost:3306/mydb",
}));

interface User { id: number; name: string; email: string; age: number | null; }

// CREATE TABLE
await db.execute(sql`
  CREATE TABLE IF NOT EXISTS users (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    age   INT NULL
  )
`);

// INSERT
await db.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Alice"}, ${"alice@example.com"}, ${30})`);

// SELECT
const users  = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);
const user   = await db.querySingle<User>(sql`SELECT * FROM users WHERE email = ${"alice@example.com"}`);
const maybe  = await db.queryFirst<User>(sql`SELECT * FROM users WHERE id = ${99}`);
const count  = await db.queryScalar<number>(sql`SELECT COUNT(*) FROM users`);

// UPDATE / DELETE
await db.execute(sql`UPDATE users SET age = ${31} WHERE id = ${user.id}`);
await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);

// TRANSACTION
await db.atomically(async (q) => {
  await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Bob"}, ${"bob@example.com"}, ${25})`);
  await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Carol"}, ${"carol@example.com"}, ${28})`);
});

// BATCH INSERT
await db.executeBatch(
  sql`INSERT INTO users (name, email, age) VALUES (@name, @email, @age)`,
  [
    { name: "Bob",   email: "bob@example.com",   age: 25 },
    { name: "Carol", email: "carol@example.com", age: 28 },
  ],
);
```

### MSSQL

```typescript
import { createDb, MssqlAdapter, sql, sqlRaw } from "@phonemyatt/squn";

const db = createDb(new MssqlAdapter({
  host: "localhost", port: 1433, database: "mydb",
  user: "sa", password: "Password123!",
  encrypt: false, trustServerCertificate: true,
}));

// Azure SQL
const db = createDb(new MssqlAdapter({
  host: "myserver.database.windows.net", database: "mydb",
  auth: { type: "azure-ad", tenantId: "...", clientId: "...", clientSecret: "..." },
  encrypt: true,
}));

interface User { id: number; name: string; email: string; age: number | null; }

// CREATE TABLE
await db.execute(sql`
  IF OBJECT_ID('users', 'U') IS NULL
  CREATE TABLE users (
    id    INT IDENTITY(1,1) PRIMARY KEY,
    name  NVARCHAR(255) NOT NULL,
    email NVARCHAR(255) NOT NULL UNIQUE,
    age   INT NULL
  )
`);

// INSERT returning the new row via OUTPUT
const [newUser] = await db.query<User>(
  sql`INSERT INTO users (name, email, age) OUTPUT INSERTED.* VALUES (${"Alice"}, ${"alice@example.com"}, ${30})`
);

// SELECT
const users  = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);
const user   = await db.querySingle<User>(sql`SELECT * FROM users WHERE email = ${"alice@example.com"}`);
const maybe  = await db.queryFirst<User>(sql`SELECT TOP 1 * FROM users WHERE id = ${99}`);
const count  = await db.queryScalar<number>(sql`SELECT COUNT(*) FROM users`);

// UPDATE / DELETE
await db.execute(sql`UPDATE users SET age = ${31} WHERE id = ${user.id}`);
await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);

// TRANSACTION
await db.atomically(async (q) => {
  await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Bob"}, ${"bob@example.com"}, ${25})`);
  await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Carol"}, ${"carol@example.com"}, ${28})`);
});

// BATCH INSERT
await db.executeBatch(
  sql`INSERT INTO users (name, email, age) VALUES (@name, @email, @age)`,
  [
    { name: "Bob",   email: "bob@example.com",   age: 25 },
    { name: "Carol", email: "carol@example.com", age: 28 },
  ],
);

// STORED PROCEDURE
const [users, roles] = await db.queryMultiple(sqlRaw("EXEC GetUsersAndRoles"));
```

## SQL authoring

```typescript
import { sql, sqlRaw, sqlIdentifier, sqlQualifiedIdentifier, sqlIf, sqlJoin } from "@phonemyatt/squn";

// Nested fragment composition — placeholders renumbered automatically
const filter = sql`age > ${18}`;
const q = sql`SELECT * FROM users WHERE ${filter} ORDER BY name`;

// Hardcoded SQL — no params, safe for DDL or literals you control
const ddl = sqlRaw("CREATE TABLE IF NOT EXISTS logs (id SERIAL PRIMARY KEY)");

// Safe identifier quoting
const col = sqlIdentifier("user_name");                    // "user_name"
const fqn = sqlQualifiedIdentifier("public", "users");     // "public"."users"

// Conditional fragment
const clause = sqlIf(isAdmin, sql`AND role = ${"admin"}`);

// Join fragments with separator
const where = sqlJoin([sql`age > ${18}`, sql`active = ${true}`], " AND ");
```

## Core API

All methods accept a `SqlFragment` (from `sql` or `sqlRaw`).

### Queries

```typescript
const users  = await db.query<User>(sql`SELECT * FROM users`);
const user   = await db.queryFirst<User>(sql`SELECT * FROM users WHERE id = ${1}`);
const single = await db.querySingle<User>(sql`SELECT * FROM users WHERE id = ${1}`);
const count  = await db.queryScalar<number>(sql`SELECT COUNT(*) FROM users`);
const [users, roles] = await db.queryMultiple(sqlRaw("EXEC GetUsersAndRoles"));
```

### Execute

```typescript
const { rowsAffected } = await db.execute(
  sql`UPDATE users SET active = ${true} WHERE id = ${userId}`
);

await db.executeBatch(
  sql`INSERT INTO users (name, age) VALUES (@name, @age)`,
  [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }],
);
```

### Streaming

```typescript
for await (const user of db.stream<User>(sql`SELECT * FROM users`, 100)) {
  process(user);
}
```

### Transactions

```typescript
await db.atomically(async (q) => {
  await q.execute(sql`INSERT INTO orders (user_id) VALUES (${userId})`);
  await q.execute(sql`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${accountId}`);
});
```

## Prepared queries

```typescript
import { prepare, sql } from "@phonemyatt/squn";

const findByAge = prepare<User, { minAge: number }>(
  adapter,
  sql`SELECT * FROM users WHERE age >= ${0}`,
  ["minAge"],
);

const adults  = await findByAge.query({ minAge: 18 });
const seniors = await findByAge.query({ minAge: 65 });
```

## Multi-connection

```typescript
import { createConnections, PostgresAdapter, MysqlAdapter } from "@phonemyatt/squn";

const db = createConnections({
  connections: {
    primary:   new PostgresAdapter({ url: process.env.PG_PRIMARY_URL }),
    replica:   new PostgresAdapter({ url: process.env.PG_REPLICA_URL }),
    analytics: new MysqlAdapter({ url: process.env.MYSQL_URL }),
  },
  default: "primary",
});

const users  = await db.query<User>(sql`SELECT * FROM users`);
const stats  = await db.query<Stat>(sql`SELECT * FROM stats`, { connection: "analytics" });
const replica = db.use("replica");
const [users, roles] = await db.concurrent(
  db.query<User>(sql`SELECT * FROM users`),
  db.query<Role>(sql`SELECT * FROM roles`),
);
```

## Error handling

```typescript
import { SqunError, ErrorCode } from "@phonemyatt/squn";

try {
  await db.query(sql`SELECT * FROM nonexistent`);
} catch (err) {
  if (err instanceof SqunError) {
    console.log(err.context.adapter);  // "postgres" | "mysql" | "mssql" | "sqlite"
    console.log(err.context.sql);
    console.log(err.code);             // ErrorCode enum value
  }
}
```

Error types: `QueryError`, `TransactionError`, `ConnectionError`, `ValidationError`, `SecurityError`, `TimeoutError`, `AuthError`, `MappingError`, `AdapterError`, `SqunConfigError`.

## Logging

```typescript
import { createDb, SqliteAdapter, consoleLogger } from "@phonemyatt/squn";

const db = createDb(adapter, { log: { logger: consoleLogger } });
```

## Development

```bash
bun install          # install dependencies
bun run typecheck    # tsc --noEmit
bun run lint         # Biome CI check
bun run lint:fix     # Biome auto-fix
bun test             # unit tests
bun run build        # emit dist/
bun run ci           # typecheck + lint + tests (full local CI)
```

Integration tests (requires Docker):

```bash
bun run test:integration
```

## Release

```bash
bunx changelogen --release   # bumps version, generates CHANGELOG, creates git tag
git push origin v0.x.0       # triggers publish.yml → npm publish
```
