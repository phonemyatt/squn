# Squn — Version 2 Prompts

## Analysis summary

Version 1 is solid. Foundation, type system, SQL engine, adapters, pool,
transactions, mapping, readonly, connections, and api are all complete.
Six gaps need to close for version 2.

Do not touch anything not mentioned in these prompts.
Run bun run typecheck after every prompt before committing.

---

## Prompt V2-1 — Fix IDbAdapter params type + remove array spread

```
Read @src/adapters/base.ts and @src/api/query.ts and @src/api/execute.ts.

Problem: fragment.params is readonly unknown[] but IDbAdapter.query() and
IDbAdapter.execute() both declare params as unknown[] (mutable). Every
query call currently does [...fragment.params] to satisfy the mutable type.
This allocates a new array on every single call — the hot path allocation
problem identified in the performance review.

Fix IDbAdapter in src/adapters/base.ts:
Change every params argument from unknown[] to readonly unknown[].
This applies to IDbAdapter.execute, IDbAdapter.query, IDbAdapter.queryMultiple,
and IDbTransaction.execute and IDbTransaction.query.

Then remove every [...fragment.params] spread in:
- src/api/query.ts — all five functions (query, queryFirst, querySingle,
  queryScalar, queryMultiple) — pass fragment.params directly
- src/api/execute.ts — execute() function — pass fragment.params directly
- Any other file that spreads fragment.params

Then verify all four adapters (sqlite, postgres, mysql, mssql) still
compile — their implementations receive readonly unknown[] which is
compatible with their internal usage.

Run: bun run typecheck
Run: bun test
If all pass: git add -A && git commit -m "perf: remove array spread on query hot path — pass fragment.params directly"
```

---

## Prompt V2-2 — Fix AtomicExecutor to accept SqlFragment

```
Read @src/transaction/atomic.ts, @src/db.ts, @src/sql/fragment.ts.

Problem: AtomicExecutor currently exposes:
  query(sql: string, params: unknown[]): Promise<Row[]>
  execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }>

This forces callers to write raw strings inside atomically() callbacks,
which bypasses the sql tag's injection safety. The PRD design is:
  await db.atomically(async (q) => {
    await q.execute(sql`INSERT INTO orders ...`);
  });

Fix AtomicExecutor in src/transaction/atomic.ts:
Change both methods to accept SqlFragment:
  query<T>(fragment: SqlFragment): Promise<T[]>
  execute(fragment: SqlFragment): Promise<{ rowsAffected: number }>

Inside runAtomically(), the executor implementation becomes:
  query: (fragment) => tx.query(fragment.text, fragment.params),
  execute: (fragment) => tx.execute(fragment.text, fragment.params),

Also add the remaining query methods that the PRD includes on AtomicExecutor
(PRD section 10.2): queryFirst, querySingle, queryScalar, executeBatch.

Update src/db.ts — the Db.atomically() method signature must reflect
the updated AtomicExecutor type.

Run: bun run typecheck
Run: bun test tests/unit/transaction/atomic.test.ts
Update any tests that call q.execute("raw string", []) to use sql`` template.
If all pass: git add -A && git commit -m "fix(transaction): AtomicExecutor accepts SqlFragment instead of raw strings"
```

---

## Prompt V2-3 — Wire MultiDb query methods and .use()

```
Read PRD.md sections 7 and 24 (MultiDb<Names>, .use(), connection option,
ScopedDb, precedence chain).
Read @src/db.ts, @src/connections/types.ts, @src/connections/registry.ts,
@src/connections/resolve-connection.ts, @src/api/query.ts, @src/api/execute.ts,
@src/transaction/atomic.ts.

Problem: createConnections() returns { registry, config }. Users cannot
run any queries. The type-checks.ts file documents this gap:
  // @ts-expect-error — MultiDb has no .query() method
  multi.query;

Fix MultiDb<Names> in src/db.ts.

Step 1 — Update the MultiDb<Names> interface to include:

  // Connection selector — returns a ScopedDb with the named adapter pre-resolved
  use(name: Names): ScopedDb<Names>

  // All query methods — connection resolved from options.connection or default
  query<T>(fragment: SqlFragment, options?: QueryOptions<Names>): Promise<T[]>
  queryFirst<T>(fragment: SqlFragment, options?: QueryOptions<Names>): Promise<T | null>
  querySingle<T>(fragment: SqlFragment, options?: QueryOptions<Names>): Promise<T>
  queryScalar<T>(fragment: SqlFragment, options?: QueryOptions<Names>): Promise<T>
  execute(fragment: SqlFragment, options?: ExecuteOptions<Names>): Promise<{ rowsAffected: number }>
  executeBatch(
    fragment: SqlFragment,
    rows: readonly Record<string, unknown>[],
    options?: ExecuteOptions<Names>
  ): Promise<{ rowsAffected: number }>
  stream<T>(fragment: SqlFragment, options?: StreamOptions<Names>): AsyncIterableIterator<T>
  atomically<T>(fn: (q: AtomicExecutor) => Promise<T>, options?: AtomicOptions<Names>): Promise<T>
  transaction(fn: (tx: Transaction) => Promise<void>, options?: { connection?: Names }): Promise<void>
  concurrent<T extends readonly Promise<unknown>[]>(...queries: T): Promise<{ [K in keyof T]: Awaited<T[K]> }>
  prepare<T, P extends Record<string, unknown>>(
    fragment: SqlFragment,
    paramNames: readonly string[],
    options?: { connection?: Names }
  ): PreparedQuery<T, P>

Step 2 — Update ScopedDb<Names> in src/connections/types.ts to expose
the same query methods (without connection option since it is pre-resolved).

Step 3 — Implement both in createConnections():
  Every method resolves the adapter via:
    const adapter = registry.get(options?.connection)
  .use(name) returns a ScopedDb where every method calls registry.get(name)
  directly without needing options.connection.

Step 4 — Connection precedence must follow PRD section 7:
  options.connection → .use() scope → default

Step 5 — Write tests/unit/connections/multi-db.test.ts:
  - .use("replica").query() routes to the replica adapter
  - .query(sql, { connection: "replica" }) routes to the replica adapter
  - .query(sql, { connection: "unknown" as any }) throws ConnectionError(CONN_UNKNOWN)
  - The two valid assertions above must NOT use @ts-expect-error

Run: bun run typecheck
Run: bun test tests/unit/connections/
If all pass: git add -A && git commit -m "feat(db): wire MultiDb query methods, .use() scoped connection, ScopedDb"
```

---

## Prompt V2-4 — Update type-checks.ts after MultiDb fix

```
Read @tests/types/type-checks.ts.
Read @src/db.ts (the updated MultiDb after V2-3).

The type-checks.ts file has this assertion which documented the gap:
  // @ts-expect-error — MultiDb has no .query() method
  multi.query;

Now that MultiDb has .query(), this @ts-expect-error directive is unused
and tsc will error on it. Remove it and replace with real assertions:

1. Confirm .query() exists and is callable with no options:
   use(multi.query);  // no @ts-expect-error — should compile cleanly

2. Confirm .use() exists:
   const scopedDb = multi.use("primary");
   use(scopedDb);

3. Confirm options.connection is typed as Names union:
   // Valid — "primary" is registered
   await multi.query(sql`SELECT 1`, { connection: "primary" });
   await multi.query(sql`SELECT 1`, { connection: "replica" });

   // @ts-expect-error — "analytics" is not a registered connection name
   await multi.query(sql`SELECT 1`, { connection: "analytics" });

4. Confirm .use() scoped db has no connection option (it is pre-resolved):
   const scoped = multi.use("primary");
   // @ts-expect-error — ScopedDb has no connection option, connection is pre-resolved
   await scoped.query(sql`SELECT 1`, { connection: "replica" });

Run: bun run typecheck
Confirm zero unused @ts-expect-error directives and zero type errors.
Count the total @ts-expect-error assertions in the file and report it.
If all pass: git add -A && git commit -m "test(types): update type-checks for MultiDb — replace gap assertion with real assertions"
```

---

## Prompt V2-5 — Real streaming cursor + abort + concurrent

```
Read PRD.md section 7 (stream, AsyncIterableIterator, batchSize, backpressure).
Read @src/api/query.ts (current stream — loads all rows, not real streaming).
Read @src/adapters/base.ts.

The current stream() fetches ALL rows into memory then yields slices.
This is not real streaming and defeats the purpose for large result sets.

Step 1 — Write src/async/abort.ts:
Export withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T>
  - Creates an AbortController internally
  - Calls fn(controller.signal)
  - Sets a timer that calls controller.abort() after ms
  - Timer is ALWAYS cleared in a finally block — no leaks
Export createTimeoutSignal(ms: number): { signal: AbortSignal; clear: () => void }
  - Returns signal + a clear() function the caller must invoke in finally

Step 2 — Add hasCursorSupport(): boolean to IDbAdapter in src/adapters/base.ts
  - SQLite, PostgreSQL, MySQL, MSSQL all return false for now (native cursor
    support is a future enhancement)
  - This makes the interface honest about capability

Step 3 — Write src/async/cursor.ts:
Export class Cursor<T> implementing AsyncIterableIterator<T>:
  constructor(adapter: IDbAdapter, fragment: SqlFragment, batchSize: number)
  - If adapter.hasCursorSupport() is false (current state for all adapters):
    Fetch all rows once in the first next() call, then slice into batchSize
    chunks on subsequent calls. This is the fallback — still bounded by
    batchSize per yield, just not bounded in total memory.
  - close() releases the cursor — called in finally by the consumer
  - [Symbol.asyncIterator]() returns this
  - next() returns { value: T, done: false } or { value: undefined, done: true }

Step 4 — Rewrite stream() in src/api/query.ts to use Cursor<T>:
  export async function* stream<T>(adapter, fragment, batchSize = 100) {
    const cursor = new Cursor<T>(adapter, fragment, batchSize);
    try {
      for await (const row of cursor) {
        yield row;
      }
    } finally {
      await cursor.close();
    }
  }

Step 5 — Write src/async/concurrent.ts:
Export function concurrent<T extends readonly unknown[]>(
  ...queries: { [K in keyof T]: Promise<T[K]> }
): Promise<T>
  Wraps Promise.all with correct TypeScript tuple inference so callers get
  typed results per position rather than unknown[].

Run: bun run typecheck
Run: bun test tests/unit/
If all pass: git add -A && git commit -m "feat(async): real cursor streaming, abort helpers, concurrent utility"
```

---

## Prompt V2-6 — True executeBatch at the adapter level

```
Read PRD.md section 7 (executeBatch strategy: prepared-loop | copy | bulk-load).
Read @src/api/execute.ts (current executeBatch — per-row loop with buildParams).
Read @src/adapters/base.ts, @src/adapters/sqlite.ts.

Problem: executeBatch() currently calls buildParams() + adapter.execute()
once per row. This sends N round trips, allocates objects per row, and
parses the SQL N times at the adapter level. True batch means ONE prepared
statement, bound and run N times with zero re-parsing.

Step 1 — Add executeBatch() to IDbAdapter in src/adapters/base.ts:
  executeBatch(
    sql: string,
    rows: readonly Record<string, unknown>[],
    paramNames: readonly string[],
    strategy?: "prepared-loop" | "copy" | "bulk-load"
  ): Promise<{ rowsAffected: number }>

Step 2 — Implement in each adapter:

src/adapters/sqlite.ts — "prepared-loop":
  const stmt = this.db.prepare(sql);
  let total = 0;
  for (const row of rows) {
    const params = paramNames.map(name => row[name]);
    stmt.run(...params);
    total++;
  }
  return Promise.resolve({ rowsAffected: total });
  No new array is allocated per row — paramNames.map() creates one array
  per row but this is unavoidable; the key win is no SQL re-parsing.

src/adapters/postgres.ts — "prepared-loop" using Bun.SQL pipeline.
src/adapters/mysql.ts — "prepared-loop" using Bun.SQL pipeline.
src/adapters/mssql.ts — "prepared-loop" using mssql prepared request.
  "bulk-load" — stub returning Promise.reject(ADAPTER_NOT_SUPPORTED)
  until fully implemented.

Step 3 — Update executeBatch() in src/api/execute.ts to use the adapter
method directly, passing the extracted param names from buildParams:
  const built = buildParams(fragment.text, rows[0] ?? {}, adapter.type);
  return adapter.executeBatch(built.text, rows, built.paramOrder, options?.strategy);

Note: buildParams needs to expose paramOrder — check @src/core/param-builder.ts
and update its BuildResult to include paramOrder if it does not already.

Step 4 — Update src/db.ts Db interface — executeBatch() signature adds
the strategy option:
  executeBatch(
    fragment: SqlFragment,
    rows: readonly Record<string, unknown>[],
    options?: { strategy?: "prepared-loop" | "copy" | "bulk-load" }
  ): Promise<{ rowsAffected: number }>

Run: bun run typecheck
Run: bun test
If all pass: git add -A && git commit -m "feat(api): true batch mode in executeBatch — single prepared statement per batch"
```

---

## Prompt V2-7 — TVP module

```
Read PRD.md section 9 (TVP — TableType, tvp(), strategies per adapter).
Read @src/adapters/base.ts (TvpValue, TvpMaterialised interfaces).
Read @src/sql/fragment.ts (tvpValues field on SqlFragment).

The entire TVP module is missing. src/core/tvp/ has empty directories.

Write src/core/tvp/table-type.ts:
Export class TableType<Schema extends Record<string, string>> with:
  readonly name: string        — the type name (e.g. "dbo.OrderTableType")
  readonly schema: Schema      — column names mapped to db type strings
Export type InferTableType<T extends TableType<any>> that infers the
row shape from the schema (string → string, number → number, etc.)

Write src/core/tvp/tvp-builder.ts:
Export function tvp<T extends TableType<any>>(
  tableType: T,
  rows: InferTableType<T>[]
): TvpValue
Validates every row has exactly the columns in tableType.schema.
Throws ValidationError(TVP_SCHEMA_MISMATCH) on any mismatch.
Returns { __isTvp: true, tableType, rows }.

Write src/core/tvp/strategies/temp-table.ts:
Implements materializeTvp for SQLite and MySQL:
- Temp table name: _squn_tvp_{counter} using a module-level atomic counter
- Creates temp table with correct column types
- Inserts all rows in a single VALUES (...), (...) statement — NOT one INSERT per row
- Returns sqlExpression = the temp table name
- cleanup() drops the temp table (called in finally by the query runner)

Write src/core/tvp/strategies/unnest.ts:
Implements materializeTvp for PostgreSQL using unnest():
Returns: unnest($1::type[], $2::type[],...) AS t(col1, col2,...)
extraParams = one array per column, containing all row values for that column.

Write src/core/tvp/strategies/native.ts:
MSSQL stub — returns Promise.reject(ADAPTER_NOT_SUPPORTED) for now.

Update src/adapters/sqlite.ts to use temp-table strategy in materializeTvp
instead of the current Promise.reject.

Write tests/unit/core/tvp/:
- tvp-builder.test.ts: validates schema, throws TVP_SCHEMA_MISMATCH on wrong columns
- temp-table cleanup runs even when the query throws (test with a mock adapter)
- Unique temp table names are generated (counter increments)

Run: bun test tests/unit/core/
If all pass: git add -A && git commit -m "feat(core): TVP module — TableType, tvp(), temp-table and unnest strategies"
```

---

## Prompt V2-8 — Final CI check and smoke test

```
Read @scripts/smoke-test.ts if it exists, or write it fresh.

First run the full CI suite:
  bun run ci

Fix any failures before continuing. Report the coverage table.

Then run or write scripts/smoke-test.ts that exercises the full public API
end to end including the new features:

1. createDb with SqliteAdapter — query, queryFirst, querySingle, queryScalar
2. atomically() with sql`` fragments (not raw strings — confirm V2-2 works)
3. transaction() with a savepoint rollback
4. prepare() — .all(), .first(), .single(), .scalar()
5. stream() — assert rows arrive in batchSize chunks, not all at once
6. executeBatch() — 100 rows, assert rowsAffected is 100
7. createConnections() — .use("replica").query() routes correctly
8. createConnections() — .query(sql, { connection: "replica" }) routes correctly
9. TVP — tvp() validates schema and throws on mismatch
10. splitAndMap() from mapping/nested-mapper — JOIN result splitting

Print ✓ after each step. Print "All N steps passed." at the end.

Run: bun run scripts/smoke-test.ts
Fix any failures in src/ — do not patch the smoke test to hide them.

Run: bun run typecheck
Confirm zero errors.

Final commit:
git add -A && git commit -m "chore: version 2 complete — all gaps closed, full CI passing"
```

---

## Gap reference

| Prompt | Gap closed |
|---|---|
| V2-1 | `[...fragment.params]` array spread on every query call |
| V2-2 | `AtomicExecutor` accepts raw strings instead of SqlFragment |
| V2-3 | `MultiDb` has no query methods or `.use()` |
| V2-4 | `type-checks.ts` gap assertion replaced with real MultiDb assertions |
| V2-5 | `stream()` loads all rows — not real streaming. cursor.ts, abort.ts, concurrent.ts missing |
| V2-6 | `executeBatch` is a per-row loop instead of a prepared statement batch |
| V2-7 | TVP module entirely missing |
| V2-8 | Final CI + smoke test verification |

## What NOT to touch

Everything not listed above is complete and correct. In particular:
- errors/, logging/, config/, auth/, cache/ — leave alone
- sql/ engine — leave alone
- adapters/ (except adding executeBatch and hasCursorSupport to interface) — leave alone
- pool/ — leave alone
- transaction/transaction.ts, savepoint.ts, deadlock.ts, isolation.ts — leave alone
- mapping/ (splitAndMap is implemented in mapping/nested-mapper.ts — correct location) — leave alone
- readonly/ — leave alone
- connections/ (registry, group, failover, tenant-resolver, resolve-connection) — leave alone
- api/prepared.ts, api/proc.ts, api/query-builder.ts — leave alone
- type-checks.ts assertions for InferInsert/InferModel/InferUpdate/col/sql — leave alone
