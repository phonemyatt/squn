# Type Definitions

squn infers TypeScript types directly from your table definitions. Define a table once and get fully-typed query results, insert shapes, and update shapes — no manual interface duplication.

## Defining a table

Use `defineTable` with the `col` builder to describe your schema:

```typescript
import { col, defineTable } from "@phonemyatt/squn";

const Users = defineTable("users", {
  id:        col.int().primaryKey(),
  name:      col.nvarchar(100).notNull(),
  email:     col.nvarchar(255).notNull(),
  age:       col.int().nullable(),
  createdAt: col.datetime().notNull(),
});
```

## `col` builder reference

### Primitive shorthands

| Builder | SQL type | TypeScript type | Notes |
|---------|----------|-----------------|-------|
| `col.string(len?)` | `NVARCHAR` | `string` | Defaults to `MAX` length |
| `col.number()` | `FLOAT` | `number` | IEEE 754 double — use `col.int()` for integers |

### Exact SQL types

| Builder | SQL type | TypeScript type | Notes |
|---------|----------|-----------------|-------|
| `col.int()` | `INT` | `number` | |
| `col.bigint()` | `BIGINT` | `number` | |
| `col.smallint()` | `SMALLINT` | `number` | |
| `col.float()` | `FLOAT` | `number` | |
| `col.decimal(precision?)` | `DECIMAL` | `number` | |
| `col.boolean()` | `BOOLEAN` | `boolean` | |
| `col.text()` | `TEXT` | `string` | Unbound text, no length |
| `col.nvarchar(len\|"MAX")` | `NVARCHAR` | `string` | Unicode, preferred for text |
| `col.varchar(len\|"MAX")` | `VARCHAR` | `string` | |
| `col.char(len)` | `CHAR` | `string` | Fixed length |
| `col.datetime()` | `DATETIME` | `Date` | |
| `col.date()` | `DATE` | `Date` | |
| `col.time()` | `TIME` | `string` | |
| `col.uuid()` | `UUID` | `string` | |
| `col.blob()` | `BLOB` | `Buffer` | |
| `col.json<T>()` | `JSON` | `T` | Use a specific type, not `unknown` |
| `col.array<T>()` | `T[]` | `T[]` | PostgreSQL arrays |

### Column modifiers

Chain after any `col.*()` call:

| Modifier | Effect |
|----------|--------|
| `.notNull()` | Required; TypeScript type does not include `null` |
| `.nullable()` | Optional; TypeScript type includes `\| null` |
| `.primaryKey()` | Implies `.readonly()` — excluded from `InferInsert` and `InferUpdate` |
| `.readonly()` | Excluded from `InferInsert` and `InferUpdate` |
| `.unique()` | Metadata only (no runtime enforcement) |
| `.computed(expr)` | Implies `.readonly()` |

Every column must have exactly one of `.notNull()` or `.nullable()`.

## Inferred types

### `InferModel`

Full row shape as returned by `SELECT *`:

```typescript
import type { InferModel } from "@phonemyatt/squn";

type User = InferModel<typeof Users>;
// {
//   id:        number;
//   name:      string;
//   email:     string;
//   age:       number | null;
//   createdAt: Date;
// }
```

### `InferInsert`

Insert payload: primary key and readonly columns excluded; nullable columns become optional:

```typescript
import type { InferInsert } from "@phonemyatt/squn";

type UserInsert = InferInsert<typeof Users>;
// {
//   name:      string;
//   email:     string;
//   age?:      number | null;
//   createdAt: Date;
// }
// `id` omitted — primary key
```

### `InferUpdate`

Update payload: same exclusions as `InferInsert`, all fields optional:

```typescript
import type { InferUpdate } from "@phonemyatt/squn";

type UserUpdate = InferUpdate<typeof Users>;
// {
//   name?:      string;
//   email?:     string;
//   age?:       number | null;
//   createdAt?: Date;
// }
```

## Using `tableName`

Every table definition exposes `.tableName`:

```typescript
console.log(Users.tableName); // "users"

const q = queryBuilder(Users)
  .select("id", "name", "email")
  .where(sql`role = ${"admin"}`)
  .build();
```

## Complete example

```typescript
import { col, defineTable, queryBuilder, sql } from "@phonemyatt/squn";
import type { InferModel, InferInsert } from "@phonemyatt/squn";

const Posts = defineTable("posts", {
  id:        col.int().primaryKey(),
  authorId:  col.int().notNull(),
  title:     col.nvarchar(500).notNull(),
  body:      col.text().notNull(),
  published: col.boolean().notNull(),
  score:     col.decimal().nullable(),
});

type PostRow    = InferModel<typeof Posts>;
type PostInsert = InferInsert<typeof Posts>;
// PostInsert: { authorId: number; title: string; body: string; published: boolean; score?: number | null }

async function getPublishedPosts(): Promise<PostRow[]> {
  return db.query<PostRow>(
    queryBuilder(Posts)
      .where(sql`published = ${true}`)
      .orderBy("id", "DESC")
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
