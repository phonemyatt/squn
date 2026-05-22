# Query Builder

`queryBuilder` constructs a `SqlFragment` lazily — nothing executes until you pass the result to `db.query()` or another execution method. This lets you compose queries in pieces, share base queries across functions, and build type-safe dynamic filters without string concatenation.

## Basic usage

```typescript
import { queryBuilder, sql } from "@phonemyatt/squn";

const q = queryBuilder("users")
  .select("id", "name", "email")
  .where(sql`age > ${18}`)
  .where(sql`active = ${true}`)
  .orderBy("name ASC")
  .limit(20)
  .offset(0)
  .build();

const users = await db.query<User>(q);
```

Each `.where()` call adds a condition with `AND`. Parameters are always passed as tagged `sql` fragments — never string-concatenated — so injection is not possible.

## Using `defineTable` as the source

Pass a table definition directly to `queryBuilder`. The `tableName` is inferred automatically:

```typescript
import { col, defineTable, InferSelect, queryBuilder, sql } from "@phonemyatt/squn";

const Users = defineTable({
  id:    col("integer").primaryKey().notNull(),
  name:  col("text").notNull(),
  email: col("text").notNull(),
  role:  col("text").notNull(),
  age:   col("integer").nullable(),
});

type UserRow = InferSelect<typeof Users>;

const q = queryBuilder(Users) // tableName inferred from definition
  .where(sql`role = ${"admin"}`)
  .build();

const admins = await db.query<UserRow>(q);
```

## Chaining multiple conditions

Every `.where()` call appends an `AND` condition. Call it as many times as needed:

```typescript
const q = queryBuilder("products")
  .select("id", "name", "price")
  .where(sql`price < ${100}`)
  .where(sql`category = ${"electronics"}`)
  .where(sql`in_stock = ${true}`)
  .orderBy("price ASC")
  .limit(50)
  .build();
```

## Ordering

Pass a column name and direction as a string. Multiple `.orderBy()` calls append columns to the `ORDER BY` clause in the order they are called:

```typescript
const q = queryBuilder("orders")
  .orderBy("created_at DESC")
  .orderBy("id ASC")
  .build();
```

## Pagination

Use `.paginate()` as a shorthand for `.limit()` + `.offset()`:

```typescript
const q = queryBuilder("users")
  .paginate({ page: 2, pageSize: 20 })
  .build();
// equivalent to .limit(20).offset(20)
```

Page numbering starts at 1. `page: 1` produces `OFFSET 0`.

## Selecting specific columns

Calling `.select()` with column names generates a `SELECT col1, col2 ...` clause. Omitting `.select()` generates `SELECT *`:

```typescript
const q = queryBuilder("users")
  .select("id", "email")          // SELECT id, email FROM users
  .build();

const qAll = queryBuilder("users")
  .build();                        // SELECT * FROM users
```

## Building and reusing

`.build()` returns a `SqlFragment` — the same type produced by the `sql` tag. You can store a base query and extend it:

```typescript
import type { SqlFragment } from "@phonemyatt/squn";

function activeUsers(): SqlFragment {
  return queryBuilder("users")
    .where(sql`active = ${true}`)
    .build();
}

// Extend in a specific context — wrap as a subquery or pass to db.query()
const users = await db.query<User>(activeUsers());
```

## Execution methods

`queryBuilder` only builds the SQL fragment. Use the standard `db` methods to execute:

| Method                     | Returns           | Use when                                      |
|----------------------------|-------------------|-----------------------------------------------|
| `db.query<T>(q)`           | `T[]`             | Fetching multiple rows                        |
| `db.queryFirst<T>(q)`      | `T \| undefined`  | First matching row, or undefined if none      |
| `db.querySingle<T>(q)`     | `T`               | Exactly one row — throws if 0 or 2+ rows      |
| `db.queryScalar<T>(q)`     | `T`               | Single scalar value (e.g. `COUNT(*)`)         |

## Full example with pagination and types

```typescript
import {
  col,
  defineTable,
  InferSelect,
  queryBuilder,
  sql,
} from "@phonemyatt/squn";

const Articles = defineTable({
  id:          col("integer").primaryKey().notNull(),
  title:       col("text").notNull(),
  authorId:    col("integer").notNull(),
  publishedAt: col("text").nullable(),
  views:       col("integer").notNull(),
});

type ArticleRow = InferSelect<typeof Articles>;

interface ListArticlesOptions {
  authorId?: number;
  page:      number;
  pageSize:  number;
}

async function listArticles(
  db: Database,
  opts: ListArticlesOptions,
): Promise<ArticleRow[]> {
  let q = queryBuilder(Articles)
    .where(sql`published_at IS NOT NULL`)
    .orderBy("published_at DESC");

  if (opts.authorId !== undefined) {
    q = q.where(sql`author_id = ${opts.authorId}`);
  }

  return db.query<ArticleRow>(
    q.paginate({ page: opts.page, pageSize: opts.pageSize }).build(),
  );
}
```

## Limitations

- `queryBuilder` builds `SELECT` queries only. For `INSERT`, `UPDATE`, `DELETE`, or DDL, write tagged `sql` fragments directly.
- Complex joins, subqueries, and window functions are outside the builder's scope — compose them with raw `sql` tags and pass the result to `db.query()`.
