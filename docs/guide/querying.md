# Querying

All query methods are on the `Db` object returned by `createDb`.

## `query<T>` — zero or more rows

```typescript
const users = await db.query<User>(sql`SELECT * FROM users`);
// → User[]
```

## `queryFirst<T>` — first row or null

```typescript
const user = await db.queryFirst<User>(
  sql`SELECT * FROM users WHERE id = ${1}`
);
// → User | null
```

## `querySingle<T>` — exactly one row

Throws `QueryError(NO_ROWS_FOUND)` if zero rows, `QueryError(MULTIPLE_ROWS_FOUND)` if more than one:

```typescript
const user = await db.querySingle<User>(
  sql`SELECT * FROM users WHERE id = ${1}`
);
// → User (throws if not exactly one row)
```

## `queryScalar<T>` — first column of first row

```typescript
const count = await db.queryScalar<number>(
  sql`SELECT COUNT(*) FROM users WHERE active = ${true}`
);
// → number
```

## `queryMultiple` — multiple result sets

For databases that return multiple result sets (e.g. MSSQL stored procedures):

```typescript
const [users, roles] = await db.queryMultiple(
  sqlRaw("EXEC GetUsersAndRoles")
);
// → [Row[], Row[]]
```

## `stream<T>` — async iterator

Streams rows without loading all results into memory:

```typescript
for await (const user of db.stream<User>(sql`SELECT * FROM users`)) {
  console.log(user.name);
}
```

Use `await using` to guarantee cleanup even if you break early:

```typescript
await using cursor = db.stream<User>(sql`SELECT * FROM large_table`);
for await (const row of cursor) {
  if (row.id === target) break; // cursor cleaned up automatically
}
```

## Prepared queries

Parse and validate once, bind params on every call — zero per-call overhead:

```typescript
import { prepare, sql } from "@phonemyatt/squn";

const findUser = prepare<User, { id: number }>(
  adapter,
  sql`SELECT * FROM users WHERE id = ${0}`,
  ["id"],
);

// Hot path — only param binding + adapter call
const user = await findUser.first({ id: 42 });
const users = await findUser.all({ id: 42 });
const single = await findUser.single({ id: 42 });
```

See the [Prepared Queries](/guide/prepared) page for more detail.
