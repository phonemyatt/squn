# Adapters

squn supports four databases through a unified `IDbAdapter` interface.

| Database   | Adapter           | Driver              |
|------------|-------------------|---------------------|
| SQLite     | `SqliteAdapter`   | `bun:sqlite` (built-in) |
| PostgreSQL | `PostgresAdapter` | Bun native Postgres |
| MySQL      | `MysqlAdapter`    | Bun native MySQL    |
| MSSQL      | `MssqlAdapter`    | `mssql` npm package |

## SQLite

```typescript
import { createConnection, SqliteAdapter } from "@phonemyatt/squn";

const db = createConnection(new SqliteAdapter({ filename: "app.db" }));
// or in-memory:
const db = createConnection(new SqliteAdapter({ filename: ":memory:" }));
```

SQLite uses Bun's built-in `bun:sqlite` — no extra dependencies.

## PostgreSQL

```typescript
import { createConnection, PostgresAdapter } from "@phonemyatt/squn";

const db = createConnection(new PostgresAdapter({
  url: "postgresql://user:password@localhost:5432/mydb",
}));
```

Uses Bun's native Postgres client (`Bun.sql`). No `pg` package needed.

## MySQL

```typescript
import { createConnection, MysqlAdapter } from "@phonemyatt/squn";

const db = createConnection(new MysqlAdapter({
  url: "mysql://user:password@localhost:3306/mydb",
}));
```

Uses Bun's native MySQL client. No `mysql2` package needed.

## MSSQL

```typescript
import { createConnection, MssqlAdapter } from "@phonemyatt/squn";

const db = createConnection(new MssqlAdapter({
  url: "mssql://sa:Password123!@localhost:1433/mydb",
}));
```

Uses the `mssql` npm package. Install it separately:

```bash
bun add mssql
```

### Azure AD authentication

```typescript
const db = createConnection(new MssqlAdapter({
  url: "mssql://myserver.database.windows.net/mydb",
  auth: {
    type: "azure-ad",
    tenantId: "...",
    clientId: "...",
    clientSecret: "...",
  },
}));
```

## Switching adapters

All four adapters implement `IDbAdapter`. Your query code never changes when you switch databases — only the adapter construction changes.

```typescript
const adapter =
  process.env.DB === "postgres"
    ? new PostgresAdapter({ url: process.env.PG_URL! })
    : new SqliteAdapter({ filename: ":memory:" });

const db = createConnection(adapter);
// All db.query(), db.execute(), etc. work identically
```
