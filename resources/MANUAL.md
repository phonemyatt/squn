# Squn — Reference Manual

**Version:** 0.1.0
**Runtime:** Bun >= 1.2

---

## Table of Contents

1. [Installation](#1-installation)
2. [Quick Start](#2-quick-start)
3. [Schema Definition](#3-schema-definition)
4. [SQL Authoring](#4-sql-authoring)
5. [Query Methods](#5-query-methods)
6. [Transactions](#6-transactions)
7. [PreparedQuery](#7-preparedquery)
8. [Configuration](#8-configuration)
9. [Adapters](#9-adapters)
10. [Error Handling](#10-error-handling)
11. [Logging](#11-logging)
12. [Multiple Connections](#12-multiple-connections)
13. [Class Mapping](#13-class-mapping)
14. [Readonly Support](#14-readonly-support)
15. [Security](#15-security)
16. [CLI Commands](#16-cli-commands)

---

## 1. Installation

```bash
bun add squn
```

Squn uses Bun's native drivers for SQLite, PostgreSQL, and MySQL. No additional driver packages needed for those three. MSSQL requires the `mssql` npm package (installed automatically as a dependency).

## 2. Quick Start

```typescript
import { createDb, sql, col, defineTable } from "squn";
import { SqliteAdapter } from "squn/adapters/sqlite";

// Define your schema
const Users = defineTable("users", {
  id: col.int().primaryKey().readonly(),
  name: col.nvarchar(100).notNull(),
  email: col.nvarchar(255).notNull(),
  age: col.int().nullable(),
});

// Create a database connection
const db = createDb(new SqliteAdapter({ file: "./app.db" }));

// Query with full type safety
const users = await db.query<User>(sql`SELECT * FROM users WHERE age >= ${18}`);

// Insert
await db.execute(
  sql`INSERT INTO users (name, email, age) VALUES (${"Alice"}, ${"alice@example.com"}, ${30})`,
);

// Transaction
await db.transaction(async (tx) => {
  await tx.execute("INSERT INTO orders ...", []);
  await tx.execute("UPDATE inventory ...", []);
});
```

## 3. Schema Definition

### defineTable()

```typescript
import { col, defineTable } from "squn";

const Users = defineTable("users", {
  id: col.int().primaryKey().readonly(),
  name: col.nvarchar(100).notNull(),
  email: col.nvarchar(255).notNull().unique(),
  age: col.int().nullable(),
  bio: col.text().nullable(),
  createdAt: col.datetime().notNull().readonly(),
  fullName: col.nvarchar(201).computed("firstName || ' ' || lastName"),
});
```

### Column Types

| Method            | TypeScript Type | Database Type      |
| ----------------- | --------------- | ------------------ |
| `col.int()`       | `number`        | INT                |
| `col.bigint()`    | `number`        | BIGINT             |
| `col.float()`     | `number`        | FLOAT              |
| `col.decimal()`   | `number`        | DECIMAL            |
| `col.boolean()`   | `boolean`       | BOOLEAN            |
| `col.text()`      | `string`        | TEXT               |
| `col.nvarchar(n)` | `string`        | NVARCHAR(n)        |
| `col.varchar(n)`  | `string`        | VARCHAR(n)         |
| `col.char(n)`     | `string`        | CHAR(n)            |
| `col.datetime()`  | `Date`          | DATETIME           |
| `col.date()`      | `Date`          | DATE               |
| `col.time()`      | `string`        | TIME               |
| `col.uuid()`      | `string`        | UUID               |
| `col.blob()`      | `Buffer`        | BLOB               |
| `col.json<T>()`   | `T`             | JSON               |
| `col.array<T>()`  | `T[]`           | ARRAY (PostgreSQL) |

### Column Modifiers

| Modifier          | Effect                                       |
| ----------------- | -------------------------------------------- |
| `.nullable()`     | Type becomes `T \| null`                     |
| `.notNull()`      | Type is `T` — null not permitted             |
| `.readonly()`     | Excluded from InferInsert and InferUpdate    |
| `.primaryKey()`   | Implies `.readonly()`                        |
| `.computed(expr)` | Always `.readonly()`                         |
| `.unique()`       | Documented constraint — no TypeScript effect |

### Type Inference

```typescript
import type { InferModel, InferInsert, InferUpdate } from "squn";

type User = InferModel<typeof Users>; // All fields, correct nullability
type UserInsert = InferInsert<typeof Users>; // Excludes id, createdAt, fullName
type UserUpdate = InferUpdate<typeof Users>; // All mutable fields optional
```

## 4. SQL Authoring

### Tagged Template

```typescript
import { sql } from "squn";

// Values become positional parameters — never concatenated
const users = await db.query<User>(
  sql`SELECT * FROM users WHERE active = ${true} AND age >= ${18}`,
);
// Generated: SELECT * FROM users WHERE active = $1 AND age >= $2
// Params:    [true, 18]
```

### Composition

```typescript
import { sql, sqlIf, sqlJoin, sqlRaw, sqlIdentifier } from "squn";

// Conditional fragments
const filter = sqlIf(showActive, sql`AND active = ${true}`);

// Join multiple fragments
const conditions = sqlJoin([sql`name = ${"Alice"}`, sql`age > ${18}`], " AND ");

// Dynamic identifiers (validated + quoted)
const col = sqlIdentifier("user_name"); // → "user_name"

// Raw SQL (audited — throws on injection patterns)
const order = sqlRaw("ORDER BY name ASC");
```

### Nested Fragments

```typescript
const where = sql`deleted_at IS NULL AND active = ${true}`;
const query = sql`SELECT * FROM users WHERE ${where} LIMIT ${10}`;
// Params are spliced correctly: [true, 10]
```

## 5. Query Methods

### db.query\<T\>() — zero or more rows

```typescript
const users = await db.query<User>(sql`SELECT * FROM users`);
// Returns: User[] — always an array, [] if empty
```

### db.queryFirst\<T\>() — optional single row

```typescript
const user = await db.queryFirst<User>(
  sql`SELECT * FROM users WHERE id = ${id}`,
);
// Returns: User | null
```

### db.querySingle\<T\>() — exactly one row

```typescript
const user = await db.querySingle<User>(
  sql`SELECT * FROM users WHERE id = ${id}`,
);
// Returns: User
// Throws: QueryError(NO_ROWS_FOUND) if 0 rows
// Throws: QueryError(MULTIPLE_ROWS_FOUND) if >1 rows
```

### db.queryScalar\<T\>() — single value

```typescript
const count = await db.queryScalar<number>(
  sql`SELECT COUNT(*) FROM users WHERE active = ${true}`,
);
// Returns: number — first column of first row
```

### db.execute() — write operations

```typescript
const result = await db.execute(
  sql`UPDATE users SET name = ${"Bob"} WHERE id = ${1}`,
);
// Returns: { rowsAffected: number }
```

### db.executeBatch() — bulk operations

```typescript
const result = await db.executeBatch(
  sql`INSERT INTO events (user_id, type) VALUES (@userId, @type)`,
  [
    { userId: 1, type: "login" },
    { userId: 2, type: "logout" },
  ],
);
// Returns: { rowsAffected: 2 }
```

### db.stream\<T\>() — streaming cursor

```typescript
for await (const user of db.stream<User>(sql`SELECT * FROM users`)) {
  console.log(user.name);
}
```

## 6. Transactions

### Basic Transaction

```typescript
await db.transaction(async (tx) => {
  await tx.execute("INSERT INTO orders ...", []);
  await tx.execute("UPDATE inventory ...", []);
  // Auto-commits on success, auto-rolls back on throw
});
```

### Savepoints

```typescript
await db.transaction(async (tx) => {
  await tx.execute("INSERT INTO audit_log ...", []);

  const sp = await tx.savepoint();
  try {
    await tx.execute("INSERT INTO risky_table ...", []);
  } catch {
    await sp.rollback(); // Only this insert is rolled back
  }
  // audit_log insert survives
});
```

### Atomic Blocks

```typescript
// Simpler API — no manual commit/rollback
const result = await db.atomically(async (q) => {
  await q.execute("INSERT INTO orders ...", []);
  const rows = await q.query("SELECT * FROM orders WHERE ...", []);
  return rows[0];
});
```

## 7. PreparedQuery

Compile a query once, execute it many times with zero per-call overhead.

```typescript
// Compile once at startup
const findUser = db.prepare<User, { id: number }>(
  sql`SELECT * FROM users WHERE id = ${0}`,
  ["id"],
);

// Hot path — only param binding + adapter call
const user = await findUser.first({ id: 42 });
const users = await findUser.all({ id: 42 });
const count = await findUser.scalar({ id: 42 });
const result = await findUser.execute({ id: 42 });
```

## 8. Configuration

### Environment Detection

```
Explicit env arg → BUN_ENV → NODE_ENV → "development"
```

### Presets

| Setting        | Development      | Production        | Test     |
| -------------- | ---------------- | ----------------- | -------- |
| Logger         | console (pretty) | JSON (structured) | silent   |
| Log level      | debug            | warn              | fatal    |
| Pool min/max   | 1/5              | 5/20              | 1/1      |
| Query timeout  | 60s              | 30s               | 5s       |
| Cache size     | 100              | 1000              | disabled |
| Mask sensitive | false            | true              | false    |

### Custom Config

```typescript
const db = createDb(new PostgresAdapter({ url: "..." }), {
  pool: { max: 50 },
  timeout: { query: 10_000 },
  cache: { maxSize: 5_000 },
  log: { level: "info" },
});
```

### Environment Variables

All configuration can be set via `SQUN_*` environment variables:

```bash
SQUN_ENV=production
SQUN_PG_URL=postgresql://user:pass@host:5432/db
SQUN_PG_SSL=require
SQUN_POOL_MAX=20
SQUN_TIMEOUT_QUERY=30000
SQUN_LOG_LEVEL=warn
SQUN_CACHE_MAX_SIZE=1000
```

## 9. Adapters

### SQLite

```typescript
import { SqliteAdapter } from "squn/adapters/sqlite";

const adapter = new SqliteAdapter({ file: ":memory:" });
// Or: new SqliteAdapter({ file: "./data.db" })
```

### PostgreSQL

```typescript
import { PostgresAdapter } from "squn/adapters/postgres";

const adapter = new PostgresAdapter({
  url: "postgresql://user:pass@localhost:5432/mydb",
});
// Uses Bun.SQL — native, no npm package needed
```

### MySQL

```typescript
import { MysqlAdapter } from "squn/adapters/mysql";

const adapter = new MysqlAdapter({
  url: "mysql://user:pass@localhost:3306/mydb",
});
// Uses Bun.SQL — native, no npm package needed
```

### MSSQL

```typescript
import { MssqlAdapter } from "squn/adapters/mssql";

const adapter = new MssqlAdapter({
  host: "localhost",
  port: 1433,
  database: "mydb",
  user: "sa",
  password: "Password123!",
  trustServerCertificate: true,
});
```

## 10. Error Handling

Every error is a typed `SqunError` subclass with a code, context, and traceId.

```typescript
import { QueryError, ErrorCode } from "squn";

try {
  await db.querySingle<User>(sql`SELECT * FROM users WHERE id = ${999}`);
} catch (err) {
  if (err instanceof QueryError) {
    console.log(err.code); // "SQUN_QUERY_003"
    console.log(err.context); // { operation: "querySingle", sql: "..." }
    console.log(err.traceId); // UUID for log correlation
  }
}
```

### Error Classes

| Class              | Codes                | When                                            |
| ------------------ | -------------------- | ----------------------------------------------- |
| `ConnectionError`  | SQUN_CONN_001–005    | Connection lookup, failover                     |
| `QueryError`       | SQUN_QUERY_001–004   | Query execution, no rows, multiple rows         |
| `MappingError`     | SQUN_MAP_001–003     | Null violation, unknown column, type conversion |
| `ValidationError`  | SQUN_VAL_001–004     | Missing/extra params, TVP schema                |
| `TransactionError` | SQUN_TX_001–003      | Commit/rollback failed, already closed          |
| `TimeoutError`     | SQUN_TIMEOUT_001–004 | Query, transaction, connect, acquire            |
| `SecurityError`    | SQUN_SEC_001–007     | Injection, invalid identifier                   |
| `SqunConfigError`  | SQUN_CFG_001–005     | Missing config, production guard                |
| `AuthError`        | SQUN_AUTH_001–005    | Invalid credentials, missing auth               |

## 11. Logging

```typescript
import { consoleLogger, jsonLogger, noopLogger } from "squn";

// Development — colorized pretty output
const db = createDb(adapter, {
  log: { logger: consoleLogger, level: "debug" },
});

// Production — structured JSON (pino-compatible)
const db = createDb(adapter, { log: { logger: jsonLogger, level: "warn" } });

// Tests — silent
const db = createDb(adapter, { log: { logger: noopLogger } });
```

## 12. Multiple Connections

```typescript
import { createConnections } from "squn";

const db = createConnections({
  connections: {
    primary: new PostgresAdapter({ url: "..." }),
    replica: new PostgresAdapter({ url: "..." }),
  },
  default: "primary",
});

// Named access
const user = db.registry.get("replica");
```

## 13. Class Mapping

### Explicit Mapper

```typescript
import { defineMapper } from "squn";

class UserModel {
  constructor(
    public id: number,
    public name: string,
  ) {}
  getInitials() {
    return this.name
      .split(" ")
      .map((w) => w[0])
      .join("");
  }
}

defineMapper(UserModel, Users, (row) => new UserModel(row.id, row.name));
```

### @Entity Decorator

```typescript
import { Entity } from "squn";

@Entity(Users)
class UserModel {
  id!: number;
  name!: string;
  getInitials() {
    return this.name
      .split(" ")
      .map((w) => w[0])
      .join("");
  }
}
```

## 14. Readonly Support

```typescript
import { assertWritable, Readonly } from "squn";

// @Readonly decorator — Object.freeze() at runtime
@Readonly()
class FrozenUser {
  constructor(
    public id: number,
    public name: string,
  ) {}
}

// Connection-level readonly
const replica = createDb(adapter, { readonly: true });
// Write operations throw ReadonlyViolationError
```

## 15. Security

Squn provides five defence layers:

1. **Parameterization** — `sql` tag never concatenates values
2. **Type validation** — Schema-aware on insert/update
3. **Identifier sanitization** — `sqlIdentifier()` validates + quotes
4. **sqlRaw() audit** — Throws on injection patterns
5. **Injection detection** — 12 regex patterns, 4 severity levels

Passwords are never logged. `maskConnectionString()` strips credentials from URLs and connection strings.

## 16. CLI Commands

```bash
bun test                    # Run all tests
bun test <path>             # Run one test file
bun test --coverage         # Run with coverage
bun run typecheck           # tsc --noEmit
bun run lint                # biome ci src tests
bun run lint:fix            # biome check --write src tests
bun run ci                  # typecheck + lint + test:cov
bun run build               # Build to dist/
```
