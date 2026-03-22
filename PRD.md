# Squn — Product Requirements Document

**Version:** 2.4.2  
**Runtime:** Bun ≥ 1.2 (TypeScript-native)  
**Status:** Pre-development — design complete  

---

## Table of contents

1. [Overview](#1-overview)
2. [Goals and non-goals](#2-goals-and-non-goals)
3. [Supported databases](#3-supported-databases)
4. [Architecture](#4-architecture)
5. [Type system](#5-type-system)
6. [SQL authoring](#6-sql-authoring)
7. [Query API](#7-query-api)
8. [Object and class mapping](#8-object-and-class-mapping)
9. [Table valued parameters](#9-table-valued-parameters)
10. [Transactions](#10-transactions)
11. [Connection pool](#11-connection-pool)
12. [Timeout system](#12-timeout-system)
13. [Readonly support](#13-readonly-support)
14. [Authentication](#14-authentication)
15. [Security and injection prevention](#15-security-and-injection-prevention)
16. [Error handling](#16-error-handling)
17. [Logging](#17-logging)
18. [Configuration](#18-configuration)
19. [Performance](#19-performance)
20. [Project structure](#20-project-structure)
21. [Build plan](#21-build-plan)
22. [Environment variables](#22-environment-variables)
23. [Unit testing](#23-unit-testing)
24. [Multiple connection strings](#24-multiple-connection-strings)

---

## 1. Overview

Squn is a TypeScript-native SQL query library for the Bun runtime. It occupies the space between a raw database driver and a full ORM — you write SQL directly, Squn maps results into typed objects and keeps the database layer honest at every layer from schema definition to query execution.

Squn is not a thin wrapper. It provides a schema definition system, compile-time type inference, injection-safe SQL authoring, class mapping, table-valued parameters, transactions with savepoints, connection pooling, failover, multi-tenant connection management, and production-grade configuration and security defaults. These are ORM-tier capabilities, deliberately chosen because they are the things a real application needs and a raw driver cannot provide.

What Squn does not do is generate SQL from method chains or manage your database schema. You write your queries. You run your migrations with a tool built for that job. Squn handles everything between writing the query and getting a typed result back.

### 1.1 Core principles

- **Type-safe by default.** Nullability, readonly fields, and result shapes are inferred from the schema at compile time. No runtime overhead from the type system.
- **Async-first, always.** Every database operation returns a `Promise`. No sync variants exist.
- **Bun-native.** Uses `bun:sqlite`, `Bun.SQL` (native PostgreSQL and MySQL client, Bun ≥ 1.2), `Bun.hash()`, `Bun.sleep()`, and native `fetch` where applicable.
- **Parameterized everywhere.** SQL injection is structurally impossible through the `sql` tagged template. Raw SQL requires an explicit escape hatch that is always audited.
- **Fail loud in production.** Missing production config throws at `createDb()` — never lazily on first query.
- **Zero silent failures.** Every error is wrapped, logged, and rethrown as a typed `SqunError`.
- **Honest APIs.** Dangerous features are documented as dangerous. Silent failure modes do not exist.
- **Logic belongs in the database.** If an operation touches more than one query, it belongs in a stored procedure, view, or database function — not scattered across application code. The database is the right place to enforce multi-step data integrity, not the application layer.
- **Least-privilege by design.** The recommended permission model gives application connections read access and stored procedure execute access only. All writes go through stored procedures. Direct `INSERT`, `UPDATE`, and `DELETE` from application code are an anti-pattern in this model — they bypass the database's own enforcement layer.

---

## 2. Goals and non-goals

### 2.1 Goals

- Typed query results with nullability inferred from schema definitions
- Multi-database support — SQLite, PostgreSQL, MySQL, MSSQL
- Table valued parameters with native and shim strategies per adapter — including direct INSERT, upsert, and conditional bulk write patterns
- Async streaming for large result sets
- Transactions with savepoints, isolation levels, and deadlock retry
- Atomic batch execution for simple multi-query guarantee without savepoint overhead
- Connection pooling with health checks and graceful drain
- Global and per-call timeout resolution with transaction budget tracking
- Readonly support at column, model, query, connection, and transaction level
- Windows Authentication and Azure AD for MSSQL
- SQL injection prevention via parameterization, regex detection, and identifier sanitization
- Structured, pluggable logging with full error context
- Sensible defaults for development, test, and production environments
- Verbose, specification-grade unit tests covering every module, edge case, and failure path
- Multiple named connection strings resolved from config, env vars, or a config file — supporting replicas, domain separation, multi-tenancy, and failover

### 2.2 Non-goals

- Schema migrations — use a dedicated migration tool
- Query generation or ORM-style model relationships
- GraphQL integration
- A CLI beyond what is needed for setup
- Browser support — Bun-only
- Synchronous database operations
- Lazy loading — N+1 query generation is a silent performance killer at scale. Load related data explicitly with a JOIN or a batched `IN` query. Squn surfaces the query cost intentionally, never hides it.

---

## 3. Supported databases

| Adapter | Driver | Pool | TVP strategy | Windows auth |
|---|---|---|---|---|
| SQLite | `bun:sqlite` (native) | No — in-process | Temp table / JSON | No |
| PostgreSQL | `Bun.SQL` (native, Bun ≥ 1.2) | Built-in | `unnest()` arrays | No |
| MySQL | `Bun.SQL` (native, Bun ≥ 1.2) | Built-in | Temp table | No |
| MSSQL | `mssql` (npm) | Squn-managed | Native structured type | Yes |

### 3.1 Driver strategy

**PostgreSQL and MySQL use `Bun.SQL`** — Bun's native database client introduced in Bun 1.2. It supports PostgreSQL and MySQL with a built-in connection pool, prepared statements, streaming, and transactions. No external npm driver is needed. This reduces the dependency surface, improves startup performance, and keeps the adapters aligned with the Bun-native philosophy.

`Bun.SQL` exposes a tagged template interface (`sql\`SELECT ...\``) that produces parameterized queries automatically — structurally identical to the Squn `sql` tag approach. The PostgreSQL and MySQL adapters wrap `Bun.SQL` behind the `IDbAdapter` interface so the core engine remains database-agnostic.

```typescript
// What the PostgreSQL adapter wraps internally
import { SQL } from "bun";

const sql = new SQL({
  url:      config.url,
  max:      config.pool.max,
  idleTimeout: config.pool.idleTimeoutMs / 1000,
  // Bun.SQL uses its own built-in pool — Squn does not wrap it in ConnectionPool
});
```

**Bun.SQL does not support MSSQL.** The MSSQL adapter continues to use the `mssql` npm package, and Squn manages its connection pool directly via `ConnectionPool`.

**SQLite continues to use `bun:sqlite`** — it has always been native and has no pool because it is in-process.

### 3.2 Pool architecture per adapter

Because `Bun.SQL` has its own built-in pool, the Squn `ConnectionPool` class is only instantiated for the MSSQL adapter. The PostgreSQL and MySQL adapters delegate pool management to `Bun.SQL` and expose the same `IDbAdapter` interface. Pool stats for PostgreSQL and MySQL are sourced from `Bun.SQL`'s internal metrics rather than from `PoolStats`.

```
Adapter    Pool manager
─────────────────────────────
SQLite     None (in-process)
PostgreSQL Bun.SQL built-in
MySQL      Bun.SQL built-in
MSSQL      Squn ConnectionPool
```

---

## 4. Architecture

### 4.1 Layer overview

```
Public API (createDb, queryBuilder, tvp, transaction)
        ↓
Core engine (query runner, multi-mapper, TVP handler)
        ↓
Type system (param builder, type mapper, type handlers)
        ↓
Adapter layer (IDbAdapter, per-driver implementations)
        ↓
Connection pool (MSSQL only — acquire, release, health, reaper)
        ↓
Database driver (bun:sqlite, Bun.SQL for PG+MySQL, mssql for MSSQL)
```

### 4.2 Sync vs async boundary

Everything that touches the database is async. Schema definition, type inference, and query building are synchronous and zero-cost at runtime. The boundary is clean and never crossed.

```
Synchronous:   defineTable(), col(), tvp(), queryBuilder() construction
Asynchronous:  everything that touches the database
```

### 4.3 Adapter interface

All database-specific behaviour lives in adapters. The core engine is fully database-agnostic.

```typescript
interface IDbAdapter {
  readonly type: "sqlite" | "postgres" | "mysql" | "mssql";
  execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }>;
  query(sql: string, params: unknown[]): Promise<Row[]>;
  queryMultiple(sql: string, params: unknown[]): Promise<Row[][]>;
  beginTransaction(): Promise<IDbTransaction>;
  ping(): Promise<void>;
  close(): Promise<void>;

  // TVP materialisation — called by the query runner when a SqlFragment
  // contains tvpValues (i.e. one or more __TVP_N__ sentinels).
  // Returns the adapter-specific SQL expression that replaces each sentinel,
  // and performs any necessary setup (temp table creation, parameter binding).
  // Called once per TVP per query, before the final SQL is sent to the driver.
  materializeTvp(tvp: TvpValue, index: number): Promise<TvpMaterialised>;
}

// The result of materialising a TVP for a specific adapter.
// sqlExpression replaces the __TVP_N__ sentinel in the final SQL text.
// extraParams are appended to the params array at the sentinel's position.
// cleanup() is called after the query completes (or fails) — drops temp tables,
// releases native TVP handles. Always called in a finally block.
interface TvpMaterialised {
  readonly sqlExpression: string;
  readonly extraParams:   readonly unknown[];
  readonly cleanup:       () => Promise<void>;
}
```

---

## 5. Type system

### 5.1 Schema definition

```typescript
const Users = defineTable("users", {
  id:        col.int().primaryKey().readonly(),
  name:      col.nvarchar(100).notNull(),
  email:     col.nvarchar(255).notNull().unique(),
  age:       col.int().nullable(),
  bio:       col.nvarchar("MAX").nullable(),
  createdAt: col.datetime().notNull().readonly(),
  updatedAt: col.datetime().notNull(),
  deletedAt: col.datetime().nullable(),
  fullName:  col.nvarchar(201).computed("firstName + ' ' + lastName").readonly(),
});
```

### 5.2 Foundational primitive types

These types are used throughout the library across adapters, mappers, and query methods. They are defined once here and imported everywhere else — no magic strings, no `any` escapes.

```typescript
// A raw row returned by the database driver before any mapping.
// Squn receives rows in this shape from IDbAdapter.query() and
// maps them into typed models using the compiled mapper.
// Column values are unknown at this level because drivers return
// heterogeneous data — the type mapper resolves them into T.
type Row = Record<string, unknown>;

// A plain parameter object passed to executeBatch rows.
// Keys must match the named placeholders in the SQL template.
type Params = Record<string, unknown>;

// The resolved database type for a single column value.
// Used by TypeHandler to convert driver-native types into TypeScript types.
type ColumnValue = string | number | boolean | null | Date | Buffer | unknown[];

// The table definition shape returned by defineTable().
// Used as a constraint in insert<Table>() and update<Table>() signatures.
type TableDefinition = ReturnType<typeof defineTable>;
```

`Row` is the boundary type between the adapter layer and the core engine. Above this boundary, types are fully resolved TypeScript shapes. Below it, values are `unknown` because different drivers return different native types (e.g. `Bun.SQL` returns `Date` for timestamps when using PostgreSQL, `bun:sqlite` returns raw numbers). The `TypeHandler` registry resolves this boundary per column type.

### 5.3 Inferred types

| Utility | Description |
|---|---|
| `InferModel<T>` | Full row type with nullability |
| `InferInsert<T>` | Insert shape — primaryKey and readonly columns excluded |
| `InferUpdate<T>` | Update shape — all optional except PK, readonly excluded |
| `InferReadonlyModel<T>` | All fields marked `readonly` |
| `InferSelect<T, K>` | Narrowed shape from `.select()` |
| `InferTableType<T>` | TypeScript type from a `TableType` TVP definition |
| `NullableKeys<T>` | Union of nullable column names |
| `NotNullKeys<T>` | Union of non-null column names |
| `ReadonlyKeys<T>` | Union of readonly column names |
| `MutableKeys<T>` | Union of writable column names |
| `IsNullable<T, K>` | `true` or `false` for a specific column |

### 5.4 Column modifiers

| Modifier | Effect |
|---|---|
| `.nullable()` | Type becomes `T \| null` |
| `.notNull()` | Type is `T` — null not permitted |
| `.readonly()` | Excluded from `InferInsert` and `InferUpdate` |
| `.primaryKey()` | Implies `.readonly()` |
| `.computed(expr)` | DB-computed — always `.readonly()` |
| `.unique()` | Documented constraint — no TypeScript effect |
| `.array()` | PostgreSQL only — column is a native array type, maps to `T[]` |
| `.json<T>()` | Stores value as JSON text on write, parses on read. The TypeScript type `T` is **asserted after parse, not validated at runtime** — JSON.parse returns `any`. Use `.json<T>({ validate: (v): v is T => ... })` to supply a runtime type guard if the column can contain external or untrusted data |

---

## 6. SQL authoring

### 6.1 Tagged template literal

The primary and recommended way to write SQL in Squn. All interpolated values are extracted as parameters — concatenation into the SQL string is structurally impossible.

```typescript
import { sql } from "squn";

const users = await db.query<User>(sql`
  SELECT u.id, u.name, r.name AS role
  FROM   users u
  JOIN   roles r ON r.id = u.role_id
  WHERE  u.deleted_at IS NULL
    AND  u.active  = ${true}
    AND  u.age    >= ${minAge}
  ORDER BY u.name ASC
  LIMIT ${limit}
`);
```

### 6.2 SqlFragment

The return type of `sql` `` and all composition helpers. Only `SqlFragment` values are accepted by the query methods — raw strings generate a warning. The full type definition is in the "Special interpolations" subsection below — it includes `tvpValues` which the three-path interpolation design requires.

### 6.3 Special interpolations — three kinds of value the `sql` tag handles

The `sql` tag does not treat all interpolated values identically. When it encounters a `${value}` expression it inspects the value and takes one of three paths:

**Path 1 — Scalar value.** A string, number, boolean, `null`, `Date`, or any other plain value. The tag appends the value to `params[]` and replaces the interpolation site with a positional placeholder (`?` or `$N` depending on the adapter). This is the common case.

```typescript
sql`SELECT * FROM users WHERE active = ${true} AND age >= ${18}`
// text:   "SELECT * FROM users WHERE active = $1 AND age >= $2"
// params: [true, 18]
```

**Path 2 — Nested `SqlFragment`.** When the interpolated value has `__isSql: true`, the tag merges it inline — the nested `text` is spliced into the outer text at the interpolation site and the nested `params` are appended to the outer `params` in order. No additional placeholder is inserted.

```typescript
const filter = sql`deleted_at IS NULL AND active = ${true}`;
const query  = sql`SELECT * FROM users WHERE ${filter}`;
// text:   "SELECT * FROM users WHERE deleted_at IS NULL AND active = $1"
// params: [true]
```

**Path 3 — `TvpValue`.** When the interpolated value has `__isTvp: true` (the brand returned by `tvp()`), the tag does **not** place it in `params[]`. Instead it is extracted into a separate `tvpValues` array on the `SqlFragment`. The placeholder inserted into the text is a special sentinel — `__TVP_0__`, `__TVP_1__`, etc. — that the query runner detects and hands to the adapter's TVP strategy before execution. The adapter replaces the sentinel with the appropriate SQL expression for its strategy (`unnest(...)`, a temp table reference, or a native structured type reference) and provides the materialised rows.

```typescript
interface SqlFragment {
  readonly text:      string;
  readonly params:    readonly unknown[];     // scalar params only
  readonly tvpValues: readonly TvpValue[];   // extracted TVP objects
  readonly __isSql:   true;
}

interface TvpValue {
  readonly __isTvp:    true;
  readonly tableType:  TableType;
  readonly rows:       readonly Record<string, unknown>[];
}

// What the sql tag produces for a TVP interpolation:
sql`INSERT INTO users (name) SELECT name FROM ${tvp(UserTvp, rows)}`
// text:      "INSERT INTO users (name) SELECT name FROM __TVP_0__"
// params:    []
// tvpValues: [{ __isTvp: true, tableType: UserTvp, rows: [...] }]

// At execution time the query runner sees __TVP_0__ in the text,
// calls adapter.materializeTvp(tvpValues[0]), gets back the
// adapter-specific SQL expression, and substitutes it before sending.
```

This three-path design means the `sql` tag remains a pure function with no database knowledge — it only classifies and organises the interpolated values. The adapter-specific materialisation happens later in the pipeline, keeping the sql layer and the adapter layer cleanly separated.

### 6.4 Composition helpers

| Helper | Description |
|---|---|
| `sql` `` | Tagged template — primary authoring method |
| `sqlIf(cond, fragment)` | Includes fragment only if condition is true |
| `sqlJoin(fragments, sep)` | Joins fragments with a separator |
| `sqlIdentifier(value)` | Sanitizes and double-quotes an identifier |
| `sqlQualifiedIdentifier(schema, table)` | `"schema"."table"` |
| `sqlRaw(value)` | Explicit raw escape hatch — always logged as warning |

### 6.5 sqlRaw audit rule

Any use of `sqlRaw()` is logged at `warn` level. In `strictRaw: true` mode it throws in production. It is the only surface in the library that accepts unparameterized text.

### 6.6 SQL formatter

Before cache key generation and log output, SQL is normalized:

- Whitespace collapsed to single spaces
- Keywords uppercased (configurable)
- Consistent spacing around operators and commas
- Used for caching and logging only — not for query execution

---

## 7. Query API

### 7.1 The `connection` option — named connection in every query method

Every query method accepts a `connection` option that selects which named connection to use for that individual call. This is the inline alternative to `db.use("name")` — both produce identical results, but the `connection` option is more convenient when you want to specify the connection without chaining.

TypeScript infers the valid connection names from the config you passed to `createConnections()`. The `connection` field is typed as the exact union of your registered names — an unknown name is a compile-time error, not a runtime surprise.

```typescript
const db = createConnections({
  connections: {
    primary:   new PostgresAdapter({ url: "..." }),
    replica:   new PostgresAdapter({ url: "..." }),
    analytics: new PostgresAdapter({ url: "..." }),
  },
  default: "primary",
});

// ✅ TypeScript knows "replica" is valid
const users = await db.query<User>(sql`SELECT * FROM users`, {
  connection: "replica",
});

// ❌ TypeScript error — "reporting" is not a registered connection name
const data = await db.query<Report>(sql`SELECT * FROM reports`, {
  connection: "reporting",
  //          ^^^^^^^^^^^
  // TS2322: Type '"reporting"' is not assignable to
  //         type '"primary" | "replica" | "analytics"'
});
```

When `createDb()` is used (single connection), the `connection` option is not present at all — TypeScript completely omits it from the options type. You only see it when you used `createConnections()`.

### 7.2 Parameters — inside SqlFragment, with one documented exception

For every query method except `executeBatch`, parameters are embedded in the `SqlFragment` returned by the `sql` tagged template. Every `${value}` in a `sql` template is extracted into the fragment's `params` array and replaced with a placeholder. The query methods receive a `SqlFragment` and an optional options object — there is no separate params argument.

```typescript
// ✅ Right — params live inside the fragment
const users = await db.query<User>(
  sql`SELECT * FROM users WHERE active = ${true} AND age >= ${minAge}`,
  { connection: "replica" }
);

// The SqlFragment that was passed contains:
// { text: "SELECT * FROM users WHERE active = $1 AND age >= $2",
//   params: [true, 18], __isSql: true }

// ❌ Wrong — there is no separate params argument for single queries
const users = await db.query<User>(
  "SELECT * FROM users WHERE active = $1",
  [true]   // not a valid signature — raw strings cannot carry params safely
);
// Always use the sql`` tag. Raw strings are accepted with a warning
// but cannot carry parameters and will never be parameterized.
```

**The exception — `executeBatch`.** Batch execution takes the same SQL template and runs it once per row in the `rows[]` array. The template carries named param placeholders (`@userId`, `@type`) but no values — the values come from each row object in the batch. This is fundamentally different from a single query: there is no way to embed N sets of row values into a single `SqlFragment` at call time because the number of rows is not known until the call site. The `rows[]` argument is therefore a typed second argument, not a params array.

```typescript
// ✅ executeBatch — sql template + separate typed rows array
await db.executeBatch(
  sql`INSERT INTO events (user_id, type, ts) VALUES (@userId, @type, @ts)`,
  [
    { userId: 1, type: "login",  ts: new Date() },
    { userId: 2, type: "logout", ts: new Date() },
  ],
  { connection: "primary" }
);
// Internally: one prepared statement, bound and executed once per row.
// One round trip regardless of row count.

// The sql template here does NOT contain ${} interpolations for the values —
// @userId, @type, @ts are named placeholders resolved against each row object.
// This keeps the template reusable and the rows independently typed.
```

### 7.3 Chaining — `.use()` and query builder composition

Squn supports two forms of chaining. Understanding the difference matters because they have different semantics.

**Form 1 — `.use()` scoped chaining.** `.use("name")` returns a fully-featured `ScopedDb` instance. Every method available on `db` is available on the result. The connection name is fixed for the life of the scoped instance — it propagates through all operations including transactions and atomic blocks.

```typescript
// Single call — chain directly
const user = await db
  .use("replica")
  .querySingle<User>(sql`SELECT * FROM users WHERE id = ${id}`);

// Multi-call — save the scope and reuse across related queries
const replicaDb = db.use("replica");
const users  = await replicaDb.query<User>(sql`SELECT * FROM users`);
const orders = await replicaDb.query<Order>(sql`SELECT * FROM orders`);

// Transaction — the entire block is pinned to "billing"
await db.use("billing").transaction(async (tx) => {
  const inv = await tx.querySingle<Invoice>(sql`INSERT INTO invoices ... RETURNING *`);
  await tx.execute(sql`UPDATE billing_summary SET total = total + ${inv.total}`);
});

// Atomic block — the full BEGIN...COMMIT runs on "primary"
await db.use("primary").atomically(async (q) => {
  await q.execute(sql`INSERT INTO orders ...`);
  await q.execute(sql`UPDATE inventory ...`);
});
```

**Form 2 — Query builder chaining.** The query builder is a lazy description object. Every method on it returns the same builder — nothing executes until `db.run()` is called. `.connection()` slots naturally into the chain alongside `.select()`, `.where()`, and `.orderBy()`.

```typescript
// Connection name is baked into the query description
const q = queryBuilder(Users)
  .select("id", "name", "email")
  .where(Users.deletedAt.isNull())
  .whereIf(filter.minAge !== undefined, sql`age >= ${filter.minAge}`)
  .orderBy("name", "ASC")
  .paginate({ page: 1, pageSize: 20 })
  .connection("replica")   // ← part of the description, typed as Names
  .readonly();

// Execute — connection is resolved from the query description
const users = await db.run(q);

// Override at run time — per-call option wins over builder setting
const usersFromAnalytics = await db.run(q, { connection: "analytics" });
```

**Form 3 — Query builder composition.** Because the query builder is immutable and lazy, it is safe to share base queries and extend them. The connection name travels with the extension without affecting the base.

```typescript
// Base — shared, no connection specified
const activeUsers = queryBuilder(Users)
  .select("id", "name", "email")
  .where(Users.deletedAt.isNull())
  .where(Users.active.eq(true));

// Extend for replica
const replicaQ   = activeUsers.connection("replica").orderBy("name", "ASC");

// Extend for analytics — same base, different connection + pagination
const analyticsQ = activeUsers.connection("analytics");

// Both execute concurrently, each on its own connection
const [paged, all] = await Promise.all([
  db.run(replicaQ.paginate({ page: 1, pageSize: 20 })),
  db.run(analyticsQ),
]);
```

**Why post-call chaining is not supported.** You cannot write `db.query(sql).on("replica")` because `db.query()` is an `async` function that dispatches immediately and returns a `Promise`. By the time `.on()` would be called, the query has already run. Post-call chaining would be cosmetically fluent but semantically broken — the connection name arrives after the work is done. Use `.use("name")` before the call or the `connection` option inside the options object.

### 7.4 Connection precedence when chains combine

When `.use()`, `options.connection`, and a query builder `.connection()` are all present, the most specific one wins:

```
options.connection        ← per-call — highest priority
        ↓
.use("name") scope        ← connection-scoped
        ↓
queryBuilder.connection() ← baked into the query description
        ↓
forTenant() / withTenant  ← tenant context
        ↓
multiDb default           ← config-level — lowest priority
```

```typescript
const replicaDb = db.use("replica");
const q         = queryBuilder(Users).connection("analytics");

// options.connection wins — result from "billing"
const r1 = await replicaDb.run(q, { connection: "billing" });

// .use() wins over builder — result from "replica"
const r2 = await replicaDb.run(q);

// builder wins over default — result from "analytics"
const r3 = await db.run(q);

// default wins — result from "primary"
const r4 = await db.run(queryBuilder(Users).select("id"));
```

### 7.5 Core methods

```typescript
// All query methods accept an optional options object.
// When created via createConnections<Names>(), the connection field
// is typed as Names — the exact union of your registered connection names.

// Returns T[]
db.query<T>(sql, options?: QueryOptions<Names>)

// Returns T | null
db.queryFirst<T>(sql, options?: QueryOptions<Names>)

// Returns T — throws QueryError(NO_ROWS_FOUND) if 0 rows, throws if >1 row
db.querySingle<T>(sql, options?: QueryOptions<Names>)

// Returns a scalar value — first column of first row
db.queryScalar<T>(sql, options?: QueryOptions<Names>)

// Returns multiple result sets. PostgreSQL, MSSQL, and MySQL only.
// SQLite does not support multiple result sets from a single query —
// bun:sqlite executes only the first statement and silently ignores the rest.
// For SQLite, run separate db.query() calls instead.
// Overload 1 — no mappers, untyped result sets
db.queryMultiple(
  sql:      SqlFragment,
  options?: QueryOptions<Names>
): Promise<Row[][]>
// Overload 2 — with mappers, each result set typed by its mapper's return type
db.queryMultiple<Mappers extends ((rows: Row[]) => unknown[])[]>(
  sql:      SqlFragment,
  options:  QueryOptions<Names>,
  mappers:  Mappers
): Promise<{ [K in keyof Mappers]: ReturnType<Mappers[K]> }>

// Streaming — AsyncIterableIterator<T>, bounded memory
db.stream<T>(sql, options?: StreamOptions<Names>)

// Class mapping variants — return class instances instead of plain objects.
// Model must be registered via @Entity(schema) or defineMapper().
// Accept the same options as their plain counterparts including connection.
db.queryAs<Model>(ModelClass, sql, options?: QueryOptions<Names>)       // Model[]
db.queryFirstAs<Model>(ModelClass, sql, options?: QueryOptions<Names>)  // Model | null
db.querySingleAs<Model>(ModelClass, sql, options?: QueryOptions<Names>) // Model

// Execute a pre-built query builder query — connection resolved from
// the builder's .connection() then options.connection then default.
db.run<T>(query: QueryBuilder<T>, options?: QueryOptions<Names>)        // T[]

// Returns rows affected
db.execute(sql, options?: ExecuteOptions<Names>)

// Bulk — single prepared statement executed once per row.
// Row must be a plain object whose keys match the named placeholders in sql.
// One round trip regardless of row count.
db.executeBatch<Row extends Record<string, unknown>>(
  sql:      SqlFragment,
  rows:     Row[],
  options?: ExecuteOptions<Names>
): Promise<{ rowsAffected: number }>

// Typed insert — data is compile-time checked against the table's InferInsert shape.
// primaryKey and readonly columns are excluded from data automatically.
//
// When to use: appropriate for development, tests, simple CRUD applications,
// and teams that do not follow the stored-procedure permission model.
// For production systems that follow Principle 2 (least-privilege), the
// application user will not have INSERT permission on tables directly — use
// db.queryProc() / db.execProc() instead. See §1 "Database design philosophy".
db.insert<Table extends TableDefinition>(
  table:    Table,
  data:     InferInsert<Table>,
  options?: ExecuteOptions<Names>
): Promise<{ rowsAffected: number }>

// Typed update — data is compile-time checked against the table's InferUpdate shape.
// All columns are optional except the primary key. readonly columns are excluded.
//
// Same least-privilege note as db.insert() above.
db.update<Table extends TableDefinition>(
  table:    Table,
  data:     InferUpdate<Table>,
  options?: ExecuteOptions<Names>
): Promise<{ rowsAffected: number }>

// Stored procedure → T[]
db.queryProc<T>(procName: string, params?: Record<string, unknown>, options?: QueryOptions<Names>): Promise<T[]>

// Stored procedure with OUTPUT params — rows + resolved output values
// OutputParams is the shape of the OUTPUT parameters after execution
db.execProc<T, OutputParams extends Record<string, unknown>>(
  procName: string,
  params?: Record<string, unknown | ReturnType<typeof sql.output>>,
  options?: ExecuteOptions<Names>
): Promise<{ rows: T[]; output: OutputParams }>

// Atomic batch — all queries succeed or all roll back, no savepoints
db.atomically<T>(fn: (q: AtomicExecutor) => Promise<T>, options?: AtomicOptions<Names>)
```

### 7.6 Single item vs array — choosing the right method

The four read methods differ in how many rows they expect and what they do when that expectation is not met. Choosing the wrong one produces either a silent wrong result or an unexpected error.

```
db.query<T>()        → always T[]      — zero or more rows, always an array
db.queryFirst<T>()   → T | null        — first row or null; warn logged if >1 row returned
db.querySingle<T>()  → T              — exactly one row, throws on 0 or >1
db.queryScalar<T>()  → T              — first column of first row, throws on 0
```

**Decision rule — pick based on what you expect the database to return:**

| You expect | Use | Why |
|---|---|---|
| Zero or more rows (a list) | `query` | Returns `[]` for empty, never throws |
| Zero or one row (optional lookup) | `queryFirst` | Returns `null` safely when not found; warns if multiple rows returned |
| Exactly one row (required lookup by PK/unique) | `querySingle` | Throws if missing — surfaces the bug immediately |
| A single value (COUNT, SUM, MAX) | `queryScalar` | Returns the value directly, no unwrapping |

#### `db.query<T>()` — zero or more rows

Returns `T[]`. Always. Zero rows returns `[]`, never `null`. The right choice whenever the result is fundamentally a list — search results, filtered sets, reports, all rows in a table.

```typescript
// Zero rows → []  — never throws, never null
const users = await db.query<User>(sql`
  SELECT * FROM users WHERE role = ${"admin"}
`);
// users: User[]  — may be empty, always an array
```

#### `db.queryFirst<T>()` — optional single row

Returns `T | null`. Takes the first row if any exist, ignores the rest. Never throws. The right choice when the row may or may not exist and you want to handle both cases in calling code.

When more than one row is returned, `queryFirst` logs a `warn` entry (`SQUN_QUERY_FIRST_MULTIPLE_ROWS`) before returning the first row. This preserves the non-throwing contract while surfacing data integrity signals — a query that was expected to be selective but returns many rows is almost always a bug worth knowing about.

```typescript
// Row exists → User
// No rows   → null
// >1 rows   → first row returned; warn logged with rowCount and sql hash
const user = await db.queryFirst<User>(sql`
  SELECT * FROM users WHERE email = ${"alice@example.com"}
`);

if (user === null) {
  // handle not found
}
```

Use `queryFirst` when you genuinely do not care if there are multiple matches — for example reading the most recent entry ordered by `created_at DESC`. Do not use it as a lazy alternative to `querySingle` for primary key lookups — if a PK lookup returns null, that is almost always a bug and `querySingle` will surface it.

#### `db.querySingle<T>()` — required single row

Returns `T`. Throws `QueryError(NO_ROWS_FOUND)` if zero rows. Throws `QueryError(MULTIPLE_ROWS_FOUND)` if more than one row. The right choice for primary key lookups, unique constraint lookups, and `INSERT ... RETURNING` — anywhere the application logic requires exactly one row to exist.

```typescript
// Exactly 1 row  → User
// 0 rows         → throws QueryError(NO_ROWS_FOUND)
// >1 rows        → throws QueryError(MULTIPLE_ROWS_FOUND)
const user = await db.querySingle<User>(sql`
  SELECT * FROM users WHERE id = ${userId}
`);
// user: User — guaranteed, no null check needed
```

In lenient mode (`strict: false`), `querySingle` returns `null` instead of throwing on zero rows. `MULTIPLE_ROWS_FOUND` always throws regardless of mode — receiving multiple rows for a singular lookup is always a data integrity issue.

#### `db.queryScalar<T>()` — single value

Returns `T`. Extracts the first column of the first row. Throws `QueryError(NO_ROWS_FOUND)` if zero rows. The right choice for aggregate queries — `COUNT`, `SUM`, `MAX`, `MIN`, `EXISTS` — and any query that intentionally returns a single value.

```typescript
// Aggregate — always returns exactly one row with one column
const count = await db.queryScalar<number>(sql`
  SELECT COUNT(*) FROM users WHERE active = ${true}
`);
// count: number — COUNT(*) always returns a row, never null

const maxAge = await db.queryScalar<number | null>(sql`
  SELECT MAX(age) FROM users
`);
// Important: MAX() on an empty table returns ONE row containing NULL —
// not zero rows. queryScalar does NOT throw NO_ROWS_FOUND here.
// It returns null, which matches number | null.
// Always type nullable aggregates as queryScalar<T | null>.

const exists = await db.queryScalar<boolean>(sql`
  SELECT EXISTS (SELECT 1 FROM users WHERE email = ${"alice@example.com"})
`);
// exists: boolean — EXISTS always returns a row (true or false)
```

`queryScalar` does not validate that your SQL returns only one column — it simply reads `rows[0][0]`. If your query returns multiple columns, the extra columns are silently ignored. Always write your query to return exactly the column you need.

#### IN clause — querying for a list of items

Pass a TypeScript array as a parameter and Squn expands it into a valid `IN (...)` clause automatically. The values remain parameterized — the expansion creates N placeholders, not string concatenation.

```typescript
const ids = [1, 2, 3, 4, 5];

// Array → IN clause expansion
const users = await db.query<User>(sql`
  SELECT * FROM users WHERE id IN (${ids})
`);
// Produces: SELECT * FROM users WHERE id IN ($1, $2, $3, $4, $5)
// params:   [1, 2, 3, 4, 5]

// Works with strings
const roles = ["admin", "editor"];
const users = await db.query<User>(sql`
  SELECT * FROM users WHERE role IN (${roles})
`);

// NOT IN
const blockedIds = [10, 20, 30];
const users = await db.query<User>(sql`
  SELECT * FROM users WHERE id NOT IN (${blockedIds})
`);
```

**Empty array edge case.** An empty `IN ()` is invalid SQL in every database. When Squn detects an empty array it substitutes `IN (NULL)` — a condition that always evaluates to false, returning zero rows without throwing a SQL syntax error. This is the correct semantic: an empty exclusion set means nothing matches.

```typescript
const ids: number[] = [];

const users = await db.query<User>(sql`
  SELECT * FROM users WHERE id IN (${ids})
`);
// ids is empty → produces: WHERE id IN (NULL)
// returns: []  — zero rows, no error
```

**PostgreSQL `ANY()` operator.** For large arrays in PostgreSQL, `= ANY($1)` is more efficient than `IN (...)` because it passes the array as a single typed parameter rather than expanding it into N placeholders. Squn does not auto-select this — use it explicitly when you know you have large sets.

```typescript
const ids = [1, 2, 3, 4, 5];

// Passes array as a single $1 parameter — more efficient for large sets
const users = await db.query<User>(sql`
  SELECT * FROM users WHERE id = ANY(${ids})
`);
// Produces: WHERE id = ANY($1)
// params:   [[1, 2, 3, 4, 5]]   ← single array param
```

#### Native array columns — PostgreSQL

When a PostgreSQL column is an array type, `col.array()` maps it to and from a TypeScript array transparently.

```typescript
const Tags = defineTable("tags", {
  id:     col.int().primaryKey().readonly(),
  name:   col.nvarchar(100).notNull(),
  labels: col.array(col.nvarchar(100)).notNull(),   // text[] column → string[]
  scores: col.array(col.int()).nullable(),           // int[] column → number[] | null
});

type Tag = InferModel<typeof Tags>;
// → { id: number, name: string, labels: string[], scores: number[] | null }

// Insert — pass a TypeScript array directly
await db.insert(Tags, {
  name:   "colours",
  labels: ["red", "green", "blue"],
  scores: null,
});

// Query — labels comes back as string[]
const tag = await db.querySingle<Tag>(sql`SELECT * FROM tags WHERE id = ${1}`);
console.log(tag.labels);  // ["red", "green", "blue"]

// Array containment filter — PostgreSQL @> operator
const tags = await db.query<Tag>(sql`
  SELECT * FROM tags WHERE labels @> ARRAY['red']::text[]
`);

// Append to an array column
await db.execute(sql`
  UPDATE tags SET labels = labels || ${["yellow"]}
  WHERE id = ${1}
`);
```

#### JSON arrays — MySQL, SQLite, MSSQL

For databases without native array column types, use `col.json<T>()` to store and retrieve typed arrays as JSON. The type mapper handles `JSON.stringify` on write and `JSON.parse` on read automatically.

```typescript
const Posts = defineTable("posts", {
  id:   col.int().primaryKey().readonly(),

  // Basic — T is asserted after JSON.parse, not validated at runtime.
  // Safe when your application owns the database and the schema is stable.
  tags: col.json<string[]>().notNull(),

  // Validated — supply a type guard when the column may contain external
  // or evolving data. Squn calls the guard on every row read and throws
  // MappingError(TYPE_CONVERSION_FAILED) if it returns false.
  meta: col.json<Record<string, unknown>>({
    validate: (v): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && !Array.isArray(v),
  }).nullable(),
});

// Insert — TypeScript ensures correct shape at compile time
await db.insert(Posts, { tags: ["typescript", "bun", "sql"], meta: null });

// Query — tags comes back as string[] (asserted) or validated meta
const post = await db.querySingle<Post>(sql`SELECT * FROM posts WHERE id = ${1}`);
console.log(post.tags);  // string[]

// Filter using MySQL JSON_CONTAINS
const posts = await db.query<Post>(sql`
  SELECT * FROM posts WHERE JSON_CONTAINS(tags, ${'"typescript"'})
`);

// Filter using SQLite json_each
const posts = await db.query<Post>(sql`
  SELECT DISTINCT p.* FROM posts p, json_each(p.tags) t
  WHERE t.value = ${"typescript"}
`);
```

#### `db.queryMultiple()` — multiple result sets

Returns an array of typed row arrays — one per result set. Used when a stored procedure or a multi-statement query returns more than one result set in a single round trip. Requires `multiStatement: true` in options.

**Adapter support:**

| Adapter | Support |
|---|---|
| MSSQL | Native — stored procedures and multi-statement batches both supported |
| MySQL | Native — multiple result sets in a single query |
| PostgreSQL | Not natively supported — use separate `db.concurrent()` calls instead |
| SQLite | Not supported — use separate queries |

```typescript
// MSSQL stored procedure returning two result sets
const [orders, summary] = await db.queryMultiple(
  sql`EXEC sp_get_order_report @userId = ${userId}`,
  { multiStatement: true }
);
// orders:  Row[]  — first result set, untyped without mappers
// summary: Row[]  — second result set

// With explicit mappers — typed result sets
const [orders, summary] = await db.queryMultiple(
  sql`EXEC sp_get_order_report @userId = ${userId}`,
  { multiStatement: true },
  [
    (rows) => rows.map(mapOrder),    // mapper for first result set → Order[]
    (rows) => rows.map(mapSummary),  // mapper for second result set → Summary[]
  ]
);
// orders:  Order[]
// summary: Summary[]
```

#### `db.queryProc<T>()` and `db.execProc()` — stored procedures

`queryProc` executes a stored procedure and returns typed rows. `execProc` executes a stored procedure with OUTPUT parameters and returns both rows and the resolved output values.

```typescript
// queryProc — stored procedure returning rows
const users = await db.queryProc<User>(
  "sp_get_users_by_role",
  { roleId: 2, active: true },
  { connection: "primary" }
);
// users: User[]

// execProc — stored procedure with OUTPUT params
// TypeScript knows the shape of both the rows and the output params
const result = await db.execProc<Order, { newOrderId: number; status: string }>(
  "sp_create_order",
  {
    userId:     userId,
    total:      total,
    newOrderId: sql.output("int"),      // OUTPUT parameter — declared with sql.output()
    status:     sql.output("nvarchar"), // OUTPUT parameter
  },
  { connection: "primary" }
);

result.rows;             // Order[]  — rows returned by the procedure
result.output.newOrderId // number   — resolved OUTPUT value
result.output.status     // string   — resolved OUTPUT value
```

`sql.output(dbType)` is a marker that tells the adapter to declare the parameter as an OUTPUT parameter. The resolved values are available on `result.output` after the procedure executes. OUTPUT parameters are MSSQL-specific — other adapters throw `AdapterError(ADAPTER_NOT_SUPPORTED)` if OUTPUT params are passed.

**Proc name format.** The procedure name is passed as a plain string — never interpolated via `sql`. Squn validates it against the same identifier rules as `sqlIdentifier()` (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`, max 128 chars). Schema-qualified names use dot notation: `"dbo.sp_create_order"`.

```typescript
// Schema-qualified proc name
const result = await db.queryProc<User>("dbo.sp_get_users", { roleId: 2 });

// Invalid — will throw SecurityError(INVALID_IDENTIFIER) before execution
const result = await db.queryProc<User>("sp_; DROP TABLE users--", {});
```

### 7.7 Options types — how `connection` is typed

The generic parameter `Names` is the union of registered connection names. When you have no named connections (single `createDb()` call), `Names` is `never` and the `connection` field disappears from the type entirely. This means single-connection code is not cluttered with options that do not apply to it.

```typescript
// Base options shared by all query methods
interface BaseOptions<Names extends string = never> {
  // Which named connection to use for this call.
  // Only present when Names is not never (i.e. when createConnections() was used).
  // Autocompletes to exactly the names you registered — no others are valid.
  connection?: [Names] extends [never] ? never : Names;

  // Per-call timeout — overrides global and takes precedence over tx budget
  timeoutMs?: number | null;

  // Per-call readonly override — enforces that no writes are attempted
  readonly?: boolean;
}

// Query-specific options
interface QueryOptions<Names extends string = never> extends BaseOptions<Names> {
  // Allow this specific query to contain multiple statements
  // (normally banned by validateSql() for security reasons)
  multiStatement?: boolean;

  // Map rows to a class instance instead of a plain object
  mapTo?: new (...args: unknown[]) => unknown;

  // Set to false to bypass the query cache for this call.
  // The query will always be parsed fresh and the result will not be stored.
  // Has no effect on TVP queries — those are always bypassed regardless.
  cache?: boolean;
}

// Execute-specific options
interface ExecuteOptions<Names extends string = never> extends BaseOptions<Names> {
  // Return the full row after INSERT/UPDATE (uses RETURNING * or OUTPUT INSERTED.*)
  returning?: boolean;
}

// Stream-specific options
interface StreamOptions<Names extends string = never> extends BaseOptions<Names> {
  // How many rows to fetch from the cursor per round trip
  batchSize?: number;
}

// Atomic batch options
interface AtomicOptions<Names extends string = never> {
  // Which connection to open the BEGIN ... COMMIT block on.
  // Typed as the exact union of your registered connection names.
  // Absent entirely when using createDb() (single connection).
  connection?:   [Names] extends [never] ? never : Names;

  // Overrides the global transaction timeout for this block.
  timeoutMs?:    number;

  // Retry the whole block on transient infrastructure errors (connection
  // drops, pool timeouts). Does NOT retry on QueryError or MappingError —
  // those indicate bugs in the query itself, not transient conditions.
  retryOnError?: boolean;

  // Maximum number of retries when retryOnError is true. Default: 3.
  maxRetries?:   number;

  // Base delay in ms between retries, with random jitter added. Default: 50.
  retryDelay?:   number;
}
```

### 7.8 How TypeScript infers the connection names

The mechanism relies on deriving the connection names from the config's return type at `createConnections()` call time. The key insight is that TypeScript must infer the literal keys from the config object — this is done by capturing them in the return type, not in a generic default parameter (defaults are not inference targets in TypeScript and would widen to `string`).

```typescript
// Config captures the exact literal keys of the connections object.
// The return type derives Names directly from Config["connections"] —
// this is the correct pattern because TypeScript infers Config from
// the call-site argument, then the return type is computed from it.

function createConnections<Config extends MultiDbConfig>(
  config: Config
): MultiDb<keyof Config["connections"] & string> {
  // ...
}

// When you write:
const db = createConnections({
  connections: {
    primary:   new PostgresAdapter(...),
    replica:   new PostgresAdapter(...),
    analytics: new PostgresAdapter(...),
  },
  default: "primary",
});

// TypeScript infers:
// Config["connections"] = { primary: ..., replica: ..., analytics: ... }
// keyof Config["connections"] & string = "primary" | "replica" | "analytics"
// return type: MultiDb<"primary" | "replica" | "analytics">

// Every query method on db carries the inferred Names:
// db.query<T>(sql, options?: QueryOptions<"primary" | "replica" | "analytics">)
// So options.connection autocompletes to exactly those three values.

// ❌ Why a default type parameter does NOT work:
// function createConnections<Config extends MultiDbConfig,
//   Names extends string = keyof Config["connections"] & string>
// TypeScript does not infer Names from Config when Names has a default —
// it uses the default as a fallback, widening Names to `string`.
// This breaks the entire compile-time connection name guarantee.
```

### 7.9 Full usage example — options inline

```typescript
const db = createConnections({
  connections: {
    primary:   new PostgresAdapter({ url: process.env.SQUN_CONN_PRIMARY_URL }),
    replica:   new PostgresAdapter({ url: process.env.SQUN_CONN_REPLICA_URL }),
    analytics: new PostgresAdapter({ url: process.env.SQUN_CONN_ANALYTICS_URL }),
    billing:   new MssqlAdapter  ({ url: process.env.SQUN_CONN_BILLING_URL }),
  },
  default: "primary",
});

// ── query ──────────────────────────────────────────────────────────────────
// Uses default ("primary") — no connection option needed
const allUsers = await db.query<User>(sql`SELECT * FROM users`);

// Reads from replica — lighter load on primary
const activeUsers = await db.query<User>(
  sql`SELECT * FROM users WHERE active = ${true}`,
  { connection: "replica" }
);

// Analytics query — gets the 120s timeout configured for that connection
const report = await db.query<ReportRow>(
  sql`SELECT * FROM monthly_summary WHERE month = ${month}`,
  { connection: "analytics" }
);

// ── queryFirst ─────────────────────────────────────────────────────────────
const user = await db.queryFirst<User>(
  sql`SELECT * FROM users WHERE email = ${email}`,
  { connection: "replica" }
);

// ── querySingle ────────────────────────────────────────────────────────────
const invoice = await db.querySingle<Invoice>(
  sql`SELECT * FROM invoices WHERE id = ${invoiceId}`,
  { connection: "billing" }   // MSSQL billing database
);

// ── execute ────────────────────────────────────────────────────────────────
// Write — must use a writable connection (replica would throw ReadonlyViolationError)
await db.execute(
  sql`UPDATE users SET last_login = ${new Date()} WHERE id = ${id}`,
  { connection: "primary" }   // explicit — makes intent clear in code review
);

// ── executeBatch ───────────────────────────────────────────────────────────
await db.executeBatch(
  sql`INSERT INTO events (user_id, type, ts) VALUES (@userId, @type, @ts)`,
  events,
  { connection: "primary" }
);

// ── stream ─────────────────────────────────────────────────────────────────
for await (const row of db.stream<ReportRow>(
  sql`SELECT * FROM large_dataset`,
  { connection: "analytics", batchSize: 500 }
)) {
  await process(row);
}

// ── atomically ─────────────────────────────────────────────────────────────
await db.atomically(async (q) => {
  await q.execute(sql`INSERT INTO orders ...`);
  await q.execute(sql`UPDATE inventory ...`);
}, {
  connection: "primary"   // the entire atomic batch runs on this connection
});

// ── queryProc ──────────────────────────────────────────────────────────────
const results = await db.queryProc<ProcessedUser>(
  "sp_process_users",
  { roleId: 2 },
  { connection: "primary" }
);
```

### 7.10 Database design philosophy

Squn is capable of executing any SQL you write, including raw `INSERT`, `UPDATE`, and `DELETE` statements directly from application code. The library does not prevent this. But the recommended way to use Squn in a production system follows two principles that make the database layer significantly safer, more auditable, and easier to change.

#### Principle 1 — If it touches more than one query, it belongs in the database

When a business operation requires multiple queries — insert an order, update inventory, write an audit log — the right place for that logic is a stored procedure, not application code. Reasons:

- **Atomicity is guaranteed at the source.** A stored procedure runs inside a single database transaction by default. Application code that calls three separate queries and wraps them in `db.atomically()` is correct, but it requires the application to know that these three things must go together. The database does not enforce that — it only sees three queries.
- **The logic is not duplicated.** If two different services or two different code paths need to create an order, a stored procedure is called once. Application-level logic has to be copy-pasted or extracted into a shared module that both callers depend on.
- **Schema changes stay inside the database.** When a column is added or renamed, only the stored procedure changes. Application code that constructs the INSERT statement changes everywhere that statement appears.
- **Audit trail lives where the data lives.** A stored procedure can write to an audit table as part of the same transaction. Application code can forget to do this.

```typescript
// ❌ Three queries in application code — atomicity depends on the application
await db.atomically(async (q) => {
  await q.execute(sql`INSERT INTO orders ...`);
  await q.execute(sql`UPDATE inventory ...`);
  await q.execute(sql`INSERT INTO audit_log ...`);
});

// ✅ One stored proc call — atomicity is guaranteed by the database
const order = await db.queryProc<Order>("sp_create_order", {
  userId, sku, qty, total,
});
```

This does not mean application code never uses `db.atomically()` or `db.transaction()`. Simple reads, conditional logic that cannot live in the database, and test setups are all reasonable exceptions. The rule is for business operations — multi-step writes that represent a real-world event.

#### Principle 2 — Least-privilege: read + execute, no direct write access

The recommended database permission model for a Squn application:

```sql
-- Application user gets SELECT on all tables and EXECUTE on all procedures
-- No INSERT, UPDATE, DELETE directly on tables
GRANT SELECT  ON ALL TABLES     IN SCHEMA public TO app_user;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO app_user;

-- Read-only replica user gets SELECT only
GRANT SELECT  ON ALL TABLES     IN SCHEMA public TO app_readonly;

-- Migration user (used only by your migration tool, not by the app) gets everything
GRANT ALL     ON ALL TABLES     IN SCHEMA public TO app_migrator;
```

What this achieves:

- **The application cannot corrupt data directly.** If a query in your application accidentally constructs a bad UPDATE or an unguarded DELETE, the database will reject it at the permission level before any damage is done. The only writes that can reach the tables are those that go through your stored procedures.
- **Every write is explicitly modelled.** If you want to write to the `orders` table, you create `sp_create_order`. There is no "shortcut" path. Every write operation has a name, a signature, and a home.
- **Security surface is minimal.** Even if SQL injection somehow bypasses Squn's parameterization layer, an attacker with `SELECT + EXECUTE` access can read data and call procedures but cannot issue arbitrary `DROP`, `TRUNCATE`, or direct `UPDATE` statements.

Squn supports this model fully. `db.query()`, `db.queryFirst()`, `db.querySingle()`, `db.queryScalar()`, and `db.stream()` only need `SELECT`. `db.queryProc()` and `db.execProc()` need `EXECUTE`. Nothing in the core read path requires write access.

```typescript
// This application follows least-privilege — the connection only has
// SELECT and EXECUTE. All writes go through stored procedures.

const db = createDb(new PostgresAdapter({
  url:  process.env.SQUN_PG_URL,
  user: "app_user",  // SELECT + EXECUTE only — no INSERT/UPDATE/DELETE
}));

// ✅ Read — uses SELECT
const users = await db.query<User>(sql`SELECT * FROM users WHERE active = ${true}`);

// ✅ Write — uses EXECUTE via stored procedure
await db.execProc("sp_deactivate_user", { userId });

// ❌ This would fail at the database level if least-privilege is enforced —
// app_user does not have UPDATE permission
await db.execute(sql`UPDATE users SET active = ${false} WHERE id = ${userId}`);
```

**Squn does not enforce least-privilege itself** — it does not prevent you from calling `db.execute()` with a write statement. Enforcement is at the database level, which is where it belongs. Squn's role is to make the `queryProc` and `execProc` path first-class so that following this model feels natural, not like working around the library.

**SQLite exception.** SQLite does not support stored procedures or user-level permissions. The least-privilege model does not apply to SQLite — use it for development, testing, and embedded use cases where the application controls the database entirely.

---

## 8. Object and class mapping

### 8.1 Explicit mapper style — primary path

The explicit mapper is the recommended approach. It has no dependencies, no decorator support required, and full compatibility with the canonical tsconfig in the style guide. It is always available regardless of TypeScript version or project configuration.

```typescript
const UserMapper = defineMapper(UserModel, Users,
  (row) => new UserModel(row.id, row.name, row.email, row.age, row.createdAt)
);

const users = await db.queryAs(UserModel, sql`SELECT * FROM users`);
// users: UserModel[]  — full class instances with methods
```

`defineMapper()` registers the mapping function globally. Any subsequent call to `db.queryAs(UserModel, ...)` resolves the mapper from the registry automatically.

### 8.2 Class decorator style — opt-in

Decorators are supported as an alternative to `defineMapper()` for projects that prefer the annotation style. They require two things that the explicit mapper does not:

1. **TypeScript 5.0+ with `target: "ESNext"`** — TC39 stage 3 decorators, supported natively. No `experimentalDecorators` flag. The canonical tsconfig already satisfies this.
2. **`reflect-metadata` peer dependency** — installed separately and imported once at the application entry point. Squn does not bundle it.

```bash
# Install reflect-metadata as a runtime dependency
bun add reflect-metadata
```

```typescript
// Import once at your application entry point — before any decorated class is imported
import "reflect-metadata";
```

```typescript
@Entity(Users)
class UserModel {
  id!:        number;
  name!:      string;
  email!:     string;
  age!:       number | null;
  createdAt!: Date;

  getInitials() { return this.name.split(" ").map(w => w[0]).join(""); }
  isAdult()     { return this.age !== null && this.age >= 18; }
  get displayName() { return `${this.name} <${this.email}>`; }
}

const users = await db.queryAs(UserModel, sql`SELECT * FROM users`);
// users: UserModel[]  — full class instances with methods
```

`@Entity(Users)` is exactly equivalent to `defineMapper(UserModel, Users, ...)` with the property-injection construction strategy. It does not add hidden behaviour — it is syntactic sugar for registration. If `reflect-metadata` is not imported before the decorated class is loaded, Squn throws `SqunConfigError(CONFIG_INVALID_VALUE)` with a clear message at `queryAs()` time.

### 8.3 Construction strategies

| Strategy | How Squn builds the instance | Available via |
|---|---|---|
| Property injection | `Object.create()` then assign fields | `@Entity` decorator (default) or `defineMapper()` |
| Constructor | `new Model(...args)` in declared order | `defineMapper()` with `strategy: "constructor"` |
| Factory function | `factory(row)` — full control | `defineMapper()` with a factory function |
| Static `fromDb()` | Calls `Model.fromDb(row)` automatically | `defineMapper()` with `strategy: "static"` |

### 8.4 Nested class mapping

JOIN results are split and mapped into nested class instances via `splitOn` and `dedup`. Left join sides become `null` when no match exists. For related data that would previously have used lazy loading, write an explicit JOIN query or a separate query with an `IN` clause on the parent IDs — both are faster, auditable, and never produce N+1 queries.

### 8.5 Serialization

Classes may implement `toJSON()` for API serialization and `toDb()` for write operations. Squn calls `toDb()` automatically on `insert()` and `update()`.

---

## 9. Table valued parameters

### 9.1 Supported strategies per adapter

| Adapter | Strategy |
|---|---|
| MSSQL | Native `CREATE TYPE` structured parameter |
| PostgreSQL | `unnest()` with typed arrays |
| MySQL | Temporary table shim with bulk insert |
| SQLite | Temporary table or JSON shim |

### 9.2 Defining a TVP type

```typescript
const OrderTvp = new TableType("dbo.OrderTableType", {
  orderId: { dbType: "int" },
  total:   { dbType: "decimal", precision: 10, scale: 2 },
  status:  { dbType: "nvarchar", length: 50 },
});

type OrderRow = InferTableType<typeof OrderTvp>;
// → { orderId: number, total: number, status: string }
```

### 9.3 Passing a TVP to a stored procedure

The original and most common use — passing a set of rows into a stored procedure as a single typed parameter.

```typescript
await db.execute(sql`EXEC sp_bulk_insert_orders @orders`, {
  orders: tvp(OrderTvp, rows)   // type-checked against OrderRow
});
```

### 9.4 Direct INSERT via TVP

TVPs can be used as the source for a direct `INSERT INTO ... SELECT FROM` statement without a stored procedure. This is the recommended pattern for bulk inserts — one round trip regardless of how many rows are inserted.

```typescript
const UserTvp = new TableType("dbo.UserTableType", {
  name:  { dbType: "nvarchar", length: 100 },
  email: { dbType: "nvarchar", length: 255 },
  age:   { dbType: "int" },
});

const newUsers = [
  { name: "Alice",   email: "alice@example.com",   age: 30 },
  { name: "Bob",     email: "bob@example.com",     age: 25 },
  { name: "Charlie", email: "charlie@example.com", age: 35 },
];

await db.execute(sql`
  INSERT INTO users (name, email, age)
  SELECT name, email, age
  FROM ${tvp(UserTvp, newUsers)}
`);
```

The `tvp()` call inside a `sql` template is treated as a table source — the adapter materialises the rows using its native strategy and the surrounding SQL treats it like any other table expression.

### 9.5 INSERT with RETURNING / OUTPUT — get inserted rows back

When the database supports it, the inserted rows can be returned in the same statement.

```typescript
// PostgreSQL — RETURNING clause
const inserted = await db.query<User>(sql`
  INSERT INTO users (name, email, age)
  SELECT name, email, age
  FROM ${tvp(UserTvp, newUsers)}
  RETURNING *
`);
// inserted: User[] — fully mapped, includes auto-generated id and createdAt

// MSSQL — OUTPUT INSERTED
const inserted = await db.query<User>(sql`
  INSERT INTO users (name, email, age)
  OUTPUT INSERTED.*
  SELECT name, email, age
  FROM ${tvp(UserTvp, newUsers)}
`);
```

### 9.6 Upsert patterns

TVP INSERT works with every database's native upsert syntax. The TVP is the source — the conflict resolution is standard SQL.

```typescript
// PostgreSQL — ON CONFLICT DO UPDATE (upsert on email)
await db.execute(sql`
  INSERT INTO users (name, email, age)
  SELECT name, email, age
  FROM ${tvp(UserTvp, newUsers)}
  ON CONFLICT (email)
  DO UPDATE SET
    name = EXCLUDED.name,
    age  = EXCLUDED.age
`);

// PostgreSQL — ON CONFLICT DO NOTHING (ignore duplicates)
await db.execute(sql`
  INSERT INTO users (name, email, age)
  SELECT name, email, age
  FROM ${tvp(UserTvp, newUsers)}
  ON CONFLICT (email) DO NOTHING
`);

// MSSQL — MERGE (full upsert with insert and update branches)
await db.execute(sql`
  MERGE INTO users AS target
  USING ${tvp(UserTvp, newUsers)} AS source
    ON target.email = source.email
  WHEN MATCHED THEN
    UPDATE SET
      target.name = source.name,
      target.age  = source.age
  WHEN NOT MATCHED THEN
    INSERT (name, email, age)
    VALUES (source.name, source.email, source.age);
`);

// MySQL — INSERT ... ON DUPLICATE KEY UPDATE
await db.execute(sql`
  INSERT INTO users (name, email, age)
  SELECT name, email, age
  FROM ${tvp(UserTvp, newUsers)}
  ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    age  = VALUES(age)
`);
```

### 9.7 Conditional INSERT — filter rows at write time

```typescript
// Only insert rows that don't already exist — avoids explicit conflict handling
await db.execute(sql`
  INSERT INTO users (name, email, age)
  SELECT src.name, src.email, src.age
  FROM   ${tvp(UserTvp, newUsers)} AS src
  WHERE  NOT EXISTS (
    SELECT 1 FROM users u WHERE u.email = src.email
  )
`);
```

### 9.8 INSERT with JOIN — resolve foreign keys at write time

When your input data carries human-readable references (category names, status labels) but the target table expects IDs, the JOIN happens inside the INSERT rather than in application code.

```typescript
const ProductTvp = new TableType("dbo.ProductTableType", {
  sku:          { dbType: "nvarchar", length: 50 },
  name:         { dbType: "nvarchar", length: 200 },
  categoryName: { dbType: "nvarchar", length: 100 },  // name, not ID
  price:        { dbType: "decimal", precision: 10, scale: 2 },
});

const products = [
  { sku: "A1", name: "Widget", categoryName: "Hardware",    price: 9.99  },
  { sku: "B2", name: "Gadget", categoryName: "Electronics", price: 49.99 },
];

// JOIN resolves category names to IDs at INSERT time — no pre-fetching needed
await db.execute(sql`
  INSERT INTO products (sku, name, category_id, price)
  SELECT src.sku, src.name, c.id, src.price
  FROM   ${tvp(ProductTvp, products)} AS src
  JOIN   categories c ON c.name = src.categoryName
`);
```

### 9.9 Multi-table INSERT inside a transaction

TVP inserts compose naturally with `atomically()` — all tables are written atomically, TVP temp tables are scoped to the transaction, and a single rollback cleans everything up.

```typescript
const OrderTvp = new TableType("dbo.OrderTableType", {
  userId: { dbType: "int" },
  sku:    { dbType: "nvarchar", length: 50 },
  qty:    { dbType: "int" },
  total:  { dbType: "decimal", precision: 10, scale: 2 },
});

const AuditTvp = new TableType("dbo.AuditTableType", {
  orderId: { dbType: "int" },
  action:  { dbType: "nvarchar", length: 50 },
  ts:      { dbType: "datetime" },
});

await db.atomically(async (q) => {
  // Insert all orders in one round trip, get back the generated IDs
  const inserted = await q.query<Order>(sql`
    INSERT INTO orders (user_id, sku, qty, total)
    SELECT userId, sku, qty, total
    FROM ${tvp(OrderTvp, orders)}
    RETURNING id, user_id, total
  `);

  // Build audit rows from the returned IDs
  const auditRows = inserted.map(o => ({
    orderId: o.id,
    action:  "order_created",
    ts:      new Date(),
  }));

  // Insert audit log in one round trip
  await q.execute(sql`
    INSERT INTO audit_log (order_id, action, ts)
    SELECT orderId, action, ts
    FROM ${tvp(AuditTvp, auditRows)}
  `);
});
// All writes committed together or fully rolled back — temp tables cleaned up either way
```

### 9.10 TypeScript type safety on INSERT

The `tvp()` call is fully typed against the `TableType` schema. Type mismatches are compile-time errors — they never reach the database.

```typescript
type ProductRow = InferTableType<typeof ProductTvp>;
// → { sku: string, name: string, categoryName: string, price: number }

// TypeScript catches shape errors before execution
const bad = [
  { sku: 123, name: "Widget", categoryName: "Hardware", price: "free" }
  //   ^^^                                                       ^^^^^^
  // TS Error: number not assignable to string
  // TS Error: string not assignable to number
];

// ❌ Compile-time error — caught here, not at runtime
await db.execute(sql`
  INSERT INTO products (sku, name, category_id, price)
  SELECT src.sku, src.name, c.id, src.price
  FROM   ${tvp(ProductTvp, bad)} AS src
  JOIN   categories c ON c.name = src.categoryName
`);
```

### 9.11 How each adapter handles INSERT TVP

The SQL you write is identical across all adapters. What changes is how Squn materialises the TVP as a table source underneath.

| Adapter | Mechanism | Notes |
|---|---|---|
| MSSQL | Native structured parameter | Declared as a typed variable, zero temp objects created |
| PostgreSQL | `unnest()` with typed arrays | `FROM tvp(...)` rewrites to `FROM unnest($1::text[], $2::int[]) AS t(col1, col2)` |
| MySQL | Temp table shim | Three steps: CREATE, bulk INSERT VALUES, your query, DROP — all in `try/finally` |
| SQLite | Temp table shim | Same as MySQL — scoped to connection, guaranteed cleanup |

The temp-table adapters use a single multi-row `VALUES (…), (…), (…)` statement for the shim INSERT — not one INSERT per row. For PostgreSQL, large TVPs use the `COPY` protocol rather than `unnest()` when the row count exceeds a configurable threshold (`tvpCopyThreshold`, default 1000 rows).

### 9.12 TVP with transactions

Temp-table TVP strategies (SQLite, MySQL) are scoped to the current connection automatically. When called inside a `db.transaction()` or `db.atomically()` block, the temp table is created, used, and dropped within the same connection and the same transactional scope — if the transaction rolls back, the temp table is cleaned up as part of the rollback.

When called outside a transaction, the temp table is created, used, and explicitly dropped by Squn in a `try/finally` block on the same acquired pool connection. If the query itself fails after the temp table is created, Squn still drops it before releasing the connection. Temp table names include the connection ID and a monotonic counter to prevent collisions across concurrent calls on separate connections.

```
# Temp table name format: _squn_tvp_{connId}_{counter}
# e.g. _squn_tvp_conn_8f3a2c_001
```

If the process crashes between temp table creation and cleanup, the table remains until the database session ends or the connection is closed — which the pool's `destroy` lifecycle handles automatically.

---

## 10. Transactions

Squn provides two distinct transaction APIs designed for different levels of complexity. The rule for choosing between them is simple: reach for `db.atomically()` when you just need a guarantee that a group of queries all land together. Reach for `db.transaction()` when you need control over what happens if only part of the work fails.

### 10.1 When to use which

| Need | Use |
|---|---|
| All queries succeed or all roll back, no partial recovery needed | `db.atomically()` |
| Partial rollback to an intermediate checkpoint | `db.transaction()` with savepoints |
| Specific isolation level | `db.transaction()` |
| Nested transactional logic composed from multiple functions | `db.transaction()` |
| Simple fire-and-forget batch in everyday application code | `db.atomically()` |

### 10.2 Atomic batch — `db.atomically()`

The simplest and most common transaction pattern. A plain `BEGIN … COMMIT` wrapper — no state machine, no savepoints, no nesting. The callback receives a narrow `AtomicExecutor` that exposes only query and execute methods. If any query throws, the entire batch is rolled back automatically.

```typescript
// All three writes land together or none of them do
const newOrder = await db.atomically(async (q) => {
  const order = await q.querySingle<Order>(sql`
    INSERT INTO orders (user_id, total)
    VALUES (${userId}, ${total})
    RETURNING *
  `);

  await q.execute(sql`
    UPDATE inventory SET reserved = reserved + ${qty}
    WHERE sku = ${sku}
  `);

  await q.execute(sql`
    INSERT INTO audit_log (action, ts)
    VALUES (${"order_placed"}, ${new Date()})
  `);

  return order;   // typed return value — available after commit
});

console.log(newOrder.id);   // Order — fully typed
```

The `AtomicExecutor` interface is intentionally narrower than `db.*`. It deliberately omits `transaction()`, `savepoint()`, and `stream()` — the absence of these methods is a design signal, not an oversight. If you find yourself wanting them, you have outgrown `atomically` and should use `db.transaction()`.

```typescript
interface AtomicExecutor {
  query<T>(sql: SqlFragment, options?: QueryOptions): Promise<T[]>;
  queryFirst<T>(sql: SqlFragment, options?: QueryOptions): Promise<T | null>;
  querySingle<T>(sql: SqlFragment, options?: QueryOptions): Promise<T>;
  queryScalar<T>(sql: SqlFragment, options?: QueryOptions): Promise<T>;
  execute(sql: SqlFragment, options?: ExecuteOptions): Promise<{ rowsAffected: number }>;
  executeBatch<Row extends Record<string, unknown>>(sql: SqlFragment, rows: Row[], options?: ExecuteOptions): Promise<{ rowsAffected: number }>;
}
```

Options available on `db.atomically()`:

```typescript
// Names is the union of registered connection names from createConnections().
// When using createDb() (single connection), Names is never and connection is absent.
interface AtomicOptions<Names extends string = never> {
  // Which connection to open the BEGIN ... COMMIT block on.
  // Typed as the exact union of your registered connection names.
  connection?:   [Names] extends [never] ? never : Names;

  // Overrides the global transaction timeout for this block.
  timeoutMs?:    number;

  // Retry the whole block on transient infrastructure errors (connection
  // drops, pool timeouts). Does NOT retry on QueryError or MappingError —
  // those indicate bugs in the query itself, not transient conditions.
  retryOnError?: boolean;

  // Maximum number of retries when retryOnError is true. Default: 3.
  maxRetries?:   number;

  // Base delay in ms between retries, with random jitter added. Default: 50.
  retryDelay?:   number;
}
```

Nesting `db.atomically()` inside another `atomically` or inside `db.transaction()` throws `AtomicNestingError` immediately. This is because `atomically` acquires its own connection from the pool — if called inside an existing transaction, it would run on a different connection and therefore not be part of the outer transaction, creating a silent correctness bug.

### 10.3 Full transaction — `db.transaction()`

Use when you need savepoints, isolation levels, or composable nested transactions.

```typescript
// Style 1 — scoped closure (recommended)
await db.transaction(async (tx) => {
  await tx.execute(sql`INSERT INTO orders ...`);
  await tx.execute(sql`UPDATE inventory ...`);
  // clean return → COMMIT, any throw → ROLLBACK
});

// Style 2 — manual control
const tx = await db.beginTransaction();
try {
  await tx.execute(sql`...`);
  await tx.commit();
} catch {
  await tx.rollback();
  throw;
}

// Style 3 — savepoints for partial rollback
await db.transaction(async (tx) => {
  await tx.execute(sql`INSERT INTO orders ...`);

  const sp = await tx.savepoint("after_order");
  try {
    await tx.execute(sql`UPDATE inventory ...`);
  } catch {
    await sp.rollback();              // undo only back to savepoint
    await tx.execute(sql`INSERT INTO failed_ops ...`); // compensating action
  }
  // outer tx still commits with the order intact
});
```

### 10.4 Nested transactions and savepoints

Nested `tx.transaction()` calls become savepoints automatically — Squn generates names as `squn_sp_{txId}_{depth}`. A rollback inside a nested block only undoes work since the last savepoint, not the entire outer transaction.

### 10.5 Transaction state machine

Every `db.transaction()` call tracks state explicitly. Any operation called on a non-ACTIVE transaction throws `TransactionError(TX_ALREADY_CLOSED)` immediately rather than sending invalid SQL to the database.

```
ACTIVE → COMMITTED
       → ROLLED_BACK
       → TIMED_OUT
       → FAILED
```

`db.atomically()` does not use this state machine — its lifecycle is managed internally by `runAtomically()` and is not exposed to the callback.

### 10.6 Deadlock retry

```typescript
{
  retryOnDeadlock:    true,
  deadlockRetries:    3,
  deadlockRetryDelay: 100,  // ms, with random jitter
}
```

Deadlock detection is adapter-specific — MSSQL error 1205, PostgreSQL code `40P01`, MySQL 1213, SQLite `SQLITE_BUSY`. The entire transaction block is re-executed on each retry, so transaction callbacks must be idempotent when deadlock retry is enabled.

### 10.7 Isolation levels

Isolation levels are available on `db.transaction()` only. `db.atomically()` always uses the connection default, which keeps its implementation simple and avoids surprising behaviour from implicit locking.

```typescript
await db.transaction(async (tx) => { ... }, {
  isolation: "READ COMMITTED"     // default
  // "READ UNCOMMITTED" | "REPEATABLE READ" | "SERIALIZABLE" | "SNAPSHOT" (MSSQL)
});
```

SQLite only supports `SERIALIZABLE`. Squn warns if a different level is requested on SQLite.

---

## 11. Connection pool

### 11.1 Pool behaviour

- Every `db.query()`, `db.execute()`, and `db.transaction()` acquires a connection from the pool, uses it, and releases it back.
- Transactions **pin** a connection for their entire duration.
- SQLite uses no pool — it is in-process and single-connection.

### 11.2 Connection lifecycle

```
CREATED → IDLE → ACQUIRED → IDLE → ACQUIRED
                     ↓
               health check → DEAD → destroy → replenish
```

### 11.3 Configuration

```typescript
pool: {
  min:                    2,
  max:                    10,
  acquireTimeoutMs:       5_000,
  idleTimeoutMs:          30_000,
  createTimeoutMs:        5_000,
  destroyTimeoutMs:       1_000,
  healthCheckIntervalMs:  30_000,
  maxConnectionAge:       3_600_000,
  maxUseCount:            10_000,
  reapIntervalMs:         1_000,
  maxQueueSize:           100,
  propagateCreateError:   true,
  onConnect, onAcquire, onRelease, onDestroy, onError,
}
```

### 11.4 Pool stats

```typescript
const stats = db.pool.stats();
// { total, idle, acquired, waiting, min, max,
//   totalCreated, totalDestroyed, totalAcquired,
//   avgAcquireMs, avgIdleMs, avgUseMs }
```

### 11.5 Graceful shutdown

```typescript
await db.pool.drain({ timeoutMs: 30_000 });
// Stops new acquires, waits for in-flight queries, closes all connections
```

---

## 12. Timeout system

### 12.1 Timeout levels

| Level | Config key | Description |
|---|---|---|
| Connect | `timeouts.connect` | Initial connection / reconnect |
| Acquire | `timeouts.acquire` | Wait for pool connection |
| Query | `timeouts.query` | Per-query deadline |
| Transaction | `timeouts.transaction` | Entire transaction wall-clock |
| Idle | `timeouts.idle` | Close idle pool connections |
| Stream | `timeouts.stream` | Null by default — streams run until done |

### 12.2 Precedence chain

```
per-call option
      ↓
transaction budget remaining
      ↓
operation-level global (timeouts.query)
      ↓
global default
      ↓
null (no timeout)
```

### 12.3 Transaction budget

A `TransactionClock` tracks wall-clock elapsed time across all awaits inside a transaction. Each child query receives at most the remaining budget. This prevents individual queries from outliving their transaction.

### 12.4 Per-call override

```typescript
// timeoutMs is a field inside the options object — not a separate argument
await db.query<User>(sql`SELECT * FROM heavy_report`, { timeoutMs: 120_000 });
await db.transaction(async (tx) => { ... }, { timeoutMs: 15_000 });
```

### 12.5 Cancellation

All timeouts are implemented via `AbortController`. Timers are always cleared in `finally` blocks — no leaks.

---

## 13. Readonly support

### 13.1 Readonly levels

| Level | Compile-time | Runtime | How to enable |
|---|---|---|---|
| Column `.readonly()` | Excluded from Insert/Update types | Stripped before SQL | Schema definition |
| `InferReadonlyModel<T>` | All fields `readonly` | — | Type utility |
| `@Readonly()` class | Returns `Readonly<T>` | `Object.freeze()` | Decorator |
| Query `{ readonly: true }` | Returns `Readonly<T>[]` | — | Per-call option |
| Connection `readonly: true` | — | Throws before any write | `createDb` config |
| Transaction `readonly: true` | — | Throws before any write | Per-transaction option |

### 13.2 Readonly connection

```typescript
const replica = createDb(new PostgresAdapter(config), {
  readonly: true,
  readonlyStrategy: "strict",   // "strict" | "warn"
  // "strict" — throws ReadonlyViolationError before any write SQL is sent (default)
  // "warn"   — logs a warning and allows the write (for gradual migration only)
  //
  // There is no "silent" mode. Silently discarding writes is never safe —
  // if you need to conditionally suppress writes, do it explicitly in application code.
});
```

Write operations throw `ReadonlyViolationError(SQUN_READONLY_001)` before any SQL is sent.

### 13.3 Primary + replica routing

`createRouter()` is a convenience wrapper over `createConnections()` group routing. It exists to cover the most common multi-connection case — one writable primary and one or more read replicas — with minimal configuration. Internally it creates a `ConnectionGroup` with `write: "primary"` and `read: ["replica"]`. For more than two connections or non-standard routing rules, use `createConnections()` directly.

```typescript
// Convenience wrapper — one writer, one reader
const db = createRouter({
  write: createDb(new PostgresAdapter(primaryConfig)),
  read:  createDb(new PostgresAdapter(replicaConfig), { readonly: true }),
});
// Reads → replica, writes → primary, transactions → primary always

// Equivalent full form via createConnections()
const db = createConnections({
  connections: {
    primary: new PostgresAdapter(primaryConfig),
    replica: new PostgresAdapter(replicaConfig),
  },
  default: "primary",
  groups: {
    default: group({ write: "primary", read: ["replica"], readMode: "round-robin" }),
  },
});
```

Use `createRouter()` when you have one primary and one replica. Use `createConnections()` when you have more connections, mixed adapters, or need failover groups.

---

## 14. Authentication

### 14.1 Supported auth types

| Type | Adapters | Description |
|---|---|---|
| `userpass` | All | Username and password |
| `windows` | MSSQL only | Current Windows process identity or explicit domain\\user |
| `windows-upn` | MSSQL only | UPN format — user@domain.com + password |
| `connection-string` | All | Auth embedded in the connection URL |
| `azure-ad` | MSSQL only | Service principal or Managed Identity |

### 14.2 Username + password validation

- Username: `/^[a-zA-Z0-9_\-\.\\@]+$/` — any deviation throws `SqunConfigError`
- Password: must not contain `;`, `{`, `}`, `"`, `'` — connection string delimiters
- Production warnings: connecting as `root`, `sa`, or `postgres` superuser

### 14.3 Windows auth formats

- Domain user: `DOMAIN\username` — validated against `/^[a-zA-Z0-9_\-\.]+\\[a-zA-Z0-9_\-\.]+$/`
- UPN: `user@domain.com` — validated against `/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/`
- No credentials: uses current process Windows identity (Integrated Security)

### 14.4 Azure AD

- Tenant ID and Client ID validated as GUIDs
- Requires either `clientSecret` or `managedIdentity: true`
- Managed Identity requires no secrets — safe for Azure-hosted services

### 14.5 Password masking

Passwords are never written to logs. `maskConnectionString()` strips passwords from URLs and key=value style connection strings using `SQUN_REGEX.PASSWORD_IN_URL` before any log output.

---

## 15. Security and injection prevention

### 15.1 Five defence layers

1. **Parameterization** — `sql` `` never concatenates values into SQL text. `${value}` always becomes a placeholder. This applies to every query in the library regardless of how it is constructed.

2. **Type validation** — param values are checked against expected column types before execution, but only where schema context is available. This covers three surfaces: `db.insert(table, data)` and `db.update(table, data)` where the `defineTable()` schema is explicit, and `db.executeBatch()` where the rows array is typed against the template. Raw `sql` template queries (`db.query(sql`...`)`) carry no schema context — Squn cannot know the intended type of each interpolated value and does not attempt to validate them. TypeScript's own type system is the validation layer for those call sites.

3. **Identifier sanitization** — `sqlIdentifier()` strips invalid chars, validates against `/^[a-zA-Z_][a-zA-Z0-9_]*$/`, and double-quotes all identifiers. Applies to any dynamic identifier passed through `sqlIdentifier()` or `sqlQualifiedIdentifier()`.

4. **`sqlRaw()` audit log** — every use is logged as `warn`. Throws `SecurityError` when injection patterns of `critical` or `high` severity are detected in the raw value.

5. **Injection detection** — regex patterns checked on all `sqlRaw()` values. Never applied to parameterized values — those are structurally safe by construction.

### 15.2 Regex-based injection detection

All patterns live in `SQUN_REGEX` — a single exported constant, fully testable.

| Pattern | Regex key | Severity |
|---|---|---|
| Null byte | `NULL_BYTE` | critical |
| Stacked statements | `STACKED_STATEMENTS` | critical |
| MSSQL dangerous procs | `MSSQL_DANGEROUS` | critical |
| UNION injection | `UNION_INJECTION` | high |
| Tautology | `TAUTOLOGY` | high |
| Time-based injection | `TIME_BASED` | high |
| MySQL file ops | `MYSQL_DANGEROUS` | high |
| PostgreSQL system fns | `PG_DANGEROUS` | high |
| CHAR encoding | `CHAR_ENCODING` | medium |
| Hex encoding | `HEX_ENCODING` | medium |
| Block comments | `BLOCK_COMMENT` | low |
| Line comments | `LINE_COMMENT` | low |

Critical and high severity → throws `SecurityError`. Medium and low → logs warning.

### 15.3 Identifier validation rules

- Must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`
- Max 128 characters
- Reserved keywords auto-quoted with a warning
- Empty string throws immediately
- Invalid chars reported with exact set of offending characters

### 15.4 SQL structural validation

Before every query execution, `validateSql()` checks:

- Placeholder count matches param count
- No unbalanced parentheses
- No unresolved TVP sentinels (a `__TVP_N__` still present after materialisation means a bug in the TVP strategy)

> **Note — quote-balance check.** A naive odd-single-quote check is not applied to parameterized queries produced by the `sql` tag, because the SQL text on the parameterized path contains no quoted string literals — all string values have been extracted as params. Applying the check there would produce false positives on valid SQL that uses single quotes for other purposes (e.g. PostgreSQL type casts like `'active'::text`). The quote-balance check **is** applied inside `detectInjection()` on values passed to `sqlRaw()`, where quoted literals may appear in dynamic SQL fragments.
- No multiple statements (unless `multiStatement: true` is explicitly set)
- No write statements on readonly connections

### 15.5 Security config

```typescript
security: {
  detectInjection:  true,
  strictRaw:        false,   // true = throw on sqlRaw() in production
  validateSql:      true,
  warnOnRawString:  true,
  format: {
    normalizeKeywords:   true,
    normalizeWhitespace: true,
  }
}
```

---

## 16. Error handling

### 16.1 Error hierarchy

```
SqunError (base)
├── ConnectionError       SQUN_CONN_001–003
├── QueryError            SQUN_QUERY_001–004
├── MappingError          SQUN_MAP_001–003
├── ValidationError       SQUN_VAL_001–004
├── TransactionError      SQUN_TX_001–004
├── TimeoutError          SQUN_TIMEOUT_001–004
├── AdapterError          SQUN_ADPT_001–002
├── ReadonlyViolationError SQUN_READONLY_001–004
├── SecurityError         SQUN_SEC_001–007
├── SqunConfigError       SQUN_CFG_001–005
└── AuthError             SQUN_AUTH_001–005
```

`TransactionError` covers every transaction lifecycle failure. Each code identifies a distinct failure mode so catch blocks can distinguish them precisely:

```
SQUN_TX_001   TX_COMMIT_FAILED      — COMMIT statement was rejected by the database
SQUN_TX_002   TX_ROLLBACK_FAILED    — ROLLBACK statement failed (connection likely dead)
SQUN_TX_003   TX_ALREADY_CLOSED     — operation called on a COMMITTED or ROLLED_BACK transaction
SQUN_TX_004   TX_NESTING_FORBIDDEN  — thrown as AtomicNestingError when db.atomically()
                                      is called inside another atomically() or transaction()
```

`AtomicNestingError` is not a separate class — it is a `TransactionError` with code `SQUN_TX_004`. The named alias is exported for readable catch blocks:

```typescript
import { AtomicNestingError, ErrorCode } from "squn";

try {
  await db.atomically(async (q) => {
    // accidentally calling atomically inside atomically
    await db.atomically(async (inner) => { ... });
  });
} catch (err) {
  if (err instanceof AtomicNestingError) {
    // equivalent to:
    // err instanceof TransactionError && err.code === ErrorCode.TX_NESTING_FORBIDDEN
  }
}
```

`TimeoutError` covers every timeout surface in the library — query deadline exceeded, transaction budget exhausted, pool acquire timeout, and connection timeout. Each has its own code so catch blocks can distinguish them precisely:

```
SQUN_TIMEOUT_001   query timeout      — query exceeded timeoutMs
SQUN_TIMEOUT_002   transaction timeout — transaction exceeded its wall-clock budget
SQUN_TIMEOUT_003   acquire timeout    — could not acquire a pool connection in time
SQUN_TIMEOUT_004   connect timeout    — initial connection handshake timed out
```

`SQUN_QUERY_002` is now used exclusively for `QUERY_TIMEOUT` — a `QueryError` subcode indicating the query was cancelled by the database engine itself rather than by Squn's `AbortController`. These are distinct failure modes: `SQUN_TIMEOUT_001` means Squn cancelled the query from the application side; `SQUN_QUERY_002` means the database server rejected or cancelled it.

### 16.2 Every error carries

- `code` — `ErrorCode` enum value
- `context` — structured `ErrorContext` with `operation`, `sql` (sanitized), `paramKeys`, `adapter`, `table`, `column`, `tvpRowIndex`, `rowIndex`, `durationMs`, `txId`
- `traceId` — auto-generated per query, ties log entries together
- `timestamp` — `Date` of when the error occurred
- `cause` — original driver error, never exposed to callers directly

### 16.3 Raw driver errors are always wrapped

No `Bun.SQL`, `bun:sqlite`, or `mssql` error objects ever escape the adapter layer. `wrapError()` normalizes all driver errors into typed `SqunError` subclasses.

### 16.4 Strict vs lenient mode

| Scenario | Strict (default) | Lenient |
|---|---|---|
| DB returns null on `notNull` column | throws `MappingError` | warns, returns null |
| Unknown column in result | throws `MappingError` | warns, ignores |
| TVP row with extra fields | throws `ValidationError` | warns, strips |
| `querySingle` returns 0 rows | throws `QueryError` | returns null |

---

## 17. Logging

### 17.1 Logger interface

```typescript
interface SqunLogger {
  debug(entry: LogEntry): void;
  info (entry: LogEntry): void;
  warn (entry: LogEntry): void;
  error(entry: LogEntry): void;
  fatal(entry: LogEntry): void;
}
```

### 17.2 Log entry shape

Log entries are typed differently depending on whether they represent an error condition or a lifecycle event. The `code` field uses a union — `ErrorCode` for error/fatal entries, `EventCode` for debug/info/warn entries that are not errors.

```typescript
// Lifecycle event codes — used in debug and info log entries
// that have no associated error
enum EventCode {
  QUERY_START       = "SQUN_EVT_001",
  QUERY_END         = "SQUN_EVT_002",
  CONN_OPENED       = "SQUN_EVT_003",
  CONN_CLOSED       = "SQUN_EVT_004",
  TX_START          = "SQUN_EVT_005",
  TX_COMMIT         = "SQUN_EVT_006",
  TX_ROLLBACK       = "SQUN_EVT_007",
  SLOW_QUERY        = "SQUN_EVT_008",
  RAW_SQL_USED      = "SQUN_EVT_009",
  POOL_ACQUIRED     = "SQUN_EVT_010",
  POOL_RELEASED     = "SQUN_EVT_011",
  TVP_MATERIALISED  = "SQUN_EVT_012",
}

interface LogEntry {
  level:      "debug" | "info" | "warn" | "error" | "fatal";
  timestamp:  string;                    // ISO 8601
  traceId:    string;                    // ties query → result → error together
  code:       ErrorCode | EventCode;     // EventCode for lifecycle, ErrorCode for failures
  message:    string;
  context:    ErrorContext;
  stack?:     string;                    // error/fatal only
  cause?:     string;                    // driver error message, stringified
  durationMs?: number;                   // present on QUERY_END and SLOW_QUERY
  rowCount?:   number;                   // present on QUERY_END
}
```

`EventCode` is exported from `src/logging/logger.ts` alongside `SqunLogger`. It is a separate enum from `ErrorCode` so that log aggregators can distinguish between operational events and failures by inspecting the code prefix — `SQUN_EVT_*` vs `SQUN_*`.

### 17.3 Built-in loggers

| Logger | Use case |
|---|---|
| `consoleLogger` | Development — colorized, human-readable, pretty-printed |
| `jsonLogger` | Production — machine-parseable, pino-compatible |
| `noopLogger` | Tests — completely silent |

### 17.4 Log levels by event

| Level | Events |
|---|---|
| `debug` | Query start (sql + paramKeys + traceId), query end (durationMs + rowCount) |
| `info` | Connection opened/closed, transaction start/commit |
| `warn` | Slow query, nullable null, tx rollback, `sqlRaw()` used, suspicious patterns |
| `error` | Query failed, mapping failed, TVP validation failed |
| `fatal` | Connection lost mid-transaction, unrecoverable adapter failure |

### 17.5 Sensitive data rules

- Param values are **never** logged — keys only
- Passwords are **always** masked in connection strings and URLs
- `maskSensitive: true` is enforced in production — throws `SqunConfigError` if disabled

---

## 18. Configuration

### 18.1 Environment detection order

1. Explicit `env` option passed to `createDb()`
2. `BUN_ENV` environment variable
3. `NODE_ENV` environment variable
4. Falls back to `"development"`

### 18.2 Default presets

| Setting | Development | Production | Test |
|---|---|---|---|
| Logger | console pretty | JSON structured | silent |
| Log level | debug | warn | fatal |
| Pool min | 1 | 5 | 1 |
| Pool max | 5 | 20 | 1 |
| Query timeout | 60s | 30s | 5s |
| Transaction timeout | 120s | 60s | 10s |
| Slow query threshold | 200ms | 1000ms | — |
| Error verbosity | full | minimal | full |
| Mask sensitive | false | **true** | false |
| Cache max size | 100 entries | 1000 entries | **disabled** (0) |
| Cache TTL | 5 minutes | 1 hour | — |
| Cache max age | none | 24 hours | — |
| Cache reaper interval | 60s | 60s | — |
| Deadlock retries | 1 | 3 | 0 |
| Connection recycle | never | 1hr / 10k uses | never |

### 18.3 Default connection strings

| Env | PostgreSQL | MySQL | MSSQL | SQLite |
|---|---|---|---|---|
| development | `localhost:5432/squn_dev` | `localhost:3306/squn_dev` | `localhost:1433/squn_dev` | `./squn_dev.db` |
| test | `localhost:5432/squn_test` | `localhost:3306/squn_test` | `localhost:1433/squn_test` | `:memory:` |
| production | **throws if missing** | **throws if missing** | **throws if missing** | **throws if missing** |

### 18.4 Production guard

`validateProductionConfig()` is called synchronously inside `createDb()`. If any required connection field is missing it throws a `SqunConfigError` with a human-readable message listing all missing fields and the exact environment variables to set. The app never starts in an invalid state.

Production additionally throws if:
- SQLite `file` is set to `":memory:"`
- Connection URL is malformed
- Auth config is missing entirely

Production warns (does not throw) if:
- Host is `localhost` / `127.0.0.1`
- SSL is disabled
- Connecting as `root`, `sa`, or `postgres` superuser

### 18.5 Deep merge

User config is deep-merged on top of env defaults. Any field not provided by the user is filled from the preset. Partial overrides work at every nesting level.

### 18.6 Environment variable precedence

```
Explicit createDb() config
        ↓
SQUN_* environment variables
        ↓
.env.local
        ↓
.env.{environment}
        ↓
.env
        ↓
Environment defaults (localhost)
        ↓
Production → throws if still missing
```

### 18.7 TVP adapter configuration

PostgreSQL's TVP strategy upgrades automatically from `unnest()` to the `COPY` protocol when the row count exceeds a threshold. `COPY` is significantly faster for large batches — it streams rows to the server rather than encoding them as SQL values — but has slightly more overhead for small batches where `unnest()` is more efficient. The threshold is configurable per adapter instance.

```typescript
const db = createDb(new PostgresAdapter({
  url:              process.env.SQUN_PG_URL,
  tvpCopyThreshold: 500,              // rows — use COPY above this, unnest() below
                                      // default: 1000
                                      // set to 0 to always use COPY
                                      // set to Number.MAX_SAFE_INTEGER to always use unnest()
}));
```

> **Note — avoid `Infinity` in config files.** `Infinity` is a valid TypeScript literal but becomes `null` when serialised to JSON, silently changing the behaviour. Use `Number.MAX_SAFE_INTEGER` instead when you want to always use `unnest()`. This matters if your config is ever serialised by a build tool, deployment pipeline, or config validator.

The threshold applies only to the PostgreSQL adapter. All other adapters are not affected by this setting. The `tvpCopyThreshold` value is validated at `createDb()` time — a negative number throws `SqunConfigError`.

### 18.8 `defineTable()` and schema migration drift

`defineTable()` describes what your schema looks like to Squn at the TypeScript level. Your migration tool describes what your schema looks like at the database level. These are two separate descriptions of the same thing and they can drift apart silently — a migration adds a column that `defineTable()` does not know about, or vice versa.

Neither will cause an error at startup. The type system will be wrong in the direction of whichever description is behind. A `notNull` column added in a migration but missing from `defineTable()` will not appear in `InferInsert` — inserts will succeed at the TypeScript level but fail at the database level with a not-null constraint violation. A column in `defineTable()` that was dropped by a migration will appear in `InferModel` but return `undefined` at runtime.

The recommended mitigation is a code generation step that produces `defineTable()` calls directly from your migration schema. If your migration tool supports introspection (drizzle-kit, prisma-db-push, or a custom `pg_catalog` query), wire it into a `bun run scripts/generate-schema.ts` step that runs after any migration and produces the `src/db/schemas/*.ts` files. Treat generated schema files as artifacts — never hand-edit them.

If code generation is not feasible, add a schema validation check to your application startup that compares `defineTable()` column names against the live `information_schema` and throws `SqunConfigError` on mismatch. A startup failure is better than a silent runtime type error.

### 18.9 Multiple named connections

When a project requires more than one database connection — replicas, separate domain databases, multi-tenant setups — all connections are declared in one place and the library picks them up automatically. See section 24 for the full design.

```typescript
// All connections declared at startup — validated together
const db = createConnections({
  connections: {
    primary:   new PostgresAdapter({ url: process.env.SQUN_CONN_PRIMARY_URL }),
    replica:   new PostgresAdapter({ url: process.env.SQUN_CONN_REPLICA_URL, readonly: true }),
    analytics: new PostgresAdapter({ url: process.env.SQUN_CONN_ANALYTICS_URL, readonly: true }),
    billing:   new PostgresAdapter({ url: process.env.SQUN_CONN_BILLING_URL }),
  },
  default: "primary",
});

// Named access — fully typed
const users  = await db.use("replica").query<User>(sql`SELECT * FROM users`);
const report = await db.use("analytics").query<Report>(sql`SELECT * FROM reports`);
```

The env var naming convention for multiple connections follows `SQUN_CONN_{NAME}_{FIELD}` — for example `SQUN_CONN_PRIMARY_URL`, `SQUN_CONN_REPLICA_HOST`. A `squn.config.ts` file is also supported as a structured alternative to environment variables for projects with many connections.

---

## 19. Performance

### 19.1 Query cache

SQL text is normalised with `formatSql()` and hashed with `Bun.hash()` on first execution. The compiled query (parsed param map, normalised text) is stored in an LRU cache. Subsequent calls with the same SQL skip parsing entirely.

#### What is cached

The cache stores the compiled representation of a query — the normalised SQL text and the parsed parameter map. It does not cache query results. Two calls with the same SQL but different parameter values both hit the cache and both execute against the database; only the parsing step is skipped.

#### Cache configuration

```typescript
const db = createDb(new PostgresAdapter(config), {
  cache: {
    // Maximum number of compiled queries to keep in memory.
    // When maxSize is reached the least-recently-used entry is evicted.
    // Set to 0 to disable the cache entirely.
    maxSize: 1000,

    // How long a compiled query entry remains valid after its last use (ms).
    // A query that has not been called within this window is evicted on next access.
    // Set to null to disable TTL eviction — entries live until LRU evicts them.
    ttlMs: 3_600_000,   // 1 hour

    // How long a compiled query entry remains valid after it was first created,
    // regardless of how recently it was used (ms).
    // Useful in environments where the database schema may change at runtime.
    // Set to null to disable absolute expiry.
    maxAgeMs: null,

    // Check interval for background TTL reaping (ms).
    // The reaper runs on a timer and removes expired entries.
    // Set to null to disable background reaping — entries are evicted lazily on access.
    reaperIntervalMs: 60_000,   // 1 minute
  }
});
```

#### When entries are evicted

An entry is evicted in one of four ways:

| Trigger | When |
|---|---|
| LRU eviction | `maxSize` is reached and a new entry is inserted — oldest unused entry is dropped |
| TTL expiry (lazy) | The entry is accessed and `ttlMs` has passed since last use |
| Max-age expiry (lazy) | The entry is accessed and `maxAgeMs` has passed since creation |
| Background reaper | Runs every `reaperIntervalMs` and removes all expired entries proactively |

Lazy eviction means a stale entry is never served — it is checked and discarded on the access attempt, then re-parsed fresh. The background reaper prevents unbounded memory growth in long-running processes where many unique queries are executed over time.

#### Disabling the cache

```typescript
// Disable completely — all queries are parsed fresh every call
cache: { maxSize: 0 }

// Keep entries indefinitely (no TTL, no max-age) — LRU only
cache: { maxSize: 1000, ttlMs: null, maxAgeMs: null }
```

The test preset disables the cache by default (`maxSize: 0`). This ensures tests always parse fresh — a cached entry from a previous test cannot influence a later one.

#### Per-query cache opt-out

Individual queries can bypass the cache regardless of the global setting:

```typescript
// This query is always parsed fresh — useful during development or for
// highly dynamic SQL that would pollute the cache with unique entries
const users = await db.query<User>(
  sql`SELECT * FROM users WHERE id = ${userId}`,
  { cache: false }
);
```

#### TVP queries are always excluded

A `SqlFragment` that contains `tvpValues` (i.e. any query that interpolated a `tvp()` call) is never cached. TVP materialisation produces adapter-specific SQL that varies by row count, table type name, and adapter strategy — caching either the pre-materialisation text (`__TVP_0__`) or the post-materialisation text would produce incorrect results. TVP queries are always parsed fresh and the `cache: false` option has no effect on them.

```typescript
// Cached — same SQL text on every call
const users = await db.query<User>(sql`SELECT * FROM users WHERE id = ${userId}`);

// Not cached — contains a TvpValue, always parsed fresh regardless of settings
const result = await db.execute(sql`
  INSERT INTO users (name, email)
  SELECT name, email FROM ${tvp(UserTvp, rows)}
`);
```

Cache is keyed on the normalised SQL string — whitespace differences do not create duplicate entries. The cache stores the parsed parameter map and normalised text, not the final driver-bound statement.

### 19.2 Schema-driven row mapping

`compileMapper()` generates a specialized mapping function once from the schema at `defineTable()` time. Per-row mapping has zero runtime type inspection — all branching is resolved at compile time.

### 19.3 Allocation reduction

A `ParamBuffer` class pre-allocates a reusable array at pool initialization. Param binding fills this array in-place — no `new Array()` per query call.

### 19.4 TVP bulk insert

The temp-table TVP strategy (MySQL, SQLite) uses a single multi-row `VALUES (…), (…), (…)` statement — not one INSERT per row. PostgreSQL upgrades from `unnest()` to the `COPY` protocol when the row count exceeds `tvpCopyThreshold` (default 1000, configurable via `SQUN_PG_TVP_COPY_THRESHOLD` or the PostgreSQL adapter's `tvpCopyThreshold` option). `COPY` streams rows directly to the server and is significantly faster for large batches.

### 19.5 Async generator streaming

`db.stream()` fetches rows in configurable batches via a cursor. Backpressure is natural — the next batch is not fetched until the consumer awaits the next value. Memory usage is bounded by batch size regardless of result set size.

### 19.6 Performance targets

| Operation | Target overhead (squn only, excl. DB IO) |
|---|---|
| Cache hit query | < 0.1ms |
| Cache miss (first parse) | < 1ms |
| Row mapping (per 1000 rows) | < 2ms |
| TVP validation (per 1000 rows) | < 3ms |
| Param binding | < 0.05ms |

---

## 20. Project structure

```
squn/
├── src/
│   ├── sql/
│   │   ├── regex.ts               # SQUN_REGEX — all regex constants
│   │   ├── tag.ts                 # sql`` tagged template — scalar, SqlFragment, TvpValue paths
│   │   ├── fragment.ts            # SqlFragment type — text, params, tvpValues, __isSql
│   │   ├── helpers.ts             # sqlIf, sqlJoin, sqlRaw, sqlIdentifier, sql.output
│   │   ├── formatter.ts           # formatSql() — normalize for cache + logs
│   │   ├── validator.ts           # validateSql() — structural + safety checks
│   │   └── injection-detector.ts  # detectInjection() — regex pattern matching
│   ├── errors/
│   │   ├── codes.ts               # ErrorCode enum
│   │   ├── context.ts             # ErrorContext interface
│   │   ├── base.ts                # SqunError base class
│   │   ├── types.ts               # All error subclasses
│   │   └── wrap.ts                # wrapError() — driver error normalizer
│   ├── logging/
│   │   ├── logger.ts              # SqunLogger interface + LogEntry + EventCode
│   │   ├── console-logger.ts      # Pretty dev logger
│   │   ├── json-logger.ts         # Structured JSON prod logger
│   │   └── noop-logger.ts         # Silent test logger
│   ├── config/
│   │   ├── env-vars.ts            # SQUN_ENV_VARS constants
│   │   ├── defaults/
│   │   │   ├── connections.ts     # DEV + TEST localhost defaults
│   │   │   ├── development.ts     # Dev SqunConfig preset
│   │   │   ├── production.ts      # Prod SqunConfig preset
│   │   │   └── test.ts            # Test SqunConfig preset
│   │   ├── resolve.ts             # resolveConfig() — deep merge
│   │   ├── resolve-connection.ts  # Env var → localhost default chain
│   │   ├── validate.ts            # General config sanity checks
│   │   ├── validate-production.ts # Production guard — throws if missing
│   │   ├── url-validator.ts       # Connection URL validation + maskUrl()
│   │   └── types.ts               # SqunConfig, ConnectionConfig interfaces
│   ├── auth/
│   │   ├── types.ts               # AuthConfig union type
│   │   ├── validate-auth.ts       # Per-type validators with regex
│   │   ├── windows-auth.ts        # Windows / domain auth helpers
│   │   ├── azure-ad.ts            # Azure AD token acquisition
│   │   └── mask.ts                # maskConnectionString()
│   ├── cache/
│   │   ├── query-cache.ts         # Compiled query store (Bun.hash + WeakRef)
│   │   └── param-buffer.ts        # Reusable param binding buffer
│   ├── types/
│   │   ├── col.ts                 # col builder
│   │   ├── table.ts               # defineTable()
│   │   ├── primitives.ts          # Row, Params, ColumnValue, TableDefinition
│   │   ├── infer.ts               # InferModel, InferInsert, InferUpdate…
│   │   ├── keys.ts                # NullableKeys, ReadonlyKeys…
│   │   └── index.ts               # Public re-exports
│   ├── core/
│   │   ├── param-builder.ts       # @name → ?, $1 translation
│   │   ├── type-mapper.ts         # compileMapper()
│   │   ├── type-handler.ts        # TypeHandler interface + registry
│   │   ├── query-runner.ts        # Execute SQL, map rows, trace
│   │   ├── multi-mapper.ts        # JOIN split + dedup
│   │   └── tvp/
│   │       ├── table-type.ts      # TableType class
│   │       ├── tvp-builder.ts     # tvp() helper
│   │       └── strategies/
│   │           ├── native.ts      # MSSQL native TVP
│   │           ├── unnest.ts      # PostgreSQL unnest()
│   │           └── temp-table.ts  # SQLite + MySQL temp table
│   ├── adapters/
│   │   ├── base.ts                # IDbAdapter interface
│   │   ├── sqlite.ts              # bun:sqlite adapter
│   │   ├── postgres.ts            # Bun.SQL adapter for PostgreSQL (Bun ≥ 1.2)
│   │   ├── mysql.ts               # Bun.SQL adapter for MySQL (Bun ≥ 1.2)
│   │   └── mssql.ts               # mssql npm adapter + Windows auth
│   ├── pool/
│   │   ├── pool.ts                # ConnectionPool — MSSQL only
│   │   ├── connection.ts          # PooledConnection + state machine (MSSQL only)
│   │   ├── reaper.ts              # Background idle/dead reaper (MSSQL only)
│   │   ├── health.ts              # healthCheck() — MSSQL ping, Bun.SQL has its own
│   │   └── stats.ts               # PoolStats + rolling averages (MSSQL); Bun.SQL metrics facade for PG/MySQL
│   ├── async/
│   │   ├── timeout.ts             # resolveTimeout() + withTimeout()
│   │   ├── clock.ts               # TransactionClock
│   │   ├── cursor.ts              # AsyncIterableIterator cursor
│   │   ├── concurrent.ts          # db.concurrent(), db.race()
│   │   └── abort.ts               # AbortController helpers
│   ├── transaction/
│   │   ├── transaction.ts         # Transaction class + state machine
│   │   ├── atomic.ts              # AtomicBlock + runAtomically() — db.atomically()
│   │   ├── savepoint.ts           # Savepoint API
│   │   ├── deadlock.ts            # isDeadlock() + retry loop
│   │   └── isolation.ts           # Isolation level constants
│   ├── mapping/
│   │   ├── class-mapper.ts        # Class instance construction strategies
│   │   ├── nested-mapper.ts       # JOIN → nested class instances
│   │   ├── define-mapper.ts       # defineMapper() explicit registration
│   │   ├── mapper-registry.ts     # Global class → schema registry
│   │   └── decorators/
│   │       ├── entity.ts          # @Entity(schema)
│   │       └── validate.ts        # @NotNull, @Email, @Min, @Max
│   ├── readonly/
│   │   ├── guard.ts               # assertWritable()
│   │   ├── freeze.ts              # @Readonly decorator
│   │   ├── router.ts              # createRouter()
│   │   └── types.ts               # InferReadonlyModel, ReadonlyKeys
│   ├── connections/
│   │   ├── registry.ts            # ConnectionRegistry — holds all named db instances
│   │   ├── group.ts               # ConnectionGroup — replica set + routing rules
│   │   ├── failover.ts            # FailoverGroup — automatic standby promotion
│   │   ├── tenant-resolver.ts     # TenantResolver — fn-based connection selection
│   │   ├── config-file.ts         # squn.config.ts loader + validator
│   │   ├── env-loader.ts          # SQUN_CONN_{NAME}_* env var discovery
│   │   ├── resolve-connection.ts  # resolveConnection() — options.connection → Db lookup
│   │   └── types.ts               # ConnectionMap, MultiDb<Names>, QueryOptions<Names>, MultiDbConfig
│   ├── api/
│   │   ├── query.ts               # query, queryFirst, querySingle, stream…
│   │   ├── execute.ts             # execute, executeBatch, insert, update
│   │   ├── proc.ts                # queryProc, execProc
│   │   └── query-builder.ts       # queryBuilder()
│   ├── db.ts                      # createDb() — entry point
│   └── index.ts                   # All public exports
├── tests/
│   ├── unit/
│   │   ├── sql/
│   │   │   ├── regex.test.ts              # Every pattern in SQUN_REGEX tested individually
│   │   │   ├── tag.test.ts                # sql`` template — interpolation, nesting, edge cases
│   │   │   ├── fragment.test.ts           # SqlFragment composition + branding
│   │   │   ├── helpers.test.ts            # sqlIf, sqlJoin, sqlRaw, sqlIdentifier
│   │   │   ├── formatter.test.ts          # formatSql() normalization rules
│   │   │   ├── validator.test.ts          # validateSql() — structural checks
│   │   │   └── injection-detector.test.ts # Every injection pattern, severity levels
│   │   ├── errors/
│   │   │   ├── base.test.ts               # SqunError — toJSON(), toLog(), traceId
│   │   │   ├── types.test.ts              # Every error subclass, instanceof checks
│   │   │   └── wrap.test.ts               # wrapError() — driver error normalisation
│   │   ├── config/
│   │   │   ├── env-vars.test.ts           # SQUN_ENV_VARS constant coverage
│   │   │   ├── resolve.test.ts            # Deep merge — partial overrides, precedence
│   │   │   ├── resolve-connection.test.ts # Env var → localhost default chain
│   │   │   ├── validate.test.ts           # General config sanity checks
│   │   │   └── validate-production.test.ts# Every production guard path per adapter
│   │   ├── auth/
│   │   │   ├── validate-auth.test.ts      # All auth types, regex checks, error messages
│   │   │   └── mask.test.ts               # maskConnectionString() — URL + key=value
│   │   ├── cache/
│   │   │   ├── query-cache.test.ts        # Cache hit, miss, eviction, hash collisions
│   │   │   └── param-buffer.test.ts       # Buffer reuse, overflow, concurrent access
│   │   ├── types/
│   │   │   ├── col.test.ts                # Every col() modifier, chaining, type output
│   │   │   ├── table.test.ts              # defineTable() — schema shape, constraint reg
│   │   │   ├── infer.test.ts              # InferModel, InferInsert, InferUpdate shapes
│   │   │   └── keys.test.ts               # NullableKeys, ReadonlyKeys, MutableKeys
│   │   ├── core/
│   │   │   ├── param-builder.test.ts      # @name → ?, $1. IN expansion, edge cases
│   │   │   ├── type-mapper.test.ts        # compileMapper() — every column type
│   │   │   ├── type-handler.test.ts       # TypeHandler registry, async handlers
│   │   │   ├── multi-mapper.test.ts       # splitOn, dedup, nested object assembly
│   │   │   └── tvp/
│   │   │       ├── table-type.test.ts     # TableType schema, InferTableType
│   │   │       ├── tvp-builder.test.ts    # tvp() validation, schema mismatch errors
│   │   │       └── strategies/
│   │   │           ├── unnest.test.ts     # PostgreSQL unnest() query generation, COPY threshold
│   │   │           └── temp-table.test.ts # Temp table SQL generation, cleanup inside/outside tx
│   │   ├── async/
│   │   │   ├── timeout.test.ts            # resolveTimeout() — all precedence paths
│   │   │   └── clock.test.ts              # TransactionClock — elapsed, remaining, expired
│   │   ├── transaction/
│   │   │   ├── transaction.test.ts        # State machine transitions, invalid states
│   │   │   ├── atomic.test.ts             # atomically() — commit, rollback, retry, nesting ban
│   │   │   ├── savepoint.test.ts          # Savepoint naming, rollback scope
│   │   │   └── deadlock.test.ts           # isDeadlock() per adapter, retry backoff
│   │   ├── readonly/
│   │   │   ├── guard.test.ts              # assertWritable() — connection + tx level
│   │   │   └── freeze.test.ts             # @Readonly — Object.freeze, TS type output
│   │   ├── connections/
│   │   │   ├── registry.test.ts           # Named lookup, default fallback, unknown name error
│   │   │   ├── group.test.ts              # Replica routing, read/write dispatch
│   │   │   ├── failover.test.ts           # Primary failure → standby promotion, recovery
│   │   │   ├── tenant-resolver.test.ts    # Resolver fn called per query, caching
│   │   │   ├── config-file.test.ts        # squn.config.ts loading, validation, merging
│   │   │   ├── env-loader.test.ts         # SQUN_CONN_* discovery, partial overrides
│   │   │   ├── chaining.test.ts           # .use() → tx/atomic pinning, precedence rules
│   │   │   └── resolve-connection.test.ts # options.connection → registry lookup, precedence, CONN_UNKNOWN error
│   │   └── pool/
│   │       ├── pool.test.ts               # acquire, release, queue, drain
│   │       ├── connection.test.ts         # State machine, shouldRecycle
│   │       └── stats.test.ts              # Rolling averages, snapshot accuracy
│   ├── integration/
│   │   ├── sqlite/
│   │   │   ├── query.test.ts              # Real queries on :memory: SQLite
│   │   │   ├── transaction.test.ts        # Commit, rollback, atomically on SQLite
│   │   │   └── tvp.test.ts                # TVP INSERT, upsert, conditional, JOIN, multi-table, RETURNING
│   │   ├── connections/
│   │   │   ├── chaining.test.ts           # .use() chain + options.connection + query builder
│   │   │   ├── pool-under-load.test.ts    # Pool acquire/release under concurrent queries
│   │   │   └── failover.test.ts           # Simulated primary failure → standby promotion
│   │   └── shared/
│   │       └── adapter-contract.test.ts   # Shared test suite run against every adapter
│   ├── fixtures/
│   │   ├── schemas.ts                     # Shared defineTable() definitions for tests
│   │   ├── mock-adapter.ts                # In-memory IDbAdapter for unit tests
│   │   ├── mock-logger.ts                 # Capturing logger — records all entries
│   │   └── builders.ts                    # Test data factories (createUser, createOrder…)
│   └── helpers/
│       ├── assert-error.ts                # assertSqunError(err, code, contextShape)
│       ├── assert-log.ts                  # assertLogged(logger, level, codePattern)
│       └── sql-snapshot.ts                # SQL normalisation for snapshot assertions
├── .env.example                   # Documented template — all SQUN_* vars
├── package.json
├── tsconfig.json
└── README.md
```

---

## 21. Build plan

### 21.1 Phase 0 — Foundation (start here)

SQL authoring primitives, error hierarchy, logging, config system, production guard, query cache.

**Modules:** `sql/regex.ts`, `sql/tag.ts`, `sql/fragment.ts`, `sql/helpers.ts`, `sql/formatter.ts`, `sql/validator.ts`, `sql/injection-detector.ts`, `errors/*`, `logging/*`, `config/*`, `auth/*`, `cache/*`

**Tests:** `tests/unit/sql/*`, `tests/unit/errors/*`, `tests/unit/config/*`, `tests/unit/auth/*`, `tests/unit/cache/*`

**Rule:** Every other module imports from Phase 0. Nothing in Phase 0 imports from any other phase.

### 21.2 Phase 1 — Type system

`col()`, `defineTable()`, all infer utilities, key utilities.

**Dependency:** None — pure TypeScript, no runtime imports.

**Tests:** `tests/unit/types/*`

### 21.3 Phase 2 — Param builder + type mapping

Param translation, compiled row mapper, `TypeHandler` interface, `resolveTimeout()`, `TransactionClock`.

**Dependency:** Phase 0 (errors, logging), Phase 1 (types).

**Tests:** `tests/unit/core/param-builder.test.ts`, `tests/unit/core/type-mapper.test.ts`, `tests/unit/core/type-handler.test.ts`, `tests/unit/async/timeout.test.ts`, `tests/unit/async/clock.test.ts`

### 21.4 Phase 3 — Adapter layer + pool

`IDbAdapter` interface, all four adapters (`bun:sqlite`, `Bun.SQL` for PostgreSQL and MySQL, `mssql` for MSSQL), `ConnectionPool` (MSSQL only), `PooledConnection` state machine, health checker, reaper, stats.

**Dependency:** Phase 0, Phase 2.

**Tests:** `tests/unit/pool/*`, `tests/integration/sqlite/*`, `tests/integration/shared/adapter-contract.test.ts`

### 21.5 Phase 4 — Core query engine

Query runner, multi-mapper, TVP strategies, `Transaction` class and state machine, `AtomicBlock` and `runAtomically()`, savepoints, deadlock retry, class mapper, async cursor.

**Dependency:** Phase 0, Phase 1, Phase 2, Phase 3.

**Tests:** `tests/unit/core/multi-mapper.test.ts`, `tests/unit/core/tvp/*`, `tests/unit/transaction/*`

### 21.6 Phase 5 — Public API surface

`createDb()`, all `db.*` methods, `queryBuilder()`, readonly guard, primary/replica router, concurrent helpers, `index.ts` public exports, `createConnections()`, `ConnectionRegistry`, `ConnectionGroup`, `FailoverGroup`, `TenantResolver`, `squn.config.ts` loader.

**Dependency:** All previous phases.

**Tests:** `tests/unit/readonly/*`, `tests/unit/connections/*` — full integration test suite runs after this phase completes.

---

## 22. Environment variables

All environment variable names are exported from `SQUN_ENV_VARS` — a typed constant object. No magic strings anywhere in the library.

```
# Core
SQUN_ENV                   development | production | test

# PostgreSQL
SQUN_PG_URL                Full connection URL (takes priority over individual fields)
SQUN_PG_HOST               localhost
SQUN_PG_PORT               5432
SQUN_PG_DATABASE           squn_dev
SQUN_PG_USER               postgres
SQUN_PG_PASSWORD           (required in production)
SQUN_PG_SSL                true | false | require
SQUN_PG_TVP_COPY_THRESHOLD 1000   # row count above which COPY is used instead of unnest()

# MySQL
SQUN_MYSQL_URL
SQUN_MYSQL_HOST            localhost
SQUN_MYSQL_PORT            3306
SQUN_MYSQL_DATABASE        squn_dev
SQUN_MYSQL_USER            root
SQUN_MYSQL_PASSWORD        (required in production)

# MSSQL
SQUN_MSSQL_URL
SQUN_MSSQL_HOST            localhost
SQUN_MSSQL_PORT            1433
SQUN_MSSQL_DATABASE        squn_dev
SQUN_MSSQL_USER            sa
SQUN_MSSQL_PASSWORD        (required in production)
SQUN_MSSQL_AUTH_TYPE       userpass | windows | windows-upn | azure-ad
SQUN_MSSQL_DOMAIN          (optional — Windows domain)
SQUN_MSSQL_UPN             (for windows-upn type)

# SQLite
SQUN_SQLITE_FILE           ./squn_dev.db  (":memory:" not allowed in production)

# Azure AD (MSSQL cloud)
SQUN_AZURE_TENANT_ID
SQUN_AZURE_CLIENT_ID
SQUN_AZURE_CLIENT_SECRET
SQUN_AZURE_MANAGED_IDENTITY  true | false

# Pool
SQUN_POOL_MIN
SQUN_POOL_MAX

# Timeouts (ms)
SQUN_TIMEOUT_QUERY
SQUN_TIMEOUT_TX
SQUN_TIMEOUT_CONNECT
SQUN_TIMEOUT_ACQUIRE

# Logging
SQUN_LOG_LEVEL             debug | info | warn | error | fatal
SQUN_LOG_SLOW_QUERY_MS

# Query cache
SQUN_CACHE_MAX_SIZE        Max compiled query entries (0 = disabled). Default: 1000 in prod, 100 in dev, 0 in test
SQUN_CACHE_TTL_MS          TTL after last use in ms (omit = no TTL eviction). Default: 3600000 (1hr) in prod, 300000 (5min) in dev
SQUN_CACHE_MAX_AGE_MS      Absolute max age in ms regardless of use (omit = no max-age). Default: 86400000 (24hr) in prod
SQUN_CACHE_REAPER_MS       Background reaper interval in ms (omit = no background reaper). Default: 60000 (1min)
```

### 22.1 Multiple connection env var naming

When using `createConnections()`, each named connection follows the pattern `SQUN_CONN_{NAME}_{FIELD}` where `NAME` is the uppercase connection name and `FIELD` is the same suffix used by single-connection env vars. The library discovers all `SQUN_CONN_*` prefixes at startup and auto-registers them.

```
# Named connection — primary (read-write)
SQUN_CONN_PRIMARY_URL=postgresql://app_user:password@primary.db:5432/myapp
SQUN_CONN_PRIMARY_POOL_MIN=2
SQUN_CONN_PRIMARY_POOL_MAX=20

# Named connection — replica (read-only, larger pool)
SQUN_CONN_REPLICA_URL=postgresql://app_user:password@replica.db:5432/myapp
SQUN_CONN_REPLICA_READONLY=true
SQUN_CONN_REPLICA_POOL_MAX=50

# Named connection — analytics (separate database, longer timeout)
SQUN_CONN_ANALYTICS_URL=postgresql://analytics_user:password@analytics.db:5432/analytics
SQUN_CONN_ANALYTICS_READONLY=true
SQUN_CONN_ANALYTICS_TIMEOUT_QUERY=120000

# Named connection — billing (MSSQL, separate domain database)
SQUN_CONN_BILLING_URL=mssql://billing_svc:password@billing.db:1433/billing

# Which named connection db.query() uses when no .use() is specified
SQUN_DEFAULT_CONNECTION=primary
```

The `SQUN_CONN_{NAME}_*` pattern supports every field suffix that the single-connection pattern supports: `URL`, `HOST`, `PORT`, `DATABASE`, `USER`, `PASSWORD`, `SSL`, `POOL_MIN`, `POOL_MAX`, `TIMEOUT_QUERY`, `TIMEOUT_TX`, `READONLY`, `AUTH_TYPE`, `DOMAIN`, and `UPN`.

---

## 23. Unit testing

### 23.1 Philosophy

Tests in Squn are written as specifications, not verification. Every test describes a concrete behaviour in plain language, sets up the minimum context needed to observe it, asserts the exact outcome, and — when testing failure paths — asserts the exact error code, message shape, and context fields. A developer who has never seen the source code should be able to read the test suite and fully understand what the library does.

Verbose means each test is self-contained and self-describing. No shared mutable state between tests. No vague assertions like `expect(result).toBeTruthy()`. No test names like `"works correctly"` or `"handles errors"`. Every test name is a precise statement of fact, written in the form `"[unit] [condition] [expected outcome]"`.

### 23.2 Test runner

Squn uses `bun test` — the native Bun test runner. No Jest, no Vitest, no extra dependencies. `bun test` is Jest-API-compatible, runs TypeScript natively, and requires zero configuration.

```bash
# Run all unit tests
bun test tests/unit

# Run a single module
bun test tests/unit/sql/injection-detector.test.ts

# Run with verbose output — every test name printed
bun test --verbose

# Run with coverage
bun test --coverage

# Watch mode during development
bun test --watch tests/unit/transaction/atomic.test.ts
```

### 23.3 Naming convention

Every `describe` block names the module or function under test. Every `it` block names the exact condition and expected outcome as a full sentence. The full test path reads as a specification.

```typescript
describe("sql/injection-detector — detectInjection()", () => {
  describe("when the input contains a UNION SELECT pattern", () => {
    it("returns detected: true with severity 'high' and pattern 'union_injection'", () => { ... });
    it("matches regardless of whitespace between UNION and SELECT", () => { ... });
    it("matches UNION ALL SELECT as well as plain UNION SELECT", () => { ... });
  });

  describe("when the input is clean SQL with no suspicious patterns", () => {
    it("returns detected: false", () => { ... });
    it("does not flag SQL containing the word 'union' in a column name", () => { ... });
  });
});
```

The rule is: if you remove all the code from the test and read only the `describe` + `it` labels top to bottom, you should have a complete specification of the module's behaviour. This is what "verbose" means in practice.

### 23.4 Assertion style

Every assertion must be specific. When testing error paths, always assert the error class, the error code, and the relevant context fields — never just that an error was thrown.

```typescript
// Too vague — tells us nothing useful when it fails
expect(() => sqlIdentifier("")).toThrow();

// Correct — fully specified, fails with a meaningful message
expect(() => sqlIdentifier("")).toThrow(SecurityError);
expect(() => sqlIdentifier("")).toThrow(
  expect.objectContaining({
    code:    ErrorCode.INVALID_IDENTIFIER,
    message: expect.stringContaining("empty string"),
  })
);

// For structured context assertions, use the custom helper
assertSqunError(
  () => sqlIdentifier("users; DROP TABLE users"),
  SecurityError,
  ErrorCode.INVALID_IDENTIFIER,
  {
    invalidChars:  expect.arrayContaining([";", " "]),
    hint:          expect.stringContaining("letters, digits, and underscores"),
  }
);
```

When testing that a value is returned correctly, assert the full shape — not just one field:

```typescript
// Too shallow — only checks one field
expect(result.text).toBe("SELECT * FROM users");

// Correct — full shape asserted
expect(result).toEqual({
  text:    "SELECT * FROM users WHERE id = $1",
  params:  [42],
  __isSql: true,
});
```

### 23.5 Mock strategy

Unit tests never touch a real database. The `MockAdapter` in `tests/fixtures/mock-adapter.ts` is the only dependency used for database-touching unit tests. It implements `IDbAdapter` fully, stores queries in a log, and lets tests configure the responses it returns.

```typescript
// tests/fixtures/mock-adapter.ts
export class MockAdapter implements IDbAdapter {
  readonly type = "sqlite" as const;
  readonly log:  QueryLogEntry[]  = [];
  private queue: MockResponse[]   = [];

  // Configure what the adapter will return for the next N calls
  willReturn(rows: Row[]): this {
    this.queue.push({ type: "rows", rows });
    return this;
  }

  willThrow(error: Error): this {
    this.queue.push({ type: "error", error });
    return this;
  }

  async query(sql: string, params: unknown[]): Promise<Row[]> {
    this.log.push({ sql, params, at: Date.now() });
    const next = this.queue.shift();
    if (!next) return [];
    if (next.type === "error") throw next.error;
    return next.rows;
  }

  // ... execute, beginTransaction, ping, close follow same pattern

  // Convenience — assert what SQL was sent without caring about params
  assertQueried(pattern: string | RegExp): void {
    const match = this.log.some(e =>
      typeof pattern === "string"
        ? e.sql.includes(pattern)
        : pattern.test(e.sql)
    );
    expect(match).toBe(true);
  }

  // Assert nothing was sent to the database at all
  assertQuiet(): void {
    expect(this.log).toHaveLength(0);
  }
}
```

The `MockLogger` records all log entries and exposes assertion helpers so tests can verify that warnings and errors were logged correctly:

```typescript
// tests/fixtures/mock-logger.ts
export class MockLogger implements ILogger {
  readonly entries: LogEntry[] = [];

  debug(e: LogEntry) { this.entries.push(e); }
  info (e: LogEntry) { this.entries.push(e); }
  warn (e: LogEntry) { this.entries.push(e); }
  error(e: LogEntry) { this.entries.push(e); }
  fatal(e: LogEntry) { this.entries.push(e); }

  assertLogged(level: LogLevel, code: ErrorCode): void {
    const found = this.entries.find(e => e.level === level && e.code === code);
    expect(found).toBeDefined();
  }

  assertNotLogged(level: LogLevel): void {
    const found = this.entries.find(e => e.level === level);
    expect(found).toBeUndefined();
  }

  assertLogCount(level: LogLevel, count: number): void {
    const found = this.entries.filter(e => e.level === level);
    expect(found).toHaveLength(count);
  }
}
```

### 23.6 Test structure per module

What follows is the required test coverage specification for every module. Each entry defines the `describe` blocks that must exist and the categories of `it` cases that must be present within them. The cases listed are minimum requirements — additional edge cases are always welcome.

---

#### `sql/regex.test.ts`

Each regex in `SQUN_REGEX` gets its own `describe` block. Every block must contain at least one positive match case, one negative (non-match) case, and one boundary case.

```typescript
describe("SQUN_REGEX.VALID_IDENTIFIER", () => {
  it("matches a simple lowercase identifier");
  it("matches an identifier starting with an underscore");
  it("matches an identifier containing digits after the first character");
  it("does not match an identifier starting with a digit");
  it("does not match an identifier containing a hyphen");
  it("does not match an empty string");
  it("does not match an identifier containing a space");
  it("does not match a semicolon-injected string");
});

describe("SQUN_REGEX.WINDOWS_DOMAIN_USER", () => {
  it("matches DOMAIN\\username");
  it("matches a domain with hyphens");
  it("does not match a username with no domain prefix");
  it("does not match a double backslash");
  it("does not match a UPN format — that belongs to WINDOWS_UPN");
});

describe("SQUN_REGEX.STACKED_STATEMENTS", () => {
  it("matches '; DROP TABLE users'");
  it("matches '; SELECT * FROM secrets'");
  it("matches regardless of whitespace around the semicolon");
  it("does not match a semicolon at the very end with no following keyword");
  it("does not match a semicolon inside a quoted string value");
});

// ... one describe block per regex in SQUN_REGEX
```

---

#### `sql/injection-detector.test.ts`

```typescript
describe("sql/injection-detector — detectInjection()", () => {
  describe("null byte injection", () => {
    it("detects a null byte in the middle of a string with severity 'critical'");
    it("detects a null byte at the start of a string");
    it("does not flag clean input with no null bytes");
  });

  describe("stacked statement injection", () => {
    it("detects '; DROP TABLE users' with severity 'critical'");
    it("detects '; SELECT 1' with severity 'critical'");
    it("detects '; DELETE FROM users' with severity 'critical'");
    it("does not flag a semicolon with no following SQL keyword");
    it("does not flag a plain sentence ending with a semicolon");
  });

  describe("UNION injection", () => {
    it("detects 'UNION SELECT' with severity 'high'");
    it("detects 'UNION ALL SELECT' with severity 'high'");
    it("detects lowercase 'union select' with severity 'high'");
    it("does not flag the word 'union' in a column alias");
  });

  describe("tautology injection", () => {
    it("detects \\' OR \\'1\\'=\\'1' with severity 'high'");
    it("detects \\' OR 1=1 with severity 'high'");
    it("detects \\' OR true with severity 'high'");
    it("does not flag a legitimate OR clause with typed params");
  });

  describe("time-based blind injection", () => {
    it("detects WAITFOR DELAY with severity 'high'");
    it("detects SLEEP() with severity 'high'");
    it("detects PG_SLEEP() with severity 'high'");
    it("detects BENCHMARK() with severity 'high'");
  });

  describe("MSSQL dangerous procedures", () => {
    it("detects xp_cmdshell with severity 'critical'");
    it("detects sp_oacreate with severity 'critical'");
    it("detects OPENROWSET with severity 'critical'");
  });

  describe("comment injection", () => {
    it("detects a line comment '--' with severity 'low'");
    it("detects a block comment '/* */' with severity 'low'");
    it("detects a MySQL hash comment '#' with severity 'low'");
  });

  describe("obfuscation patterns", () => {
    it("detects CHAR() encoding with severity 'medium'");
    it("detects hex encoding 0x41 with severity 'medium'");
  });

  describe("clean input", () => {
    it("returns detected: false for a normal SELECT statement");
    it("returns detected: false for a parameterized INSERT");
    it("returns detected: false for an empty string");
  });
});
```

---

#### `sql/tag.test.ts`

```typescript
describe("sql — tagged template literal", () => {
  describe("interpolation — scalar values (path 1)", () => {
    it("replaces a single interpolated value with a placeholder and captures the value in params");
    it("replaces multiple interpolated values with sequential placeholders in order");
    it("handles a string value correctly");
    it("handles a number value correctly");
    it("handles a boolean value correctly");
    it("handles a null value correctly");
    it("handles a Date value correctly");
    it("handles an array value correctly for IN clause expansion");
  });

  describe("interpolation — nested SqlFragment (path 2)", () => {
    it("merges a nested fragment's text inline at the interpolation site");
    it("appends a nested fragment's params to the outer params array in correct order");
    it("handles three levels of nesting without losing params");
    it("does not insert an extra placeholder when merging a nested fragment");
  });

  describe("interpolation — TvpValue (path 3)", () => {
    it("places a __TVP_0__ sentinel in the text when a TvpValue is interpolated");
    it("does not add the TvpValue to the params array");
    it("places the TvpValue in the tvpValues array at the correct index");
    it("increments the sentinel index for each additional TVP in the same template");
    it("handles a template with both scalar params and a TVP — sentinel index matches tvpValues index");
  });

  describe("SqlFragment brand", () => {
    it("returns an object with __isSql: true");
    it("returns an object with a tvpValues array — empty when no TVP was interpolated");
  });

  describe("whitespace normalisation", () => {
    it("preserves SQL structure — does not collapse intentional newlines in text");
    it("the formatter normalises whitespace for cache keys separately from the raw text");
  });
});
```

---

#### `config/validate-production.test.ts`

```typescript
describe("config/validate-production — validateProductionConfig()", () => {
  describe("PostgreSQL adapter in production", () => {
    it("throws SqunConfigError when no config is provided at all");
    it("throws SqunConfigError listing the missing host field when only password is set");
    it("throws SqunConfigError listing the missing password field when only host is set");
    it("throws SqunConfigError when a full URL is provided but is malformed");
    it("does not throw when a valid full URL is provided");
    it("does not throw when all individual fields are provided");
    it("logs a warning when host is localhost but does not throw");
    it("logs a warning when SSL is disabled but does not throw");
    it("logs a warning when user is 'postgres' but does not throw");
    it("the error message includes the exact SQUN_PG_URL env var name as a quick fix hint");
  });

  describe("SQLite adapter in production", () => {
    it("throws SqunConfigError when file is ':memory:'");
    it("throws SqunConfigError when file is not provided");
    it("does not throw when file is an absolute path");
    it("logs a warning when file is a relative path");
    it("the error message includes the SQUN_SQLITE_FILE env var name");
  });

  describe("in development environment", () => {
    it("does not run any production validation");
    it("does not throw even with empty config");
  });

  describe("in test environment", () => {
    it("does not run any production validation");
    it("does not throw even with :memory: SQLite config");
  });
});
```

---

#### `transaction/atomic.test.ts`

```typescript
describe("transaction/atomic — db.atomically()", () => {
  describe("successful batch", () => {
    it("sends BEGIN before any query in the callback");
    it("sends COMMIT after the callback returns successfully");
    it("returns the value returned by the callback");
    it("executes all queries in the callback on the same pinned connection");
    it("releases the connection back to the pool after commit");
  });

  describe("rollback on failure", () => {
    it("sends ROLLBACK when the callback throws a QueryError");
    it("sends ROLLBACK when the callback throws a MappingError");
    it("sends ROLLBACK when the callback throws a plain Error");
    it("rethrows the original error after rolling back");
    it("releases the connection back to the pool after rollback");
    it("does not send COMMIT if ROLLBACK was sent");
  });

  describe("retry on transient errors", () => {
    it("retries the entire callback when retryOnError is true and a ConnectionError is thrown");
    it("retries up to maxRetries times before giving up");
    it("does not retry on QueryError even when retryOnError is true");
    it("does not retry on MappingError even when retryOnError is true");
    it("waits retryDelay ms between retries");
    it("throws the last error after all retries are exhausted");
  });

  describe("nesting prohibition", () => {
    it("throws AtomicNestingError when db.atomically() is called inside another atomically()");
    it("the AtomicExecutor interface does not expose a transaction() method");
    it("the AtomicExecutor interface does not expose a savepoint() method");
    it("the AtomicExecutor interface does not expose a stream() method");
  });

  describe("timeout", () => {
    it("throws TimeoutError when the callback exceeds the per-call timeoutMs");
    it("rolls back before throwing the TimeoutError");
    it("falls back to the global transaction timeout when no per-call timeout is set");
  });

  describe("logging", () => {
    it("logs 'atomic block started' at debug level with a traceId");
    it("logs 'atomic block committed' at info level after successful commit");
    it("logs 'atomic block rolled back' at warn level with the cause after rollback");
    it("logs 'atomic block rollback failed' at fatal level if ROLLBACK itself throws");
    it("all log entries for a single atomically() call share the same traceId");
  });
});
```

---

#### `transaction/transaction.test.ts`

```typescript
describe("transaction/transaction — Transaction state machine", () => {
  describe("valid state transitions", () => {
    it("starts in ACTIVE state");
    it("transitions to COMMITTED after commit()");
    it("transitions to ROLLED_BACK after rollback()");
    it("transitions to TIMED_OUT when the transaction clock expires");
    it("transitions to FAILED when an unrecoverable adapter error occurs");
  });

  describe("invalid state transitions", () => {
    it("throws TX_ALREADY_CLOSED when execute() is called on a COMMITTED transaction");
    it("throws TX_ALREADY_CLOSED when query() is called on a ROLLED_BACK transaction");
    it("throws TX_ALREADY_CLOSED when commit() is called twice");
    it("throws TX_ALREADY_CLOSED when rollback() is called on a COMMITTED transaction");
  });

  describe("savepoints", () => {
    it("generates a savepoint name in the format squn_sp_{txId}_{depth}");
    it("increments depth for each nested savepoint");
    it("rolling back a savepoint does not affect operations before the savepoint");
    it("releasing a savepoint removes it from the stack");
  });
});
```

---

#### `async/timeout.test.ts`

```typescript
describe("async/timeout — resolveTimeout()", () => {
  describe("precedence — call-site option", () => {
    it("uses the call-site timeoutMs when it is shorter than the global");
    it("uses the global timeout when the call-site timeoutMs is longer");
    it("uses the call-site timeoutMs when no global is set");
    it("uses null when neither call-site nor global is set");
    it("honours an explicit null call-site option to disable timeout even when global is set");
  });

  describe("precedence — transaction budget", () => {
    it("caps the resolved timeout to the remaining transaction budget");
    it("uses the remaining budget when no call-site or global timeout is set");
    it("uses the remaining budget when it is shorter than both call-site and global");
    it("uses the call-site timeout when it is shorter than the remaining budget");
  });

  describe("withTimeout()", () => {
    it("resolves normally when the operation completes before the deadline");
    it("throws TimeoutError when the operation exceeds the deadline");
    it("clears the timer in the finally block whether the operation succeeds or fails");
    it("cancels the operation via AbortController when the deadline is exceeded");
  });
});
```

---

#### `core/param-builder.test.ts`

```typescript
describe("core/param-builder — buildParams()", () => {
  describe("named parameter translation for SQLite and MySQL (? style)", () => {
    it("replaces @name with ? and extracts the value in order");
    it("handles multiple different named params in a single query");
    it("handles the same param name appearing twice — uses the value once");
    it("throws ValidationError when a param in the SQL has no matching key in the object");
    it("throws ValidationError when extra keys are in the object but not in the SQL");
  });

  describe("named parameter translation for PostgreSQL ($1 style)", () => {
    it("replaces @name with $1, $2… in order of appearance");
    it("the same @name appearing twice produces the same $N index both times");
  });

  describe("IN clause expansion", () => {
    it("expands an array value to (?, ?, ?) with one placeholder per element");
    it("expands an empty array to (NULL) to avoid invalid SQL");
    it("expands correctly when mixed with non-array params");
  });

  describe("ParamBuffer reuse", () => {
    it("reuses the internal buffer across calls without allocating a new array");
    it("handles a param count larger than the initial buffer size by extending");
  });
});
```

---

#### `core/query-runner.test.ts`

```typescript
describe("core/query-runner — queryFirst()", () => {
  describe("single row result", () => {
    it("returns the row when exactly one row is returned");
    it("does not log a warning when exactly one row is returned");
  });

  describe("empty result", () => {
    it("returns null when zero rows are returned");
    it("does not log a warning when zero rows are returned");
  });

  describe("multiple rows result", () => {
    it("returns the first row when more than one row is returned");
    it("logs a warn entry with code SQUN_QUERY_FIRST_MULTIPLE_ROWS when more than one row is returned");
    it("includes rowCount in the warn log context");
    it("includes the sql hash in the warn log context");
    it("does not throw even when multiple rows are returned");
  });
});

describe("core/query-runner — query()", () => {
  describe("result mapping", () => {
    it("returns an empty array when zero rows are returned");
    it("returns all rows mapped through the type mapper");
    it("does not log a warning regardless of row count");
  });
});

describe("core/query-runner — querySingle()", () => {
  describe("exact one row", () => {
    it("returns the single row when exactly one row is returned");
  });

  describe("zero rows", () => {
    it("throws QueryError(NO_ROWS_FOUND) when zero rows are returned");
    it("returns null instead of throwing when strict mode is false");
  });

  describe("multiple rows", () => {
    it("throws QueryError(MULTIPLE_ROWS_FOUND) when more than one row is returned");
    it("throws MULTIPLE_ROWS_FOUND even when strict mode is false");
  });
});

describe("core/query-runner — queryScalar()", () => {
  describe("result extraction", () => {
    it("returns the first column of the first row");
    it("throws QueryError(NO_ROWS_FOUND) when zero rows are returned");
    it("silently ignores additional columns beyond the first");
  });
});
```

---

#### `pool/pool.test.ts`

```typescript
describe("pool/pool — ConnectionPool", () => {
  describe("acquire()", () => {
    it("returns an idle connection immediately when one is available");
    it("creates a new connection when none are idle and pool is below max");
    it("queues the request when pool is at max and all connections are acquired");
    it("resolves the queued request when a connection is released");
    it("throws POOL_ACQUIRE_TIMEOUT when the queue wait exceeds acquireTimeoutMs");
    it("throws POOL_QUEUE_FULL when the queue reaches maxQueueSize");
    it("throws POOL_DRAINED when acquire() is called after drain()");
  });

  describe("release()", () => {
    it("returns the connection to the idle pool when no waiters are queued");
    it("hands the connection directly to the first waiter when queue is non-empty");
    it("destroys and replaces the connection when it has exceeded maxConnectionAge");
    it("destroys and replaces the connection when it has exceeded maxUseCount");
    it("marks the connection DEAD and destroys it when health check fails");
  });

  describe("drain()", () => {
    it("stops new acquire() calls from succeeding");
    it("waits for all in-flight acquired connections to be released");
    it("closes all idle connections");
    it("resolves when the pool is empty");
    it("force-closes remaining connections after timeoutMs if provided");
  });

  describe("stats()", () => {
    it("reports the correct idle count after releasing a connection");
    it("reports the correct acquired count during an active query");
    it("reports the correct waiting count when requests are queued");
    it("the total count equals idle plus acquired at all times");
  });
});
```

---

#### `connections/chaining.test.ts`

```typescript
describe("connections/chaining — .use() scope and connection precedence", () => {
  describe(".use() returning a ScopedDb", () => {
    it("returns a ScopedDb that carries the named connection for all subsequent calls");
    it("all query methods on the ScopedDb delegate to the named connection's Db instance");
    it("ScopedDb.use() with a different name creates a new ScopedDb — does not mutate the original");
  });

  describe(".use() propagation into atomically()", () => {
    it("passes the scoped connection name to AtomicBlock so all queries run on it");
    it("throws AtomicNestingError when .use() atomically() is called inside another atomically()");
    it("the atomic block does not acquire from the default pool when a .use() scope is active");
  });

  describe(".use() propagation into transaction()", () => {
    it("the Transaction object is bound to the named connection's pool connection");
    it("savepoints inside the transaction use the same pinned connection");
  });

  describe("options.connection precedence over .use() scope", () => {
    it("routes the query to options.connection even when a .use() scope is active");
    it("the .use() scope is not consumed — the next query without options.connection still uses it");
    it("throws ConnectionError(SQUN_CONN_001) when options.connection is an unregistered name");
  });

  describe("query builder .connection() precedence", () => {
    it("uses the builder's connection when no .use() scope and no options.connection is set");
    it("options.connection overrides the builder's .connection()");
    it(".use() scope overrides the builder's .connection() when no options.connection is set");
    it("the default connection is used when none of the above is set");
  });

  describe("precedence chain — all three set simultaneously", () => {
    it("options.connection wins over .use() scope wins over builder connection wins over default");
  });
});
```

---

#### `core/tvp/tvp-builder.test.ts`

```typescript
describe("core/tvp — tvp() builder and INSERT patterns", () => {
  describe("type validation", () => {
    it("accepts a row array that matches the TableType schema exactly");
    it("throws ValidationError(TVP_SCHEMA_MISMATCH) when a row has a field of the wrong type");
    it("throws ValidationError(TVP_EMPTY) when the rows array is empty");
    it("throws ValidationError(TVP_SCHEMA_MISMATCH) when a required field is missing from a row");
    it("strips unknown fields from rows in lenient mode and logs a warning");
  });

  describe("INSERT via TVP — SqlFragment generation", () => {
    it("produces a SqlFragment whose text contains FROM with the TVP placeholder");
    it("places all row values into the params array in column-major order for unnest strategy");
    it("produces identical SQL text regardless of row count — only params change");
  });

  describe("upsert fragment composition", () => {
    it("ON CONFLICT clause composes correctly after the TVP source");
    it("MERGE USING clause composes correctly with the TVP as source");
    it("ON DUPLICATE KEY UPDATE clause composes correctly after the TVP source");
  });

  describe("INSERT with RETURNING", () => {
    it("produces valid SQL when RETURNING * is appended after the INSERT SELECT");
    it("produces valid SQL when OUTPUT INSERTED.* is placed after INSERT for MSSQL");
  });
});
```

---

#### `integration/sqlite/tvp.test.ts`

```typescript
describe("integration/sqlite — TVP INSERT patterns on real SQLite", () => {
  describe("basic bulk INSERT via TVP", () => {
    it("inserts all rows from the TVP into the target table in a single statement");
    it("the inserted row count matches the TVP row count");
    it("rows inserted via TVP are identical to rows inserted via individual INSERTs");
  });

  describe("INSERT with RETURNING", () => {
    it("returns all inserted rows including auto-generated columns");
    it("the returned rows are fully mapped to the declared model type");
    it("row count in the returned array matches the TVP row count");
  });

  describe("conditional INSERT — WHERE NOT EXISTS", () => {
    it("inserts only rows that do not already exist based on the WHERE condition");
    it("does not insert any rows when all TVP rows already exist");
    it("inserts the subset of rows that are genuinely new");
  });

  describe("INSERT with JOIN to resolve foreign keys", () => {
    it("resolves string references to IDs via a JOIN before inserting");
    it("throws a database error when a JOIN finds no match for a TVP row");
    it("does not insert any rows when the JOIN fails mid-batch");
  });

  describe("multi-table INSERT inside atomically()", () => {
    it("commits all tables when both TVP INSERTs succeed");
    it("rolls back all tables when the second TVP INSERT fails");
    it("temp tables are dropped after rollback — do not leak into subsequent queries");
  });

  describe("temp table cleanup", () => {
    it("drops the temp table after a successful INSERT outside a transaction");
    it("drops the temp table after a failed INSERT outside a transaction");
    it("uses unique temp table names across concurrent connections");
  });
});
```

---

### 23.7 Test fixtures

All tests import shared fixtures rather than defining their own schemas or data inline. This prevents test drift where two tests describe the same schema differently and produce confusing failures.

`tests/fixtures/schemas.ts` exports named table definitions used across the entire test suite. Every table definition used in more than one test file must live here.

`tests/fixtures/builders.ts` exports factory functions for test data. Factories accept partial overrides so tests only specify the fields relevant to their scenario.

```typescript
// tests/fixtures/builders.ts

export function buildUser(overrides: Partial<UserInsert> = {}): UserInsert {
  return {
    name:      "Alice Test",
    email:     "alice@test.com",
    age:       30,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function buildOrder(overrides: Partial<OrderInsert> = {}): OrderInsert {
  return {
    userId:    1,
    total:     99.99,
    status:    "pending",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}
```

### 23.8 Integration test specifications

Integration tests run against real databases (SQLite `:memory:` for always-on tests, real PostgreSQL/MySQL/MSSQL for CI). They are the only tests permitted to open real connections. Each integration test file has the same verbosity requirement as unit tests — full sentence `it` labels, exact error assertions, no vague coverage.

---

#### `integration/sqlite/transaction.test.ts`

```typescript
describe("integration/sqlite — transaction lifecycle on real SQLite", () => {
  describe("db.atomically()", () => {
    it("commits all writes when the callback returns without throwing");
    it("rolls back all writes when the callback throws a QueryError");
    it("rolls back all writes when the callback throws a plain Error");
    it("makes committed rows visible to subsequent queries on a different connection");
    it("does not make rolled-back rows visible to subsequent queries");
    it("throws TimeoutError and rolls back when the callback exceeds timeoutMs");
  });

  describe("db.transaction() with savepoints", () => {
    it("commits the outer transaction when the inner savepoint is released normally");
    it("rolls back only to the savepoint when sp.rollback() is called inside the nested block");
    it("commits the outer transaction even after a savepoint rollback with compensating action");
    it("rolls back the entire outer transaction when the outer callback throws after savepoint work");
  });

  describe("TVP temp-table outside a transaction", () => {
    it("creates the temp table, executes the query, and drops the table before returning");
    it("drops the temp table even when the query itself throws");
    it("uses unique temp table names across concurrent calls on different connections");
  });
});
```

---

#### `integration/connections/chaining.test.ts`

```typescript
describe("integration/connections — .use() chaining and connection precedence", () => {
  describe(".use() propagation into atomically()", () => {
    it("runs the entire atomic batch on the named connection's pool connection");
    it("does not acquire a connection from the default pool when .use() is chained");
    it("rolls back on the correct named connection when the callback throws");
  });

  describe(".use() propagation into transaction()", () => {
    it("opens BEGIN on the named connection and pins all queries to it");
    it("COMMITs on the named connection when the callback returns cleanly");
    it("ROLLBACKs on the named connection when the callback throws");
  });

  describe("options.connection overrides .use() scope", () => {
    it("sends the query to options.connection even when a .use() scope is active");
    it("the .use() scope continues to apply to the next query after the override");
  });

  describe("query builder .connection() precedence", () => {
    it("uses the builder's connection when no .use() scope or options.connection is present");
    it("options.connection overrides the builder's connection");
    it(".use() scope overrides the builder's connection when no options.connection is present");
  });

  describe("unknown connection name at runtime via dynamic path", () => {
    it("throws ConnectionError with code SQUN_CONN_001 and lists registered names in context");
    it("does not execute any SQL before throwing the ConnectionError");
  });
});
```

---

#### `integration/connections/pool-under-load.test.ts`

```typescript
describe("integration/connections — pool under concurrent load", () => {
  describe("when 50 concurrent queries hit a pool with max:5", () => {
    it("all 50 queries complete successfully — 45 wait in queue and are served in order");
    it("no ConnectionError is thrown when maxQueueSize is not reached");
    it("pool stats show acquired = 5 and waiting = 45 at peak load");
    it("pool stats show idle = 5 and waiting = 0 after all queries complete");
  });

  describe("when acquire queue reaches maxQueueSize", () => {
    it("throws ConnectionError with code SQUN_POOL_002 for any query beyond the queue limit");
    it("in-flight queries are not affected — only the new arrival is rejected");
  });

  describe("connection recycling under load", () => {
    it("recycles a connection that has exceeded maxUseCount without affecting in-flight queries");
    it("the recycled connection is replaced before it would have been acquired again");
  });
});
```

---

#### `integration/connections/failover.test.ts`

```typescript
describe("integration/connections — FailoverGroup with simulated primary failure", () => {
  describe("when the primary becomes unreachable", () => {
    it("detects the failure within healthCheckMs + failoverTimeoutMs and promotes the standby");
    it("calls onFailover with the from and to connection names");
    it("subsequent queries succeed against the promoted standby");
    it("logs a warn entry with the failover event details");
  });

  describe("in-flight transaction at the moment of primary failure", () => {
    it("throws ConnectionError(SQUN_CONN_FAILOVER_EXHAUSTED) on the in-flight query");
    it("does not commit partial transaction state to the standby");
    it("the connection is released back to the pool after the error is surfaced");
  });

  describe("when the primary recovers with autoRestore: false", () => {
    it("continues routing to the standby — primary is not automatically re-promoted");
    it("does not call onRestore");
  });

  describe("when the primary recovers with autoRestore: true", () => {
    it("detects the primary recovery and promotes it back");
    it("calls onRestore with the recovered connection name");
    it("subsequent queries return to the primary");
  });
});
```

---

#### `integration/shared/adapter-contract.test.ts`

The adapter contract test suite is a single set of `describe` + `it` blocks that is run once per adapter. Every adapter must pass every test in this suite. Tests that use adapter-specific features (native TVP, Windows auth) are skipped for adapters that do not support them.

```typescript
describe(`adapter contract — ${adapterName}`, () => {
  describe("basic query execution", () => {
    it("executes a SELECT and returns correctly typed rows");
    it("executes a parameterized INSERT and returns rows affected");
    it("executes a parameterized UPDATE and returns rows affected");
    it("executes a parameterized DELETE and returns rows affected");
    it("returns an empty array for a SELECT that matches no rows");
  });

  describe("transaction", () => {
    it("commits all changes when the callback returns successfully");
    it("rolls back all changes when the callback throws");
    it("supports nested transactions via savepoints");
    it("throws TransactionError when an operation is called on a committed transaction");
  });

  describe("connection pool", () => {
    it("returns a healthy connection within acquireTimeoutMs");
    it("releases the connection after each query");
    it("ping() resolves for a healthy connection");
    it("marks a connection DEAD when ping() fails");
  });

  describe("error wrapping", () => {
    it("wraps a constraint violation as QueryError with the correct code");
    it("wraps a connection failure as ConnectionError");
    it("never exposes the raw driver error object — always a SqunError subclass");
  });

  describe("timeout", () => {
    it("throws TimeoutError when a query exceeds the configured timeoutMs");
    it("does not leave a dangling query on the server after timeout");
  });
});
```

### 23.9 Coverage requirements

Coverage is enforced via `bun test --coverage`. The minimum thresholds are hard requirements — the CI pipeline fails if any is not met.

| Scope | Line coverage | Branch coverage |
|---|---|---|
| `src/sql/*` | 100% | 100% |
| `src/errors/*` | 100% | 100% |
| `src/config/*` | 95% | 95% |
| `src/auth/*` | 95% | 90% |
| `src/core/*` | 95% | 90% |
| `src/transaction/*` | 100% | 100% |
| `src/async/*` | 95% | 90% |
| `src/pool/*` | 90% | 85% |
| `src/readonly/*` | 100% | 100% |
| `src/types/*` | 100% | 100% |
| Overall | 95% | 90% |

The `sql/` and `transaction/` packages have 100% branch requirements because they contain the library's security and correctness guarantees. A missed branch in `detectInjection()` or the transaction state machine is a potential bug in production.

### 23.10 Rules that apply to every test file

Every test file must follow these rules without exception.

Each test is fully self-contained — it sets up everything it needs within the test itself and tears down all side effects in `afterEach`. No shared mutable state between tests in the same file.

Every test file imports from fixtures rather than redefining schemas, mock data, or test helpers inline.

Test names are full sentences in plain English, never abbreviations or vague phrases like "works" or "handles edge case".

Every assertion on an error includes the error class, the error code, and at least one context field. Bare `toThrow()` with no argument is not permitted.

Every test that calls a function which logs must assert what was logged using `MockLogger.assertLogged()`. Tests must not let log output go unverified when it is a meaningful outcome of the operation under test.

No `setTimeout` or real timers in unit tests. Time-dependent behaviour is tested by injecting a fake clock or by controlling the `TransactionClock` directly.

No real database connections in unit tests. The `MockAdapter` is the only permitted database dependency in `tests/unit/`. Real connections are only used in `tests/integration/`.

```toml
# bunfig.toml — Bun test configuration
# Bun reads this file automatically; no separate test config file is needed.
[test]
timeout     = 5000          # 5s per test — fast tests fail fast
coverage    = true
root        = "./tests"

[test.coverageThreshold]
line   = 95
branch = 90

# Exclude the public barrel from coverage — it contains only re-exports
[test.coverageExclude]
paths = ["src/index.ts"]
```

---

## 24. Multiple connection strings

### 24.1 The problem this solves

A single `createDb()` call is right for most projects. But several common real-world situations require more than one database connection, and each situation has different routing semantics.

A **primary + replica** setup needs writes to go to the primary and reads to go to a replica, transparently, without the caller thinking about which one to use. A **domain-separated** architecture keeps, say, `users` and `billing` in completely different databases — the caller picks the right one explicitly. A **multi-tenant** system maps each request to a different tenant database — the connection is resolved from context, not hardcoded. A **failover** setup promotes a standby automatically when the primary becomes unreachable. The `createConnections()` API addresses all four patterns from a single, unified entry point.

### 24.2 Setup — `createConnections()`

`createConnections()` accepts a map of named adapters and returns a `MultiDb` instance. Every named connection is validated at startup exactly as `createDb()` validates a single connection — production guards apply to each one individually.

```typescript
import { createConnections } from "squn";
import { PostgresAdapter }   from "squn/adapters/postgres";
import { MssqlAdapter }      from "squn/adapters/mssql";

const db = createConnections({
  // ── Named connections ───────────────────────────────────────────
  connections: {
    primary:   new PostgresAdapter({ url: process.env.SQUN_CONN_PRIMARY_URL }),
    replica:   new PostgresAdapter({ url: process.env.SQUN_CONN_REPLICA_URL }),
    analytics: new PostgresAdapter({ url: process.env.SQUN_CONN_ANALYTICS_URL }),
    billing:   new MssqlAdapter  ({ url: process.env.SQUN_CONN_BILLING_URL }),
  },

  // ── Which connection db.query() uses without an explicit .use() ─
  default: "primary",

  // ── Per-connection config overrides (pool, timeouts, readonly) ──
  overrides: {
    replica:   { readonly: true, pool: { max: 50 } },
    analytics: { readonly: true, timeouts: { query: 120_000 } },
  },
});
```

`MultiDb` exposes the same query API as `Db` but adds a `.use()` method for explicit connection selection. Calling `db.query()` without `.use()` uses the `default` connection.

```typescript
// Uses the default connection ("primary")
const user = await db.queryFirst<User>(sql`SELECT * FROM users WHERE id = ${id}`);

// Explicitly picks "replica" for this query
const users = await db.use("replica").query<User>(sql`SELECT * FROM users`);

// Picks "analytics" — longer timeout applies automatically
const report = await db.use("analytics").query<Report>(sql`SELECT * FROM big_report`);

// Picks "billing" — MSSQL, separate domain
const invoice = await db.use("billing").querySingle<Invoice>(
  sql`SELECT * FROM invoices WHERE id = ${invoiceId}`
);
```

TypeScript knows the connection names at compile time. Passing an unknown name is a type error — no runtime surprises.

```typescript
await db.use("typo").query<User>(sql`...`);
// ❌ TS Error: Argument of type '"typo"' is not assignable to
//             parameter of type '"primary" | "replica" | "analytics" | "billing"'
```

### 24.3 Connection groups — replica sets and read/write routing

A `ConnectionGroup` wraps a set of named connections with routing rules. The most common pattern is a primary and one or more replicas where reads are automatically load-balanced across replicas and writes always go to the primary.

```typescript
import { createConnections, group } from "squn";

const db = createConnections({
  connections: {
    primary:   new PostgresAdapter({ url: process.env.SQUN_CONN_PRIMARY_URL }),
    replica_1: new PostgresAdapter({ url: process.env.SQUN_CONN_REPLICA_1_URL }),
    replica_2: new PostgresAdapter({ url: process.env.SQUN_CONN_REPLICA_2_URL }),
  },
  default: "primary",

  // ── Group: "pg" routes reads to replicas, writes to primary ────
  groups: {
    pg: group({
      write:     "primary",
      read:      ["replica_1", "replica_2"],  // round-robin by default
      readMode:  "round-robin",               // "round-robin" | "least-load" | "random"
    }),
  },
});

// Read — automatically goes to replica_1 or replica_2
const users = await db.use("pg").query<User>(sql`SELECT * FROM users`);

// Write — always goes to primary
await db.use("pg").execute(sql`UPDATE users SET active = ${false} WHERE id = ${id}`);

// Transactions — always pinned to primary regardless of readMode
await db.use("pg").transaction(async (tx) => {
  await tx.execute(sql`INSERT INTO orders ...`);
  await tx.execute(sql`UPDATE inventory ...`);
});
```

The group routing is statement-aware — `SELECT` goes to read connections, `INSERT`/`UPDATE`/`DELETE`/`EXEC` goes to the write connection. Transactions always use the write connection because they must maintain connection affinity across multiple statements.

### 24.4 Failover groups — automatic standby promotion

A `FailoverGroup` wraps a primary and one or more standbys. When the primary becomes unreachable, the group promotes the first healthy standby and begins routing to it.

```typescript
import { createConnections, failover } from "squn";

const db = createConnections({
  connections: {
    primary:  new PostgresAdapter({ url: process.env.SQUN_CONN_PRIMARY_URL }),
    standby:  new PostgresAdapter({ url: process.env.SQUN_CONN_STANDBY_URL }),
  },
  default: "primary",
  groups: {
    ha: failover({
      primary:           "primary",
      standbys:          ["standby"],
      healthCheckMs:     5_000,
      failoverTimeoutMs: 10_000,
      autoRestore:       false,
      onFailover: (from, to) => logger.warn({ message: `Failover: ${from} → ${to}` }),
      onRestore:  (conn)     => logger.info({ message: `Restored: ${conn}` }),
    }),
  },
});

const users = await db.use("ha").query<User>(sql`SELECT * FROM users`);
```

#### What failover does not protect against

Failover is one of the hardest problems in distributed systems. The following limitations apply to every failover implementation, including Squn's, and must be understood before enabling this feature in production.

**In-flight transactions are lost on failover.** A transaction is pinned to a specific physical connection to the primary. If that connection drops mid-transaction — whether the primary has crashed or is temporarily unreachable — the transaction cannot be migrated to the standby. Squn surfaces a `ConnectionError(SQUN_CONN_FAILOVER_EXHAUSTED)` and rolls back the local state. The application must handle this error and decide whether to retry the transaction on the newly promoted standby. Data written to the primary but not yet committed is lost.

**Replication lag creates a data loss window.** Asynchronous replication means the standby is always some number of milliseconds behind the primary. Any writes committed to the primary in the period between the last successful replication and the primary failure are not present on the standby after promotion. This is not a Squn-specific limitation — it is fundamental to asynchronous replication. The size of the window depends on your replication configuration and network conditions. If zero data loss is required, use synchronous replication at the database level and accept the write latency trade-off.

**Split-brain is not automatically prevented.** If the primary becomes unreachable from the application but is still reachable from the standby — for example, a network partition between the app and the primary — Squn promotes the standby. Both databases now believe they are the active writer and may accept writes simultaneously. Squn does not implement fencing or distributed consensus. The correct mitigation is to use your database's built-in mechanisms: PostgreSQL's `pg_ctl promote` with a fencing token, MSSQL's availability group voting, or a managed database service that handles promotion atomically. Squn's failover is an application-level convenience, not a distributed systems solution.

**Recommended posture.** Use `FailoverGroup` to reduce downtime from infrastructure failures in non-critical write paths. For critical write paths — financial transactions, audit records, user account changes — wrap the operation in a retry loop that can re-execute on the promoted standby and handle the `SQUN_CONN_FAILOVER_EXHAUSTED` error explicitly. Consider a managed database service with built-in automatic failover for systems where these guarantees must be provided at the infrastructure level rather than the application level.

Failover state is observable at any time via `db.groups.ha.status()`.

### 24.5 Multi-tenant connection resolution

A `TenantResolver` is a function that receives a context value and returns the name of the connection to use. This is the mechanism for multi-tenant systems where each tenant has their own database.

```typescript
import { createConnections, withTenant } from "squn";

// Each tenant has its own database — connection names are tenant IDs
const db = createConnections({
  connections: {
    tenant_abc: new PostgresAdapter({ url: process.env.SQUN_CONN_TENANT_ABC_URL }),
    tenant_xyz: new PostgresAdapter({ url: process.env.SQUN_CONN_TENANT_XYZ_URL }),
    tenant_mno: new PostgresAdapter({ url: process.env.SQUN_CONN_TENANT_MNO_URL }),
  },
  default: "tenant_abc",

  tenantResolver: (tenantId: string) => `tenant_${tenantId}`,
});

// Resolve via context — no .use() needed in business logic
const tenantDb = db.forTenant(tenantId);
const users    = await tenantDb.query<User>(sql`SELECT * FROM users`);

// Or use withTenant() to create a scoped db for the duration of a request
await withTenant(db, tenantId, async (tenantDb) => {
  const users  = await tenantDb.query<User>(sql`SELECT * FROM users`);
  const orders = await tenantDb.query<Order>(sql`SELECT * FROM orders`);
  // all queries within this scope use the tenant's connection
});
```

When a tenant ID resolves to a connection name that does not exist in the registry, Squn throws `ConnectionError(SQUN_CONN_UNKNOWN)` with the tenant ID and the list of registered connection names in the context — never silently falls back to the default.

### 24.6 `squn.config.ts` — structured config file

For projects with many connections, environment variables can become verbose. The `squn.config.ts` file is a structured alternative that lives at the project root and is loaded automatically by the library at startup. It is a plain TypeScript file — no JSON, no YAML, no proprietary DSL.

```typescript
// squn.config.ts — at the project root

import type { SqunConfig } from "squn";

const config: SqunConfig = {
  // ── Named connections ─────────────────────────────────────────────────────
  connections: {
    primary: {
      adapter:  "postgres",
      url:      process.env.DB_PRIMARY_URL ?? throwMissing("DB_PRIMARY_URL"),
      pool:     { min: 2, max: 20 },
    },

    replica: {
      adapter:   "postgres",
      url:       process.env.DB_REPLICA_URL ?? throwMissing("DB_REPLICA_URL"),
      readonly:  true,
      pool:      { min: 5, max: 50 },
    },

    analytics: {
      adapter:   "postgres",
      url:       process.env.DB_ANALYTICS_URL ?? throwMissing("DB_ANALYTICS_URL"),
      readonly:  true,
      timeouts:  { query: 120_000 },
    },

    billing: {
      adapter:   "mssql",
      host:      process.env.DB_BILLING_HOST ?? throwMissing("DB_BILLING_HOST"),
      database:  "billing",
      auth: {
        type:     "windows",
        domain:   "CORP",
        username: "billing_svc",
      },
    },
  },

  // ── Groups ────────────────────────────────────────────────────────────────
  groups: {
    pg: {
      type:     "replica-set",
      write:    "primary",
      read:     ["replica"],
      readMode: "round-robin",
    },
  },

  // ── Default ───────────────────────────────────────────────────────────────
  default: "primary",

  // ── Shared settings applied to all connections unless overridden ──────────
  shared: {
    env:     "production",
    logger:  "json",
    security: {
      detectInjection: true,
      strictRaw:       true,
    },
  },
};

export default config;

// Helper — makes missing env vars fail loudly at config load time
function throwMissing(name: string): never {
  throw new Error(`Required environment variable ${name} is not set`);
}
```

When `squn.config.ts` is present, `createConnections()` can be called with no arguments — it reads the config file automatically. Explicit arguments to `createConnections()` always override the config file.

```typescript
// Reads squn.config.ts automatically from the project root
const db = createConnections();

// Explicit arguments override the config file
const db = createConnections({
  default: "replica",   // overrides the "primary" default in squn.config.ts
});
```

> **Critical — always use `satisfies`, never `: SqunConfig`.** The type annotation you use on the config object determines whether TypeScript can infer the connection names as literal types.
>
> ```typescript
> // ✅ Correct — satisfies preserves literal key types
> export default {
>   connections: { primary: ..., replica: ... },
>   default: "primary",
> } satisfies SqunConfig;
> // createConnections() infers Names = "primary" | "replica"
> // options.connection autocompletes correctly
>
> // ❌ Wrong — type annotation widens literal keys to string
> const config: SqunConfig = {
>   connections: { primary: ..., replica: ... },
>   default: "primary",
> };
> export default config;
> // createConnections() infers Names = string
> // options.connection accepts ANY string — no compile-time safety
> // db.query(sql, { connection: "typo" }) compiles without error
> ```
>
> The failure mode when `: SqunConfig` is used is silent and dangerous. The entire compile-time connection name guarantee disappears. If your config file is loaded from another file using `const config: SqunConfig = ...`, the safety is gone at that assignment. Always use `satisfies SqunConfig` on the exported default.

### 24.7 Config file loading and validation

The config file is loaded once at `createConnections()` time — synchronously, before any connections are opened. This follows the same fail-fast philosophy as `createDb()`: the application never starts in an ambiguous state.

Loading order:

```
Explicit createConnections() arguments
        ↓
squn.config.ts (project root)
        ↓
SQUN_CONN_{NAME}_* environment variables
        ↓
SQUN_DEFAULT_CONNECTION environment variable
        ↓
Development/test localhost defaults per adapter
        ↓
Production → throws if any required connection is missing
```

Every named connection is validated individually at startup using the same production guard rules as `createDb()`. If three out of four connections are valid and one is misconfigured, Squn throws a single error that lists every failing connection together — not one error per connection.

```
  Squn — Multiple connection configuration error
  ─────────────────────────────────────────────────────
  2 of 4 connections failed validation.

  analytics (postgres):
    ✗  url is required. Set SQUN_CONN_ANALYTICS_URL or DB_ANALYTICS_URL

  billing (mssql):
    ✗  host is required. Set SQUN_CONN_BILLING_HOST or SQUN_CONN_BILLING_URL
    ✗  password is required. Set SQUN_CONN_BILLING_PASSWORD

  Connections that passed: primary, replica
  ─────────────────────────────────────────────────────
```

### 24.8 Runtime inspection

Every connection in the registry is observable at runtime.

```typescript
// List all registered connection names
const names = db.connections.names();
// → ["primary", "replica", "analytics", "billing"]

// Check if a named connection is registered
const exists = db.connections.has("analytics");
// → true

// Pool stats for a specific connection
const stats = db.connections.stats("replica");
// → { total: 50, idle: 43, acquired: 7, waiting: 0, ... }

// Pool stats for all connections
const allStats = db.connections.allStats();
// → { primary: {...}, replica: {...}, analytics: {...}, billing: {...} }

// Health check a specific connection
const healthy = await db.connections.ping("primary");
// → true | false

// Health check all connections — returns per-connection results
const health = await db.connections.pingAll();
// → { primary: true, replica: true, analytics: false, billing: true }
```

### 24.9 Graceful shutdown — all connections drained together

`db.drain()` drains all registered connection pools concurrently, waiting for every in-flight query across every connection to complete before closing.

```typescript
process.on("SIGTERM", async () => {
  logger.info({ message: "Shutting down — draining all connections" });

  // Drains all four pools concurrently
  await db.drain({ timeoutMs: 30_000 });

  logger.info({ message: "All connections closed" });
  process.exit(0);
});
```

### 24.10 New error codes

```typescript
enum ErrorCode {
  // ... existing

  // Multiple connections
  CONN_UNKNOWN             = "SQUN_CONN_001",  // .use("name") with unregistered name
  CONN_MULTI_INVALID       = "SQUN_CONN_002",  // multiple connections failed validation at startup
  CONN_GROUP_NO_WRITE      = "SQUN_CONN_003",  // write attempted on a read-only group
  CONN_FAILOVER_EXHAUSTED  = "SQUN_CONN_004",  // all standbys unreachable
  CONN_TENANT_NOT_FOUND    = "SQUN_CONN_005",  // tenant ID resolved to unregistered connection
  CONN_CONFIG_FILE_INVALID = "SQUN_CONN_006",  // squn.config.ts failed to parse or validate
  CONN_DEFAULT_MISSING     = "SQUN_CONN_007",  // default connection name not in registry
}
```

### 24.11 New modules

```
src/
├── connections/
│   ├── registry.ts         # ConnectionRegistry — map of name → Db instance
│   ├── group.ts            # ConnectionGroup — replica set routing logic
│   ├── failover.ts         # FailoverGroup — health check + standby promotion
│   ├── tenant-resolver.ts  # TenantResolver — fn-based dynamic connection selection
│   ├── config-file.ts      # squn.config.ts discovery, loading, deep merge
│   ├── env-loader.ts       # SQUN_CONN_{NAME}_* env var discovery + parsing
│   └── types.ts            # MultiDb, ConnectionMap, MultiDbConfig, GroupConfig
```

### 24.12 Decision guide for which pattern to use

Understanding which pattern fits a given situation is as important as understanding the API itself.

Use **named connections** (`db.use("name")` or the `connection` option) when different parts of the codebase access different databases for domain reasons. The caller explicitly chooses the database because different databases serve fundamentally different purposes — billing, analytics, users, etc. There is no routing logic involved.

Use a **connection group** (`group()`) when you have multiple instances of the same logical database and want transparent routing between them. The caller says "give me a postgres connection" and the library decides which physical instance to use based on the operation type and the read mode. The caller should not need to think about replicas.

Use a **failover group** (`failover()`) when availability is critical and you have a standby ready to take over. This is not the same as a replica — a standby is kept in sync and can accept writes after promotion. A replica typically cannot.

Use a **tenant resolver** (`forTenant()` / `withTenant()`) when the database is determined by the identity of the caller, not by what they are doing. Multi-tenant SaaS applications where each customer has their own isolated database are the canonical example.

Use `squn.config.ts` when the connection configuration is complex enough that environment variables become unwieldy — many connections with non-trivial per-connection settings, groups, and shared config. The config file is also easier to review in version control than a long list of env var assignments.

### 24.13 How named connections become typed query options

This subsection explains the TypeScript mechanism that turns connection names into compile-time options on every query method. It is here in the connections section rather than the query API section because understanding it requires knowing how `createConnections()` works first.

#### The problem

When you register connections named `"primary"`, `"replica"`, and `"analytics"`, you want `db.query(sql, { connection: "replica" })` to be valid and `db.query(sql, { connection: "typo" })` to be a compile-time error. TypeScript needs to know the names at the type level, not just at runtime.

#### The mechanism — generic inference from the config object

`createConnections()` is generic over its config argument. TypeScript infers the exact literal keys of the `connections` object and stores them as the `Names` type parameter on the returned `MultiDb` instance. Every query method on `MultiDb<Names>` then uses `Names` as the type of the `connection` option.

```typescript
// The correct signature — Names is derived from the return type, not a default parameter.
// TypeScript infers Config from the call-site argument, then computes the return type.
function createConnections<Config extends MultiDbConfig>(
  config: Config
): MultiDb<keyof Config["connections"] & string>;

// MultiDb carries Names through to every method
interface MultiDb<Names extends string> {
  query<T>(
    sql:      SqlFragment,
    options?: QueryOptions<Names>,
  ): Promise<T[]>;

  execute(
    sql:      SqlFragment,
    options?: ExecuteOptions<Names>,
  ): Promise<{ rowsAffected: number }>;

  // ... every other method carries the same Names generic
}

// The options types use a conditional type to hide the field
// entirely when Names is never (single-connection mode)
interface QueryOptions<Names extends string = never> {
  connection?: [Names] extends [never] ? never : Names;
  timeoutMs?:  number | null;
  readonly?:   boolean;
}
```

When you call `createConnections({ connections: { primary: ..., replica: ... } })`, TypeScript infers `Names = "primary" | "replica"`. The returned `db` object has type `MultiDb<"primary" | "replica">`. When you then write `db.query(sql, { connection: "..." })`, your IDE autocompletes to exactly `"primary"` or `"replica"` and rejects any other value.

#### What single-connection mode looks like

When you use `createDb()` instead of `createConnections()`, the returned `Db` instance has no `Names` generic. The `connection` field is absent from `QueryOptions` entirely — it does not appear as `undefined` or `string`, it simply does not exist. This means single-connection code is never shown an option that does not apply to it.

```typescript
// Single connection — createDb()
const db = createDb(new PostgresAdapter(config));

// TypeScript error — connection is not a valid option here
await db.query<User>(sql`SELECT * FROM users`, { connection: "primary" });
// TS2345: Object literal may only specify known properties,
//         and 'connection' does not exist in type 'QueryOptions<never>'

// Multi-connection — createConnections()
const db = createConnections({ connections: { primary: ..., replica: ... } });

// ✅ Valid — "replica" is a registered name
await db.query<User>(sql`SELECT * FROM users`, { connection: "replica" });

// ❌ TypeScript error — "archive" was not registered
await db.query<User>(sql`SELECT * FROM users`, { connection: "archive" });
```

#### Runtime behaviour matching the compile-time contract

At runtime, when a `connection` option is provided, the query runner looks up that name in the `ConnectionRegistry`. If the name is not found — which should not happen given the compile-time check, but could happen via a dynamic call path — it throws `ConnectionError(SQUN_CONN_UNKNOWN)` with the attempted name and the list of registered names in the context.

```typescript
// What the runtime lookup looks like inside the query runner
function resolveConnection<Names extends string>(
  registry: ConnectionRegistry<Names>,
  options:  QueryOptions<Names> | undefined,
  multiDb:  MultiDb<Names>,
): Db {
  const name = options?.connection ?? multiDb.default;

  const conn = registry.get(name);
  if (!conn) {
    throw new ConnectionError(ErrorCode.CONN_UNKNOWN, {
      operation:        "query",
      requestedName:    name,
      registeredNames:  registry.names(),
    });
  }

  return conn;
}
```

#### The `squn.config.ts` connection names are also fully typed

When connections are loaded from `squn.config.ts` rather than passed inline to `createConnections()`, the names are still inferred at compile time — TypeScript reads the exported config object's `connections` keys just as it reads an inline object literal. This works because `squn.config.ts` is a real TypeScript file imported at the type level.

```typescript
// squn.config.ts
export default {
  connections: {
    primary:   { adapter: "postgres", url: "..." },
    analytics: { adapter: "postgres", url: "..." },
  },
  default: "primary",
} satisfies SqunConfig;

// main.ts
import config from "./squn.config";
const db = createConnections(config);
// db: MultiDb<"primary" | "analytics">
// options.connection: "primary" | "analytics" — same inference, same safety
```

#### Test coverage for the typed connection option and chaining

The compile-time behaviour is verified with `tsc --noEmit` in CI — TypeScript type errors are CI failures. The runtime behaviour of `resolveConnection()` is covered by `tests/unit/connections/resolve-connection.test.ts`, which verifies that `SQUN_CONN_UNKNOWN` is thrown with the correct context when an unknown name is passed via a dynamic call path. The full chaining precedence behaviour — `.use()` scope, `options.connection` override, query builder `.connection()`, and the interaction with `transaction()` and `atomically()` — is specified in `tests/unit/connections/chaining.test.ts` and verified end-to-end in `tests/integration/connections/chaining.test.ts`.

---

*End of document — Squn v2.4.2 PRD*
