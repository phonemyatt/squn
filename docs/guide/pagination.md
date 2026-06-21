# Pagination

The query builder provides a `.paginate()` method that adds `LIMIT` and `OFFSET` clauses automatically. All other builder methods compose freely with it.

## Basic usage

```typescript
import { queryBuilder } from "@phonemyatt/squn";

const q = queryBuilder("products")
  .select("id", "name", "price")
  .where(sql`category = ${"electronics"}`)
  .orderBy("name", "ASC")
  .paginate({ page: 1, pageSize: 20 })
  .build();

const rows = await db.query<Product>(q);
```

Page numbers are **1-based**. `page: 1, pageSize: 20` produces `LIMIT 20 OFFSET 0`. `page: 2` produces `LIMIT 20 OFFSET 20`.

## Dynamic page from a request

```typescript
async function listProducts(page: number, pageSize: number) {
  return db.query<Product>(
    queryBuilder("products")
      .select("id", "name", "price")
      .orderBy("id", "ASC")
      .paginate({ page, pageSize })
      .build(),
  );
}
```

## Combining with other filters

```typescript
const q = queryBuilder("orders")
  .where(sql`status = ${"pending"}`)
  .where(sql`created_at > ${cutoff}`)
  .orderBy("created_at", "DESC")
  .paginate({ page: 3, pageSize: 10 })
  .build();
```

Multiple `.where()` calls are joined with `AND`.

## Raw SQL pagination

When you are writing raw SQL rather than using the builder, add `LIMIT` and `OFFSET` as parameters:

```typescript
const limit = 20;
const offset = (page - 1) * limit;

const rows = await db.query<Product>(
  sql`SELECT * FROM products ORDER BY id ASC LIMIT ${limit} OFFSET ${offset}`,
);
```

Values are always parameterised — safe by construction.

## Counting total rows

squn does not automatically issue a `COUNT(*)` query. Run it yourself and return it alongside the page:

```typescript
async function getPage(page: number, pageSize: number) {
  const [rows, [count]] = await Promise.all([
    db.query<Product>(
      queryBuilder("products")
        .orderBy("id")
        .paginate({ page, pageSize })
        .build(),
    ),
    db.query<{ total: number }>(sql`SELECT COUNT(*) AS total FROM products`),
  ]);

  return {
    rows,
    total: count?.total ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count?.total ?? 0) / pageSize),
  };
}
```

## `PaginateOptions`

```typescript
interface PaginateOptions {
  readonly page: number;      // 1-based page number
  readonly pageSize: number;  // rows per page
}
```
