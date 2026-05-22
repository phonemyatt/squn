# Prepared Queries

`PreparedQuery` parses, validates, and normalises a query once at startup. Each invocation only fills a pre-allocated param buffer and calls the adapter — no parsing, no validation, no hashing per call.

## Creating a prepared query

```typescript
import { prepare, sql } from "squn";

const findUser = prepare<User, { id: number }>(
  adapter,
  sql`SELECT * FROM users WHERE id = ${0}`, // placeholder value, not used
  ["id"],                                    // param name order
);
```

The fragment's params are inspected to determine count; the values themselves are ignored. The `["id"]` array tells the prepared query which key to pull from each call's params object.

## Calling a prepared query

```typescript
// All rows
const users = await findUser.all({ id: 42 });       // → User[]

// First row or null
const user  = await findUser.first({ id: 42 });      // → User | null

// Exactly one row (throws on 0 or >1)
const exact = await findUser.single({ id: 42 });     // → User

// First column of first row
const count = await countQuery.scalar({ active: true }); // → number

// Write
const result = await insertUser.execute({ name: "Alice", age: 30 });
// → { rowsAffected: 1 }
```

## When to use

Prepared queries shine for:
- Hot-path queries called thousands of times per second
- Queries called in a tight loop
- Any query where you want to pay the parse/validate cost once at startup

```typescript
// Pay once at module load
const getUserById   = prepare<User, { id: number }>(adapter, sql`...`, ["id"]);
const listByRole    = prepare<User, { role: string }>(adapter, sql`...`, ["role"]);
const updateAge     = prepare<never, { id: number; age: number }>(adapter, sql`...`, ["id", "age"]);

// Zero overhead per call
const user = await getUserById.first({ id: req.params.id });
```

## Inspecting a prepared query

```typescript
console.log(findUser.sql);       // normalised SQL (for logging/cache keys)
console.log(findUser.rawSql);    // raw SQL sent to adapter
console.log(findUser.paramNames); // ["id"]
```
