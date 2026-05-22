# Getting Started

## Installation

```bash
bun add squn
```

## Quick start

```typescript
import { createDb, SqliteAdapter, sql } from "@phonemyatt/squn";

const adapter = new SqliteAdapter({ filename: ":memory:" });
const db = createDb(adapter);

interface User {
  id: number;
  name: string;
  age: number | null;
}

// Tagged template — values are always parameterised
const users = await db.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);
```

## How it works

`createDb` takes an adapter and returns a `Db` object. Every method on `Db` accepts a `SqlFragment` produced by the `sql` tag (or `sqlRaw` for literal SQL you control).

Values interpolated into `sql` become positional `$N` parameters — never concatenated into the SQL text. SQL injection is structurally impossible.

## Next steps

- [Adapters](/guide/adapters) — connect to PostgreSQL, MySQL, or MSSQL
- [SQL Authoring](/guide/sql-authoring) — composing queries with `sql`, `sqlIf`, `sqlJoin`
- [Querying](/guide/querying) — `query`, `queryFirst`, `querySingle`, `stream`
