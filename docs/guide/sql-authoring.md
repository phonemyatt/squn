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

## SQL injection prevention

SQL injection is structurally impossible when you use the `sql` tag. Every interpolated value goes into a `params[]` array; the query text only ever contains `$N` placeholders.

```typescript
// Attacker-controlled input
const userInput = "'; DROP TABLE users; --";

// ❌ Classic vulnerability (raw string concat — impossible with squn's API)
// db.rawQuery("SELECT * FROM users WHERE name = '" + userInput + "'")
// → SELECT * FROM users WHERE name = ''; DROP TABLE users; --'

// ✅ squn — value is a bound parameter, never touches SQL text
const rows = await db.query<User>(
  sql`SELECT * FROM users WHERE name = ${userInput}`,
);
// SQL text:  SELECT * FROM users WHERE name = $1
// params[0]: "'; DROP TABLE users; --"   ← sent as a string, not executed
```

The driver receives a prepared statement with a single bound parameter. There is no injection surface regardless of what the string contains.

### Nested fragments are also safe

```typescript
const filter = sql`status = ${"active"}`;

const rows = await db.query<User>(
  sql`SELECT * FROM users WHERE ${filter} AND id = ${42}`,
);
// SQL text:  SELECT * FROM users WHERE status = $1 AND id = $2
// params:    ["active", 42]
```

Placeholders in nested fragments are renumbered automatically — there is no text mutation step where injection could occur.

### Identifier quoting with `sqlIdentifier`

Column and table names cannot be parameterised — they must appear in the SQL text. Use `sqlIdentifier` to safely quote them:

```typescript
import { sqlIdentifier } from "@phonemyatt/squn";

const column = req.query.sortBy; // user-supplied

const q = sql`SELECT * FROM users ORDER BY ${sqlIdentifier(column)} ASC`;
// sqlIdentifier validates the name and double-quotes it
// Throws SecurityError(INVALID_IDENTIFIER) if the name contains invalid characters
```

Never interpolate raw user strings as identifiers. Always pass them through `sqlIdentifier`.

### Defence-in-depth: `detectInjection`

For freeform search terms passed as parameter values, squn exports a pattern-based detector as an optional extra layer:

```typescript
import { detectInjection } from "@phonemyatt/squn";

const term = req.query.search as string;
const check = detectInjection(term);

if (check.detected) {
  // e.g. { detected: true, severity: "critical", pattern: "STACKED_STATEMENTS" }
  throw new SecurityError(`Blocked: ${check.severity} injection pattern "${check.pattern}"`);
}

// Values are still parameterised even without this check — detectInjection is defence-in-depth
const rows = await db.query(sql`SELECT * FROM products WHERE name LIKE ${`%${term}%`}`);
```

Parameterisation is the primary protection. `detectInjection` is a secondary guard for logging, alerting, or blocking obviously malicious input early.

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
