# Getting Started

## Installation

```bash
bun add @phonemyatt/squn
```

MSSQL requires one extra package:

```bash
bun add mssql
```

## Quick start

### SQLite

No server needed — great for local dev and testing.

```typescript
import { createConnection, SqliteAdapter, sql } from "@phonemyatt/squn";

const db = createConnection(new SqliteAdapter({ filename: "app.db" }));
// or in-memory:
const db = createConnection(new SqliteAdapter({ filename: ":memory:" }));

interface User {
  id: number;
  name: string;
  email: string;
  age: number | null;
}

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
const { rowsAffected } = await db.execute(
  sql`INSERT INTO users (name, email, age) VALUES (${"Alice"}, ${"alice@example.com"}, ${30})`
);

// SELECT — all rows
const users = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);

// SELECT — single row (throws if not exactly one)
const user = await db.querySingle<User>(sql`SELECT * FROM users WHERE email = ${"alice@example.com"}`);

// SELECT — first row or null
const maybe = await db.queryFirst<User>(sql`SELECT * FROM users WHERE id = ${99}`);

// SELECT — scalar value
const count = await db.queryScalar<number>(sql`SELECT COUNT(*) FROM users`);

// UPDATE
await db.execute(sql`UPDATE users SET age = ${31} WHERE id = ${user.id}`);

// DELETE
await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);

// TRANSACTION
await db.atomically(async (q) => {
  await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Bob"}, ${"bob@example.com"}, ${25})`);
  await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Carol"}, ${"carol@example.com"}, ${28})`);
  // rolls back both inserts automatically if either throws
});
```

---

### PostgreSQL

```typescript
import { createConnection, PostgresAdapter, sql } from "@phonemyatt/squn";

// Connection string
const db = createConnection(new PostgresAdapter({
  url: "postgresql://user:password@localhost:5432/mydb",
}));

// Individual fields
const db = createConnection(new PostgresAdapter({
  host:     "localhost",
  port:     5432,
  database: "mydb",
  user:     "user",
  password: "password",
}));

interface User {
  id: number;
  name: string;
  email: string;
  age: number | null;
}

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

// SELECT — all rows
const users = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);

// SELECT — single row
const user = await db.querySingle<User>(sql`SELECT * FROM users WHERE email = ${"alice@example.com"}`);

// SELECT — first row or null
const maybe = await db.queryFirst<User>(sql`SELECT * FROM users WHERE id = ${99}`);

// SELECT — scalar value
const count = await db.queryScalar<number>(sql`SELECT COUNT(*) FROM users`);

// UPDATE returning affected rows
await db.execute(sql`UPDATE users SET age = ${31} WHERE id = ${user.id}`);

// DELETE
await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);

// TRANSACTION
await db.atomically(async (q) => {
  const [sender] = await q.query<User>(sql`SELECT * FROM users WHERE id = ${1} FOR UPDATE`);
  const [receiver] = await q.query<User>(sql`SELECT * FROM users WHERE id = ${2} FOR UPDATE`);
  await q.execute(sql`UPDATE accounts SET balance = balance - ${100} WHERE user_id = ${sender.id}`);
  await q.execute(sql`UPDATE accounts SET balance = balance + ${100} WHERE user_id = ${receiver.id}`);
});

// BATCH INSERT
const rows = [
  { name: "Bob",   email: "bob@example.com",   age: 25 },
  { name: "Carol", email: "carol@example.com", age: 28 },
];
await db.executeBatch(
  sql`INSERT INTO users (name, email, age) VALUES (@name, @email, @age)`,
  rows,
);
```

---

### MySQL

```typescript
import { createConnection, MysqlAdapter, sql } from "@phonemyatt/squn";

// Connection string
const db = createConnection(new MysqlAdapter({
  url: "mysql://user:password@localhost:3306/mydb",
}));

// Individual fields
const db = createConnection(new MysqlAdapter({
  host:     "localhost",
  port:     3306,
  database: "mydb",
  user:     "user",
  password: "password",
}));

interface User {
  id: number;
  name: string;
  email: string;
  age: number | null;
}

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
const { rowsAffected } = await db.execute(
  sql`INSERT INTO users (name, email, age) VALUES (${"Alice"}, ${"alice@example.com"}, ${30})`
);

// SELECT — all rows
const users = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);

// SELECT — single row
const user = await db.querySingle<User>(sql`SELECT * FROM users WHERE email = ${"alice@example.com"}`);

// SELECT — first row or null
const maybe = await db.queryFirst<User>(sql`SELECT * FROM users WHERE id = ${99}`);

// SELECT — scalar value
const count = await db.queryScalar<number>(sql`SELECT COUNT(*) FROM users`);

// UPDATE
await db.execute(sql`UPDATE users SET age = ${31} WHERE id = ${user.id}`);

// DELETE
await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);

// TRANSACTION
await db.atomically(async (q) => {
  await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Bob"}, ${"bob@example.com"}, ${25})`);
  await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Carol"}, ${"carol@example.com"}, ${28})`);
});

// BATCH INSERT
const rows = [
  { name: "Bob",   email: "bob@example.com",   age: 25 },
  { name: "Carol", email: "carol@example.com", age: 28 },
];
await db.executeBatch(
  sql`INSERT INTO users (name, email, age) VALUES (@name, @email, @age)`,
  rows,
);
```

---

### MSSQL

```typescript
import { createConnection, MssqlAdapter, sql } from "@phonemyatt/squn";

// Connection string
const db = createConnection(new MssqlAdapter({
  url: "mssql://sa:Password123!@localhost:1433/mydb",
}));

// Individual fields
const db = createConnection(new MssqlAdapter({
  host:                   "localhost",
  port:                   1433,
  database:               "mydb",
  user:                   "sa",
  password:               "Password123!",
  encrypt:                true,   // required for Azure
  trustServerCertificate: true,   // set false in production
}));

interface User {
  id: number;
  name: string;
  email: string;
  age: number | null;
}

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

// INSERT with OUTPUT to get the new row back
const [newUser] = await db.query<User>(
  sql`INSERT INTO users (name, email, age) OUTPUT INSERTED.* VALUES (${"Alice"}, ${"alice@example.com"}, ${30})`
);

// SELECT — all rows
const users = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);

// SELECT — single row
const user = await db.querySingle<User>(sql`SELECT * FROM users WHERE email = ${"alice@example.com"}`);

// SELECT — first row or null
const maybe = await db.queryFirst<User>(sql`SELECT TOP 1 * FROM users WHERE id = ${99}`);

// SELECT — scalar value
const count = await db.queryScalar<number>(sql`SELECT COUNT(*) FROM users`);

// UPDATE
await db.execute(sql`UPDATE users SET age = ${31} WHERE id = ${user.id}`);

// DELETE
await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);

// TRANSACTION
await db.atomically(async (q) => {
  await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Bob"}, ${"bob@example.com"}, ${25})`);
  await q.execute(sql`INSERT INTO users (name, email, age) VALUES (${"Carol"}, ${"carol@example.com"}, ${28})`);
});

// BATCH INSERT
const rows = [
  { name: "Bob",   email: "bob@example.com",   age: 25 },
  { name: "Carol", email: "carol@example.com", age: 28 },
];
await db.executeBatch(
  sql`INSERT INTO users (name, email, age) VALUES (@name, @email, @age)`,
  rows,
);

// STORED PROCEDURE
const [results] = await db.queryMultiple(
  sql`EXEC GetUsersByRole ${"admin"}`
);
```

#### Azure SQL

```typescript
const db = createConnection(new MssqlAdapter({
  host:     "myserver.database.windows.net",
  database: "mydb",
  auth: {
    type:         "azure-ad",
    tenantId:     process.env.AZURE_TENANT_ID,
    clientId:     process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
  encrypt: true,
}));
```

---

## How it works

`createConnection` takes an adapter and returns a `Database` object. Every method on `Database` accepts a `SqlFragment` produced by the `sql` tag (or `sqlRaw` for literal SQL you control).

Values interpolated into `sql` become bound parameters — never concatenated into the SQL text. SQL injection is structurally impossible.

## Using environment variables

```typescript
const db = createConnection(new PostgresAdapter({
  url: process.env.DATABASE_URL,
}));
```

squn also reads these automatically if no config is provided:

| Variable          | Database   |
|-------------------|------------|
| `SQUN_PG_URL`     | PostgreSQL |
| `SQUN_MYSQL_URL`  | MySQL      |
| `SQUN_MSSQL_URL`  | MSSQL      |
| `SQUN_DB_FILE`    | SQLite     |

## Next steps

- [Adapters](/guide/adapters) — full adapter options reference
- [SQL Authoring](/guide/sql-authoring) — composing queries with `sql`, `sqlIf`, `sqlJoin`
- [Querying](/guide/querying) — `query`, `queryFirst`, `querySingle`, `stream`
- [Configuration](/guide/config) — pool, timeouts, logging, security
