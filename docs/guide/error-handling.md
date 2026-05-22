# Error Handling

All errors thrown by squn are instances of `SqunError`, a subclass of the built-in `Error`. Every `SqunError` carries a structured `context` object and a typed `code` from the `ErrorCode` enum, making it straightforward to handle specific failure modes without string-matching error messages.

## Basic pattern

```typescript
import { SqunError, ErrorCode } from "@phonemyatt/squn";

try {
  await db.query(sql`SELECT * FROM nonexistent`);
} catch (err) {
  if (err instanceof SqunError) {
    console.log(err.code);             // ErrorCode enum value
    console.log(err.context.adapter);  // "sqlite" | "postgres" | "mysql" | "mssql"
    console.log(err.context.sql);      // the SQL string that failed
    console.log(err.message);          // human-readable description
  }
}
```

## Checking a specific error code

```typescript
import { SqunError, ErrorCode } from "@phonemyatt/squn";

try {
  await db.execute(sql`INSERT INTO locked_table VALUES (1)`);
} catch (err) {
  if (err instanceof SqunError && err.code === ErrorCode.QUERY_FAILED) {
    // Handle query-level failure specifically
  }
}
```

## Error subclasses

squn exports a subclass for every failure category. Prefer checking the subclass over `err.code` when you only care about the category:

```typescript
import {
  SqunError,
  ErrorCode,
  QueryError,
  TransactionError,
  ConnectionError,
  ValidationError,
  SecurityError,
  TimeoutError,
  MappingError,
} from "@phonemyatt/squn";
```

### `QueryError`

Thrown when a `SELECT`, `INSERT`, `UPDATE`, or `DELETE` statement fails at the database level (syntax error, constraint violation, missing table, etc.).

```typescript
try {
  await db.execute(sql`INSERT INTO users (id) VALUES (${existingId})`);
} catch (err) {
  if (err instanceof QueryError) {
    // err.context.sql  — the failing statement
    // err.context.adapter — which adapter reported the error
    console.error("Query failed:", err.message);
  }
}
```

### `TransactionError`

Thrown when a `BEGIN`, `COMMIT`, or `ROLLBACK` fails, or when a transaction callback throws and squn cannot roll back cleanly.

```typescript
try {
  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${fromId}`);
    await tx.execute(sql`UPDATE accounts SET balance = balance + ${amount} WHERE id = ${toId}`);
  });
} catch (err) {
  if (err instanceof TransactionError) {
    console.error("Transaction failed:", err.message);
  }
}
```

### `ConnectionError`

Thrown when an adapter cannot establish or maintain a connection. Used by `FailoverGroup` as the signal to try the next adapter.

```typescript
try {
  const db = createConnection(new PostgresAdapter({ url: process.env.DATABASE_URL }));
  await db.query(sql`SELECT 1`);
} catch (err) {
  if (err instanceof ConnectionError) {
    // err.context.adapter — which adapter failed to connect
    console.error("Cannot reach database:", err.message);
  }
}
```

### `ValidationError`

Thrown when input data fails schema validation before hitting the database — for example, when a TVP row object is missing a required column, or when a mapper receives a shape it does not recognise.

```typescript
try {
  await db.execute(sql`EXEC BulkInsertUsers ${tvp(UserTvp, badRows)}`);
} catch (err) {
  if (err instanceof ValidationError) {
    console.error("Invalid input:", err.message);
  }
}
```

### `SecurityError`

Thrown when an operation is blocked by security configuration — for example, a write on a readonly connection, or a DDL statement when only `"SELECT"` is in `allowedOperations`.

```typescript
try {
  await readonlyDb.execute(sql`DELETE FROM users`);
} catch (err) {
  if (err instanceof SecurityError) {
    // err.code — e.g. ErrorCode.READONLY_VIOLATION or ErrorCode.OPERATION_NOT_ALLOWED
    console.error("Blocked by security policy:", err.message);
  }
}
```

### `TimeoutError`

Thrown when a query or transaction exceeds its configured timeout (see [Configuration](/guide/config)).

```typescript
try {
  await db.query(sql`SELECT * FROM huge_table`);
} catch (err) {
  if (err instanceof TimeoutError) {
    // err.context.timeoutMs — the limit that was exceeded
    console.error("Query timed out after", err.context.timeoutMs, "ms");
  }
}
```

### `MappingError`

Thrown by the mapper layer when a raw database row does not conform to the expected output shape — for example, a required field is absent or has the wrong type.

```typescript
try {
  const users = await db.query<User>(sql`SELECT id, name FROM users`, {
    mapper: strictUserMapper,
  });
} catch (err) {
  if (err instanceof MappingError) {
    // err.context.row — the raw row that failed mapping
    console.error("Mapper rejected row:", err.message);
  }
}
```

## Full imports reference

```typescript
import {
  SqunError,
  ErrorCode,
  QueryError,
  TransactionError,
  ConnectionError,
  ValidationError,
  SecurityError,
  TimeoutError,
  MappingError,
} from "@phonemyatt/squn";
```

## `ErrorCode` reference

`ErrorCode` is a TypeScript enum. All values are available on the imported object:

| `ErrorCode` value            | Thrown by              |
|------------------------------|------------------------|
| `QUERY_FAILED`               | `QueryError`           |
| `TRANSACTION_FAILED`         | `TransactionError`     |
| `CONNECTION_FAILED`          | `ConnectionError`      |
| `VALIDATION_FAILED`          | `ValidationError`      |
| `READONLY_VIOLATION`         | `SecurityError`        |
| `OPERATION_NOT_ALLOWED`      | `SecurityError`        |
| `QUERY_TIMEOUT`              | `TimeoutError`         |
| `TRANSACTION_TIMEOUT`        | `TimeoutError`         |
| `MAPPING_FAILED`             | `MappingError`         |

## Re-throwing unknown errors

Always re-throw errors that are not `SqunError` — they may be programming errors or unexpected runtime failures that should not be silently swallowed:

```typescript
try {
  await db.query(sql`SELECT * FROM users`);
} catch (err) {
  if (err instanceof SqunError) {
    handleDbError(err);
  } else {
    throw err; // not a squn error — re-throw
  }
}
```
