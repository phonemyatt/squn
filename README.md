# squn

Type-safe SQL query library for [Bun](https://bun.sh). Supports SQLite, PostgreSQL, MySQL, and MSSQL with a unified API, no codegen, and zero magic.

## Install

```bash
bun add squn
```

## Adapters

| Database   | Adapter           | Driver              |
|------------|-------------------|---------------------|
| SQLite     | `SqliteAdapter`   | `bun:sqlite` (built-in) |
| PostgreSQL | `PostgresAdapter` | Bun's native Postgres |
| MySQL      | `MysqlAdapter`    | Bun's native MySQL  |
| MSSQL      | `MssqlAdapter`    | `mssql` npm package |

## Quick start

```typescript
import { createDb, SqliteAdapter, sql } from "squn";

const adapter = new SqliteAdapter({ filename: ":memory:" });
const db = createDb(adapter);

interface User { id: number; name: string; age: number | null; }

// Tagged template — values become $1, $2 params automatically
const users = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);
```

## SQL authoring

### `sql` tag

Interpolated values become positional `$N` params. Nested fragments merge inline with renumbered placeholders. Never concatenates user input into SQL text.

```typescript
import { sql, sqlRaw, sqlIdentifier, sqlIf, sqlJoin } from "squn";

// Scalar params
const q = sql`SELECT * FROM users WHERE id = ${userId}`;

// Nested fragment composition
const filter = sql`age > ${18}`;
const q2 = sql`SELECT * FROM users WHERE ${filter} ORDER BY name`;

// Hardcoded SQL (no params — safe for DDL or literals you control)
const ddl = sqlRaw("CREATE TABLE IF NOT EXISTS logs (id SERIAL PRIMARY KEY)");

// Safe identifier quoting
const col = sqlIdentifier("user_name");          // "user_name"
const fqn = sqlQualifiedIdentifier("public", "users");  // "public"."users"

// Conditional fragment
const clause = sqlIf(isAdmin, sql`AND role = ${"admin"}`);

// Join fragments with separator
const cols = sqlJoin([sql`id`, sql`name`, sql`age`], ", ");
```

### `sqlRaw`

Use for DDL, literals, or any SQL text where you control every character. Does not bind params — do not pass user input here.

## Core API

All methods accept a `SqlFragment` (from `sql` or `sqlRaw`).

### Queries

```typescript
// All rows
const users = await db.query<User>(sql`SELECT * FROM users`);

// First row or null
const user = await db.queryFirst<User>(sql`SELECT * FROM users WHERE id = ${1}`);

// Exactly one row — throws if 0 or 2+
const user = await db.querySingle<User>(sql`SELECT * FROM users WHERE id = ${1}`);

// First column of first row
const count = await db.queryScalar<number>(sql`SELECT COUNT(*) FROM users`);

// Multiple result sets (e.g. MSSQL stored procs)
const [users, roles] = await db.queryMultiple(sqlRaw("EXEC GetUsersAndRoles"));
```

### Execute

```typescript
// Single statement
const { rowsAffected } = await db.execute(
  sql`UPDATE users SET active = ${true} WHERE id = ${userId}`
);

// Batch — same SQL, many rows (uses prepared statement internally)
const { rowsAffected } = await db.executeBatch(
  sqlRaw("INSERT INTO users (name, age) VALUES (@name, @age)"),
  [
    { name: "Alice", age: 30 },
    { name: "Bob",   age: 25 },
  ]
);
```

### Streaming

```typescript
// Iterates rows in batches — does not load all rows into memory
for await (const user of db.stream<User>(sql`SELECT * FROM users`, 100)) {
  process(user);
}
```

### Transactions

```typescript
// Automatic commit/rollback wrapper
await db.transaction(async (tx) => {
  await tx.execute(sql`INSERT INTO orders (user_id) VALUES (${userId})`);
  await tx.execute(sql`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${accountId}`);
  // commits on success, rolls back on throw
});

// Atomic block — same guarantees, simpler API for one-off operations
await db.atomically(async (ex) => {
  await ex.execute(sql`DELETE FROM sessions WHERE expires_at < ${now}`);
});
```

#### Savepoints

```typescript
import { Savepoint } from "squn";

await db.transaction(async (tx) => {
  await tx.execute(sql`INSERT INTO audit_log (event) VALUES (${"start"})`);

  const sp = new Savepoint(tx, "before_payment");
  await sp.create();
  try {
    await tx.execute(sql`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${id}`);
    await sp.release();
  } catch {
    await sp.rollback(); // unwinds to savepoint, transaction stays open
  }
});
```

#### Isolation level

```typescript
import { IsolationLevel } from "squn";

const tx = await adapter.beginTransaction({ isolationLevel: IsolationLevel.SERIALIZABLE });
```

#### Deadlock retry

```typescript
import { retryWithDeadlockBackoff } from "squn";

await retryWithDeadlockBackoff(() => db.transaction(async (tx) => {
  // ...
}), { maxRetries: 3 });
```

## Prepared queries

Parse and validate once, bind cheaply on every call.

```typescript
import { prepare, sql } from "squn";

const findByAge = prepare<User, { minAge: number }>(
  adapter,
  sql`SELECT * FROM users WHERE age >= ${0}`,
  ["minAge"]
);

const adults = await findByAge.query({ minAge: 18 });
const seniors = await findByAge.query({ minAge: 65 });
```

## Query builder

```typescript
import { queryBuilder } from "squn";

const { fragment } = queryBuilder("users")
  .select("id", "name", "age")
  .where(sql`active = ${true}`)
  .whereIf(minAge !== undefined, sql`age >= ${minAge ?? 0}`)
  .orderBy("name", "ASC")
  .paginate(page, pageSize)
  .build();

const users = await db.query<User>(fragment);
```

## Multi-connection

```typescript
import { createConnections, PostgresAdapter, MysqlAdapter } from "squn";

const db = createConnections({
  connections: {
    primary: new PostgresAdapter({ url: process.env.PG_PRIMARY_URL }),
    replica: new PostgresAdapter({ url: process.env.PG_REPLICA_URL }),
    analytics: new MysqlAdapter({ url: process.env.MYSQL_URL }),
  },
  default: "primary",
});

// Routes to default connection
const users = await db.query<User>(sql`SELECT * FROM users`);

// Explicit connection
const stats = await db.query<Stat>(sql`SELECT * FROM stats`, { connection: "analytics" });

// Scoped helper — all calls on one connection
const replica = db.use("replica");
const rows = await replica.query<User>(sql`SELECT * FROM users`);

// Concurrent queries — typed Promise.all
const [users, roles] = await db.concurrent(
  db.query<User>(sql`SELECT * FROM users`),
  db.query<Role>(sql`SELECT * FROM roles`),
);
```

## Error handling

All adapter errors are wrapped as `SqunError` subclasses with structured context.

```typescript
import { SqunError, QueryError, TransactionError, ErrorCode } from "squn";

try {
  await db.query(sql`SELECT * FROM nonexistent`);
} catch (err) {
  if (err instanceof SqunError) {
    console.log(err.context.adapter);  // "postgres" | "mysql" | "mssql" | "sqlite"
    console.log(err.context.sql);      // the SQL that failed
    console.log(err.code);             // ErrorCode enum value
  }
}
```

Error types: `QueryError`, `TransactionError`, `ConnectionError`, `ValidationError`, `SecurityError`, `TimeoutError`, `AuthError`, `MappingError`, `AdapterError`, `SqunConfigError`.

## Timeout

```typescript
import { withTimeout } from "squn";

const result = await withTimeout(
  db.query<User>(sql`SELECT * FROM users`),
  5_000  // ms
);
```

## Logging

```typescript
import { createDb, SqliteAdapter, consoleLogger, jsonLogger } from "squn";

const db = createDb(adapter, {
  log: { logger: consoleLogger },
});
```

Implement `SqunLogger` to integrate with any logging system. Use `noopLogger` to silence all output.

## SQL utilities

```typescript
import { validateSql, detectInjection, formatSql } from "squn";

validateSql(sql`SELECT id FROM users WHERE id = ${1}`);  // throws ValidationError if malformed
detectInjection("admin' OR 1=1 --");                     // throws SecurityError
formatSql(sql`SELECT * FROM users`);                     // pretty-prints the SQL text
```

## Adapter construction

```typescript
// SQLite
new SqliteAdapter({ filename: ":memory:" })
new SqliteAdapter({ filename: "./data.db" })

// PostgreSQL
new PostgresAdapter({ url: "postgresql://user:pass@localhost:5432/mydb" })

// MySQL
new MysqlAdapter({ url: "mysql://root:pass@localhost:3306/mydb" })

// MSSQL
new MssqlAdapter({
  host: "localhost",
  port: 1433,
  database: "master",
  user: "sa",
  password: "Password123!",
  encrypt: false,
  trustServerCertificate: true,
})
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

### Integration tests

Requires Docker (starts postgres, mysql, mssql automatically):

```bash
bun run test:integration
```

## Release

Uses [changelogen](https://github.com/unjs/changelogen) with conventional commits:

```bash
bunx changelogen --release   # bumps version, generates CHANGELOG, creates git tag
git push origin v0.x.0       # triggers publish.yml → npm publish
```
