# I built a type-safe SQL library for Bun — no ORM, no codegen, just SQL

I've been using Bun for a while and kept running into the same problem: every SQL library either requires Node.js internals, leans heavily on an ORM abstraction I don't want, or generates types from a schema file at build time.

So I built **squn** — a lightweight, type-safe SQL query library that works natively with Bun's built-in database clients.

## The core idea

Every query goes through a tagged template literal called `sql`. Interpolated values always become bound parameters — they are never concatenated into the SQL string. SQL injection is structurally impossible by design.

```typescript
import { createConnection, PostgresAdapter, sql } from "@phonemyatt/squn";

const db = createConnection(new PostgresAdapter({
  url: "postgresql://user:password@localhost:5432/mydb",
}));

interface User {
  id: number;
  name: string;
  age: number | null;
}

// Values become $1, $2 parameters — never string-concatenated
const users = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);
```

No schema file. No code generation step. No build-time magic. You write SQL, get back typed results.

## Four databases, one API

squn supports all four databases you're likely to use with Bun:

| Database   | Driver                     |
|------------|----------------------------|
| SQLite     | `bun:sqlite` (built-in)    |
| PostgreSQL | Bun's native Postgres       |
| MySQL      | Bun's native MySQL          |
| MSSQL      | `mssql` npm package         |

The same query code works across all four — only the adapter construction changes.

```typescript
// Switch databases by swapping the adapter
const db = createConnection(new SqliteAdapter({ filename: ":memory:" }));
const db = createConnection(new PostgresAdapter({ url: process.env.PG_URL }));
const db = createConnection(new MysqlAdapter({ url: process.env.MYSQL_URL }));
const db = createConnection(new MssqlAdapter({ host: "localhost", ... }));
```

## Query methods that match what you actually need

```typescript
// All rows
const users = await db.query<User>(sql`SELECT * FROM users`);

// First row or null — no throw
const user = await db.queryFirst<User>(sql`SELECT * FROM users WHERE id = ${1}`);

// Exactly one row — throws if 0 or 2+ rows returned
const user = await db.querySingle<User>(sql`SELECT * FROM users WHERE id = ${1}`);

// Scalar — first column of first row
const count = await db.queryScalar<number>(sql`SELECT COUNT(*) FROM users`);
```

## Composable SQL fragments

Fragments compose. Nested fragments merge inline and placeholders are renumbered automatically.

```typescript
const minAge = 18;
const activeOnly = true;

const conditions = [
  sqlIf(minAge !== undefined, sql`age >= ${minAge}`),
  sqlIf(activeOnly, sql`active = ${true}`),
];

const where = sqlJoin(conditions, " AND ");
const q = sql`SELECT * FROM users WHERE ${where} ORDER BY name`;
// → SELECT * FROM users WHERE age >= $1 AND active = $2 ORDER BY name
// params → [18, true]
```

No string concatenation. No injection risk. Full composability.

## Transactions that don't leak

`atomically` wraps your callback in BEGIN/COMMIT and rolls back automatically on error:

```typescript
await db.atomically(async (q) => {
  await q.execute(sql`UPDATE accounts SET balance = balance - ${100} WHERE id = ${from}`);
  await q.execute(sql`UPDATE accounts SET balance = balance + ${100} WHERE id = ${to}`);
  // if either throws, both updates are rolled back
});
```

`Transaction` also implements `Symbol.asyncDispose` — so `await using` gives you guaranteed cleanup:

```typescript
await using tx = new Transaction(await adapter.beginTransaction());
await tx.execute(sql`UPDATE users SET active = ${false} WHERE id = ${42}`);
await tx.commit();
// if commit throws or you return early, rollback happens automatically
```

## Batch inserts with a single prepared statement

```typescript
await db.executeBatch(
  sql`INSERT INTO users (name, age) VALUES (@name, @age)`,
  [
    { name: "Alice", age: 30 },
    { name: "Bob",   age: 25 },
    { name: "Carol", age: 35 },
  ],
);
```

One prepared statement, all rows bound in a loop. Much faster than individual inserts.

## Type inference from table definitions

Define your table schema once, get insert/select/update types inferred automatically:

```typescript
import { col, defineTable, InferSelect, InferInsert } from "@phonemyatt/squn";

const Users = defineTable({
  id:   col("integer").primaryKey().notNull(),
  name: col("text").notNull(),
  age:  col("integer").nullable(),
});

type UserRow    = InferSelect<typeof Users>;  // { id: number; name: string; age: number | null }
type UserInsert = InferInsert<typeof Users>;  // { name: string; age?: number | null }
```

## Multi-connection and read replicas

```typescript
const db = createConnections({
  connections: {
    primary: new PostgresAdapter({ url: process.env.PRIMARY }),
    replica: new PostgresAdapter({ url: process.env.REPLICA }),
  },
  default: "primary",
});

// Route reads to replica
const users = await db.query<User>(sql`SELECT * FROM users`, { connection: "replica" });

// Scoped helper — no connection option needed per call
const replica = db.use("replica");

// Typed concurrent queries
const [users, roles] = await db.concurrent(
  db.query<User>(sql`SELECT * FROM users`),
  db.query<Role>(sql`SELECT * FROM roles`),
);
```

## Try it

```bash
bun add @phonemyatt/squn
```

- GitHub: https://github.com/phonemyatt/squn
- npm: https://www.npmjs.com/package/@phonemyatt/squn
- Docs: https://phonemyatt.github.io/squn

Feedback welcome — especially from anyone using it with MySQL or MSSQL in production.

---

*Built with TypeScript 5.9 strict mode, zero `any`, and tested against real databases in Docker.*
