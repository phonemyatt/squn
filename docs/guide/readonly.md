# Readonly Mode

squn lets you mark a database connection as readonly at the application level. A readonly connection accepts `query()` and `queryFirst()` / `querySingle()` / `queryScalar()` calls normally, but throws `SecurityError` (`ErrorCode.READONLY_VIOLATION`) the moment any write operation is attempted — before the SQL even reaches the adapter.

This makes it safe to pass a connection to untrusted or uncertain code and enforce the read-only contract at the type system level.

## Wrapping a connection as readonly

```typescript
import { createConnection, Readonly, PostgresAdapter, sql } from "@phonemyatt/squn";

const db = Readonly(
  createConnection(new PostgresAdapter({ url: process.env.REPLICA_URL })),
);

// Reads work fine
const users = await db.query<User>(sql`SELECT * FROM users`);

// Writes throw SecurityError before reaching the adapter
await db.execute(sql`DELETE FROM users`); // throws SecurityError
```

`Readonly()` wraps the connection in a proxy that intercepts write methods. The returned type is `ReadonlyDatabase` — a narrowed type that removes `execute`, `executeBatch`, and the write overloads of `transaction` from the interface, catching mistakes at compile time.

## Guarding a function with `assertWritable`

Use `assertWritable` to enforce that a function only runs against a writable connection. If the connection is readonly, it throws `SecurityError` immediately:

```typescript
import { assertWritable, type Database } from "@phonemyatt/squn";

function dangerousOp(db: Database) {
  assertWritable(db); // throws SecurityError if db is readonly
  return db.execute(sql`TRUNCATE users`);
}
```

This is useful when you accept a `Database` parameter generically and need to assert writability before proceeding, rather than relying only on the caller to pass the right connection.

## Readonly replica with primary/replica routing

For production read-replica setups, combine `createConnections` with `createRouter` to route reads and writes to the correct connection automatically:

```typescript
import {
  createConnection,
  createConnections,
  createRouter,
  PostgresAdapter,
} from "@phonemyatt/squn";

const config = createRouter({
  write: new PostgresAdapter({ url: process.env.PRIMARY_URL }),
  read:  new PostgresAdapter({ url: process.env.REPLICA_URL }),
});

const db = createConnections(config);

// db.query() uses the read (replica) connection by default
const users = await db.query<User>(sql`SELECT * FROM users`);

// db.execute() uses the write (primary) connection
await db.execute(sql`INSERT INTO users (name) VALUES (${"Alice"})`);

// Explicit override — force a read to go to the replica
const count = await db.queryScalar<number>(
  sql`SELECT COUNT(*) FROM users`,
  { connection: "replica" },
);
```

`createRouter` returns a `ConnectionsConfig` shaped for `createConnections`. It sets the `"write"` key as the default connection so that un-annotated `execute` calls go to primary, and the `"read"` key as the default for `query` calls.

## Using `.use()` to scope a replica connection

If you want a fully scoped readonly handle without modifying connection routing, scope a `createConnections` instance to the replica key and wrap it with `Readonly`:

```typescript
import { createConnections, Readonly, PostgresAdapter } from "@phonemyatt/squn";

const connections = createConnections({
  connections: {
    primary: new PostgresAdapter({ url: process.env.PRIMARY_URL }),
    replica: new PostgresAdapter({ url: process.env.REPLICA_URL }),
  },
  default: "primary",
});

// A handle scoped to the replica — write operations throw SecurityError
const replicaDb = Readonly(connections.use("replica"));

export async function getUsers(): Promise<User[]> {
  return replicaDb.query<User>(sql`SELECT * FROM users`);
}
```

## TypeScript types

| Symbol             | Description                                            |
|--------------------|--------------------------------------------------------|
| `Readonly(db)`     | Wraps `Database` and returns `ReadonlyDatabase`        |
| `ReadonlyDatabase` | Narrowed interface — write methods are absent          |
| `assertWritable`   | Throws `SecurityError` at runtime if `db` is readonly  |
| `createRouter`     | Builds a `ConnectionsConfig` for read/write split      |

## Error thrown on violation

```typescript
import { SecurityError, ErrorCode } from "@phonemyatt/squn";

try {
  await readonlyDb.execute(sql`DROP TABLE users`);
} catch (err) {
  if (err instanceof SecurityError && err.code === ErrorCode.READONLY_VIOLATION) {
    console.error("Attempted write on readonly connection");
  }
}
```
