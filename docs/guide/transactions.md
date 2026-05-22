# Transactions

## `db.atomically` — recommended

The simplest way to run a transaction. Wraps your callback in BEGIN/COMMIT, rolls back automatically on error:

```typescript
await db.atomically(async (q) => {
  await q.execute(sql`UPDATE accounts SET balance = balance - ${100} WHERE id = ${from}`);
  await q.execute(sql`UPDATE accounts SET balance = balance + ${100} WHERE id = ${to}`);
});
```

The `q` executor exposes the same query/execute API as `Db`. Nesting `atomically` inside another `atomically` throws `AtomicNestingError`.

### Retry on connection error

```typescript
await db.atomically(
  async (q) => { /* ... */ },
  { retryOnError: true, maxRetries: 3, retryDelayMs: 100 },
);
```

Only `ConnectionError` is retried — never `QueryError` or `MappingError`.

## `db.transaction` — manual control

For full control over commit/rollback timing:

```typescript
await db.transaction(async (tx) => {
  const user = await tx.query(sql`SELECT * FROM users WHERE id = ${1}`);
  await tx.execute(sql`UPDATE users SET last_login = NOW() WHERE id = ${1}`);
  // tx commits automatically when the callback returns
  // tx rolls back automatically on throw
});
```

## `Transaction` class

For explicit state management:

```typescript
const dbTx = await adapter.beginTransaction();
const tx = new Transaction(dbTx);

try {
  await tx.execute(sql`...`);
  await tx.commit();
} catch {
  await tx.rollback();
}
```

### `await using` (automatic cleanup)

`Transaction` implements `Symbol.asyncDispose` — if it's still ACTIVE when disposed, it rolls back automatically:

```typescript
await using tx = new Transaction(await adapter.beginTransaction());
await tx.execute(sql`UPDATE users SET active = ${false} WHERE id = ${42}`);
await tx.commit();
// if commit throws or you return early, rollback happens automatically
```

## Savepoints

```typescript
await db.transaction(async (tx) => {
  await tx.execute(sql`INSERT INTO orders ...`);

  const sp = await tx.savepoint();
  try {
    await tx.execute(sql`INSERT INTO order_items ...`);
  } catch {
    await sp.rollback(); // roll back to savepoint, not the whole transaction
  }
  await sp.release();
});
```

## Deadlock retry

```typescript
import { retryWithDeadlockBackoff } from "@phonemyatt/squn";

const result = await retryWithDeadlockBackoff(
  () => db.atomically(async (q) => { /* ... */ }),
  "postgres",
  { maxRetries: 5, baseDelayMs: 50, maxDelayMs: 2_000 },
);
```

Detects adapter-specific deadlock codes (MSSQL 1205, PostgreSQL 40P01, MySQL 1213, SQLite SQLITE_BUSY) and retries with exponential backoff + jitter.

## Isolation levels

```typescript
import { IsolationLevel } from "@phonemyatt/squn";

// Set isolation at the adapter level before beginning
adapter.setIsolationLevel(IsolationLevel.SERIALIZABLE);
```
