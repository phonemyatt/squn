# SQL Authoring

## The `sql` tag

The `sql` tagged template literal is the primary way to write queries. Interpolated values become positional `$N` parameters — they are never concatenated into SQL text.

```typescript
import { sql } from "@phonemyatt/squn";

const userId = 42;
const q = sql`SELECT * FROM users WHERE id = ${userId}`;
// q.text   → "SELECT * FROM users WHERE id = $1"
// q.params → [42]
```

## Nested fragments

Fragments compose. Nested fragments merge inline with renumbered placeholders:

```typescript
const minAge = 18;
const filter = sql`age > ${minAge}`;

const query = sql`SELECT * FROM users WHERE ${filter} ORDER BY name`;
// text   → "SELECT * FROM users WHERE age > $1 ORDER BY name"
// params → [18]
```

## `sqlRaw`

For DDL, literals, or any SQL text where you control every character. **Do not pass user input here.**

```typescript
import { sqlRaw } from "@phonemyatt/squn";

const ddl = sqlRaw("CREATE TABLE IF NOT EXISTS logs (id SERIAL PRIMARY KEY)");
```

## `sqlIdentifier`

Safely quotes a single identifier:

```typescript
import { sqlIdentifier, sqlQualifiedIdentifier } from "@phonemyatt/squn";

sqlIdentifier("user_name")              // → "user_name"
sqlQualifiedIdentifier("public", "users") // → "public"."users"
```

Throws `SecurityError(INVALID_IDENTIFIER)` if the name contains characters outside `[a-zA-Z0-9_]`.

## `sqlIf`

Conditionally includes a fragment:

```typescript
import { sqlIf } from "@phonemyatt/squn";

const isAdmin = true;
const clause = sqlIf(isAdmin, sql`AND role = ${"admin"}`);

const q = sql`SELECT * FROM users WHERE active = ${true} ${clause}`;
```

When the condition is false, `sqlIf` returns an empty fragment — no SQL is added.

## `sqlJoin`

Joins an array of fragments with a separator:

```typescript
import { sqlJoin } from "@phonemyatt/squn";

const conditions = [
  sql`age > ${18}`,
  sql`active = ${true}`,
  sql`role = ${"admin"}`,
];

const where = sqlJoin(conditions, " AND ");
const q = sql`SELECT * FROM users WHERE ${where}`;
```

## Building dynamic queries

Combine the helpers to build fully dynamic queries without string concatenation:

```typescript
function findUsers(filters: {
  minAge?: number;
  role?: string;
  active?: boolean;
}) {
  const conditions = [
    sqlIf(filters.minAge !== undefined, sql`age >= ${filters.minAge ?? 0}`),
    sqlIf(filters.role !== undefined, sql`role = ${filters.role ?? ""}`),
    sqlIf(filters.active !== undefined, sql`active = ${filters.active ?? true}`),
  ];

  const where = sqlJoin(
    conditions.filter(c => c.text.trim() !== ""),
    " AND "
  );

  return sql`SELECT * FROM users${where.text ? sql` WHERE ${where}` : sqlRaw("")}`;
}
```
