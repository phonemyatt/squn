## Task: Add Database method — $ARGUMENTS
## Format: "methodName(params) → ReturnType — description"
## Example: "queryPaged(fragment, page, pageSize) → PagedResult<T> — paginated SELECT"

Add ONLY:
- Method signature to the `Database` interface in src/db.ts
- Implementation in the object literal returned by `createConnection()`
- Same signature + implementation in `MultiDatabase` interface and `createConnections()` if it is a public method
- Delegate to a new (or existing) pure function in src/api/
- Named export from src/index.ts if the helper is public
- Unit test in tests/unit/api/

---
## Rules

- `Database` interface is the contract — write the signature first, implement second
- Implementation in db.ts must delegate to a function in src/api/ — no logic in db.ts itself
- Match existing method signatures:
  - Query:   `(fragment: SqlFragment, options?: XOptions) => Promise<T[]>`
  - Execute: `(fragment: SqlFragment) => Promise<{ rowsAffected: number }>`
- All errors thrown as typed `SqunError` subclasses — never raw `Error`
- If adapter-specific behavior is needed, add to `IDbAdapter` in src/adapters/base.ts first,
  then implement in each adapter: `sqlite.ts`, `postgres.ts`, `mysql.ts`, `mssql.ts`
- `import type` for all type-only imports

## After generating
- Show the updated `Database` interface block (new signature in context)
- List the new/modified file(s) in src/api/ with one-line summaries
- Flag any adapter that may not support this operation natively
- Show the minimal bun test command to run the new test — never auto-run
