# TVP (MSSQL)

> **MSSQL only.** Table Valued Parameters are a Microsoft SQL Server feature. `TableType` and `tvp()` have no effect on SQLite, PostgreSQL, or MySQL adapters and will throw `ValidationError` if used with them.

Table Valued Parameters (TVPs) let you pass an array of rows to a stored procedure or parameterised query as a single typed parameter — avoiding the overhead of bulk `INSERT` loops and keeping your code clean.

## SQL-side setup

Before using TVPs in your application, define the table type and a stored procedure in SQL Server:

```sql
-- 1. Create the table type
CREATE TYPE UserTableType AS TABLE (
  name  NVARCHAR(255),
  email NVARCHAR(255),
  age   INT
);

-- 2. Create a stored procedure that accepts it
CREATE PROCEDURE BulkInsertUsers
  @users UserTableType READONLY
AS
  INSERT INTO users (name, email, age)
  SELECT name, email, age FROM @users;
```

## Application-side usage

### 1. Import

```typescript
import { TableType, tvp, sql } from "@phonemyatt/squn";
```

### 2. Define the `TableType`

Mirror the SQL `TYPE` definition in TypeScript. Column names must match exactly; SQL type strings are passed through to the driver:

```typescript
const UserTvp = new TableType("UserTableType", {
  name:  "NVARCHAR(255)",
  email: "NVARCHAR(255)",
  age:   "INT",
});
```

The first argument is the SQL type name (`UserTableType`). The second argument is a record of column names to SQL type strings.

### 3. Build the row array

Each row object must satisfy the column shape defined above. Missing required columns will throw `ValidationError` before the query is sent:

```typescript
const rows = [
  { name: "Alice", email: "alice@example.com", age: 30 },
  { name: "Bob",   email: "bob@example.com",   age: 25 },
];
```

### 4. Execute with `tvp()`

Wrap the `TableType` and rows with `tvp()` and interpolate into a tagged `sql` template:

```typescript
await db.execute(sql`EXEC BulkInsertUsers ${tvp(UserTvp, rows)}`);
```

`tvp()` returns a `TvpValue` — a special object that the MSSQL adapter recognises and serialises as a TVP parameter. It is not a plain value and cannot be used with non-MSSQL adapters.

## Typed rows

For compile-time safety, define a type for the row shape and use it on both the `TableType` definition and the array:

```typescript
import { TableType, tvp, sql } from "@phonemyatt/squn";

interface UserTvpRow {
  name:  string;
  email: string;
  age:   number;
}

const UserTvp = new TableType<UserTvpRow>("UserTableType", {
  name:  "NVARCHAR(255)",
  email: "NVARCHAR(255)",
  age:   "INT",
});

const rows: UserTvpRow[] = [
  { name: "Alice", email: "alice@example.com", age: 30 },
];

await db.execute(sql`EXEC BulkInsertUsers ${tvp(UserTvp, rows)}`);
```

The generic parameter on `new TableType<UserTvpRow>(...)` ensures that each element of `rows` is checked against the interface at compile time.

## Complete example — bulk upsert

```typescript
import { TableType, tvp, MssqlAdapter, createConnection, sql } from "@phonemyatt/squn";

interface ProductRow {
  sku:   string;
  name:  string;
  price: number;
  stock: number;
}

const ProductTvp = new TableType<ProductRow>("ProductTableType", {
  sku:   "NVARCHAR(50)",
  name:  "NVARCHAR(255)",
  price: "DECIMAL(10,2)",
  stock: "INT",
});

const db = createConnection(new MssqlAdapter({ url: process.env.MSSQL_URL }));

async function upsertProducts(products: ProductRow[]): Promise<void> {
  await db.execute(sql`EXEC UpsertProducts ${tvp(ProductTvp, products)}`);
}
```

The corresponding SQL:

```sql
CREATE TYPE ProductTableType AS TABLE (
  sku   NVARCHAR(50),
  name  NVARCHAR(255),
  price DECIMAL(10,2),
  stock INT
);

CREATE PROCEDURE UpsertProducts
  @products ProductTableType READONLY
AS
  MERGE products AS target
  USING @products AS source ON target.sku = source.sku
  WHEN MATCHED THEN
    UPDATE SET name = source.name, price = source.price, stock = source.stock
  WHEN NOT MATCHED THEN
    INSERT (sku, name, price, stock) VALUES (source.sku, source.name, source.price, source.stock);
```

## Temp-table and unnest fallback strategies

When a TVP-equivalent pattern is needed but the environment does not support SQL Server table types (e.g. during integration testing against a stub), squn provides two alternative strategies that can be configured on the adapter:

- **`temp-table`** — squn inserts rows into a temporary table, then passes the temp table name to the procedure.
- **`unnest`** — squn rewrites the query using `UNNEST` (PostgreSQL) or equivalent array expansion.

These are adapter-level configuration options and are not needed for standard MSSQL usage.
