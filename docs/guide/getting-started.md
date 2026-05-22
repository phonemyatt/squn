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
import { createDb, SqliteAdapter, sql } from "@phonemyatt/squn";

const db = createDb(new SqliteAdapter({ filename: "app.db" }));
// or in-memory:
const db = createDb(new SqliteAdapter({ filename: ":memory:" }));

interface User {
  id: number;
  name: string;
  age: number | null;
}

const users = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);
```

### PostgreSQL

```typescript
import { createDb, PostgresAdapter, sql } from "@phonemyatt/squn";

// Connection string
const db = createDb(new PostgresAdapter({
  url: "postgresql://user:password@localhost:5432/mydb",
}));

// Individual fields
const db = createDb(new PostgresAdapter({
  host:     "localhost",
  port:     5432,
  database: "mydb",
  user:     "user",
  password: "password",
}));

const users = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);
```

### MySQL

```typescript
import { createDb, MysqlAdapter, sql } from "@phonemyatt/squn";

// Connection string
const db = createDb(new MysqlAdapter({
  url: "mysql://user:password@localhost:3306/mydb",
}));

// Individual fields
const db = createDb(new MysqlAdapter({
  host:     "localhost",
  port:     3306,
  database: "mydb",
  user:     "user",
  password: "password",
}));

const users = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);
```

### MSSQL

```typescript
import { createDb, MssqlAdapter, sql } from "@phonemyatt/squn";

// Connection string
const db = createDb(new MssqlAdapter({
  url: "mssql://sa:Password123!@localhost:1433/mydb",
}));

// Individual fields
const db = createDb(new MssqlAdapter({
  host:     "localhost",
  port:     1433,
  database: "mydb",
  user:     "sa",
  password: "Password123!",
  encrypt:                true,   // required for Azure
  trustServerCertificate: true,   // set false in production
}));

const users = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);
```

#### Azure SQL

```typescript
const db = createDb(new MssqlAdapter({
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

## How it works

`createDb` takes an adapter and returns a `Db` object. Every method on `Db` accepts a `SqlFragment` produced by the `sql` tag (or `sqlRaw` for literal SQL you control).

Values interpolated into `sql` become bound parameters — never concatenated into the SQL text. SQL injection is structurally impossible.

## Using environment variables

```typescript
const db = createDb(new PostgresAdapter({
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
