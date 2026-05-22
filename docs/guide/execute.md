# Execute & Batch

## `execute` — single write

Returns `{ rowsAffected: number }`:

```typescript
const { rowsAffected } = await db.execute(
  sql`UPDATE users SET active = ${false} WHERE id = ${42}`
);
```

## `insert` / `update`

Convenience wrappers around `execute`:

```typescript
import { insert, update } from "squn";

await insert(adapter, sql`INSERT INTO users (name, age) VALUES (${"Alice"}, ${30})`);
await update(adapter, sql`UPDATE users SET age = ${31} WHERE id = ${1}`);
```

## `executeBatch` — batch writes

Executes the same statement for each row in an array. Uses a single prepared statement:

```typescript
const rows = [
  { name: "Alice", age: 30 },
  { name: "Bob",   age: 25 },
  { name: "Carol", age: 35 },
];

const { rowsAffected } = await db.executeBatch(
  sql`INSERT INTO users (name, age) VALUES (@name, @age)`,
  rows,
);
// rowsAffected === 3
```

### Batch strategies

For large datasets, specify a strategy:

```typescript
await db.executeBatch(fragment, rows, { strategy: "copy" });       // PostgreSQL COPY
await db.executeBatch(fragment, rows, { strategy: "bulk-load" });  // MSSQL BULK INSERT
await db.executeBatch(fragment, rows, { strategy: "prepared-loop" }); // default
```

## Named parameters

`executeBatch` uses `@name` style placeholders that map to row object keys:

```typescript
const fragment = sql`INSERT INTO orders (user_id, amount) VALUES (@userId, @amount)`;
const rows = [
  { userId: 1, amount: 99.99 },
  { userId: 2, amount: 149.50 },
];

await db.executeBatch(fragment, rows);
```
