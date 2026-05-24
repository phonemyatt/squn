# Type Definitions

squn infers TypeScript types directly from your table definitions. Define a table once and get fully-typed query results, insert shapes, and compile-time column validation — no manual interface duplication.

## Defining a table

Use `defineTable` with `col()` to describe your schema:

```typescript
import { col, defineTable } from "@phonemyatt/squn";

const Users = defineTable({
  id:    col("integer").primaryKey().notNull(),
  name:  col("text").notNull(),
  email: col("text").notNull(),
  age:   col("integer").nullable(),
  role:  col("text").notNull(),
});
```

## `col()` type options

The first argument to `col()` maps to a TypeScript type:

| SQL type      | TypeScript type |
|---------------|-----------------|
| `"integer"`   | `number`        |
| `"text"`      | `string`        |
| `"boolean"`   | `boolean`       |
| `"real"`      | `number`        |
| `"blob"`      | `Uint8Array`    |

## Column modifiers

- `.notNull()` — column is required; TypeScript type does not include `null`
- `.nullable()` — column may be null; TypeScript type includes `| null`
- `.primaryKey()` — marks the column as a primary key; excluded from `InferInsert` (see below)

## `InferSelect`

`InferSelect` produces the shape of a row returned by a `SELECT *` or full-row query:

```typescript
import { InferSelect } from "@phonemyatt/squn";

type UserRow = InferSelect<typeof Users>;
// {
//   id:    number;
//   name:  string;
//   email: string;
//   age:   number | null;
//   role:  string;
// }
```

Use this as the type parameter when querying:

```typescript
const users = await db.query<UserRow>(sql`SELECT * FROM users`);
// users: UserRow[]
```

## `InferInsert`

`InferInsert` produces the shape for an `INSERT` payload. Primary key columns are excluded; nullable columns become optional:

```typescript
import { InferInsert } from "@phonemyatt/squn";

type UserInsert = InferInsert<typeof Users>;
// {
//   name:  string;
//   email: string;
//   age?:  number | null;   // nullable → optional
//   role:  string;
// }
// `id` is omitted — it is a primary key
```

Use it to validate insert data at compile time:

```typescript
async function createUser(data: UserInsert) {
  return db.execute(sql`
    INSERT INTO users (name, email, age, role)
    VALUES (${data.name}, ${data.email}, ${data.age ?? null}, ${data.role})
  `);
}
```

## `InferReadonlyModel`

`InferReadonlyModel` strips mutable fields and returns a deeply-readonly version of the select shape. It is useful when passing row data to code that must not mutate it:

```typescript
import { InferReadonlyModel } from "@phonemyatt/squn";

type ReadonlyUser = InferReadonlyModel<typeof Users>;
// Readonly<{
//   id:    number;
//   name:  string;
//   email: string;
//   age:   number | null;
//   role:  string;
// }>
```

## Using `Users.tableName` with the query builder

Every table definition exposes a `.tableName` string that you can pass directly to `queryBuilder` or interpolate into raw SQL:

```typescript
// String name matches the key from defineTable — defaults to the variable name
// if not overridden.
console.log(Users.tableName); // "users"

// Pass the table definition to queryBuilder — tableName is inferred:
import { queryBuilder } from "@phonemyatt/squn";

const q = queryBuilder(Users)
  .select("id", "name", "email")
  .where(sql`role = ${"admin"}`)
  .build();

const admins = await db.query<UserRow>(q);
```

You can also interpolate it directly:

```typescript
const rows = await db.query<UserRow>(
  sql`SELECT * FROM ${sql.id(Users.tableName)} WHERE id = ${userId}`,
);
```

## Complete example

```typescript
import { col, defineTable, InferSelect, InferInsert, queryBuilder, sql } from "@phonemyatt/squn";

const Posts = defineTable({
  id:        col("integer").primaryKey().notNull(),
  authorId:  col("integer").notNull(),
  title:     col("text").notNull(),
  body:      col("text").notNull(),
  published: col("boolean").notNull(),
  score:     col("real").nullable(),
});

type PostRow    = InferSelect<typeof Posts>;
type PostInsert = InferInsert<typeof Posts>;
// PostInsert: { authorId: number; title: string; body: string; published: boolean; score?: number | null }

async function getPublishedPosts(): Promise<PostRow[]> {
  return db.query<PostRow>(
    queryBuilder(Posts)
      .where(sql`published = ${true}`)
      .orderBy("id DESC")
      .build(),
  );
}

async function createPost(data: PostInsert): Promise<void> {
  await db.execute(sql`
    INSERT INTO posts (author_id, title, body, published, score)
    VALUES (${data.authorId}, ${data.title}, ${data.body}, ${data.published}, ${data.score ?? null})
  `);
}
```
