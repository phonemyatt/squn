# Design: Rename createDb → createConnection, Db → Database, MultiDb → MultiDatabase

**Date:** 2026-05-22
**Status:** Approved
**Version bump:** 0.1.x → 0.2.0 (breaking change)

## Problem

`createDb` implies a database is being created. In reality, the function establishes a connection to an existing database. `Db` and `MultiDb` are opaque abbreviations that don't communicate what they represent to new users.

## Decision

| Old name | New name | Reason |
|----------|----------|--------|
| `createDb` | `createConnection` | Accurately describes the operation — connecting to an existing database |
| `Db` | `Database` | Expressive, matches the mental model: "I have a Database object" |
| `MultiDb` | `MultiDatabase` | Consistent with `Database`, self-explanatory |
| `createConnections` | `createConnections` | Already well-named — no change |

## Scope

Pure rename — no logic, behaviour, or interface changes. Every file that currently references `createDb`, `Db`, or `MultiDb` gets updated.

### Source files to update

- `src/db.ts` — rename the function and type declarations
- `src/index.ts` — update all export statements and the `@public` TSDoc comments
- Any `src/` files that import `Db` or `MultiDb` from `src/db.ts`

### Test files to update

- All unit tests referencing `createDb`, `Db`, or `MultiDb`

### Documentation to update

- `README.md`
- `llms.txt`
- `docs/guide/getting-started.md`
- `docs/guide/adapters.md`
- `docs/guide/querying.md`
- `docs/guide/execute.md`
- `docs/guide/prepared.md`
- `docs/guide/transactions.md`
- `docs/guide/mapping.md`
- `docs/guide/multi-db.md`
- `docs/guide/config.md`
- `docs/guide/sql-authoring.md`
- `docs/post-devto.md`

### Version

`package.json` version → `0.2.0`

## What does NOT change

- `createConnections` — already expressive
- `IDbAdapter`, `IDbTransaction` — internal adapter interfaces, unaffected
- `ScopedDb` type in `connections/types.ts` — internal, left for a future rename pass
- All query/execute/transaction/mapping APIs — behaviour is identical
- Adapter constructors (`SqliteAdapter`, `PostgresAdapter`, etc.)

## Migration for consumers

```typescript
// Before
import { createDb, Db } from "@phonemyatt/squn";
const db: Db = createDb(adapter);

// After
import { createConnection, Database } from "@phonemyatt/squn";
const db: Database = createConnection(adapter);
```

## Versioning rationale

squn is pre-1.0 with no known production consumers. A clean break at `0.2.0` is the correct semver signal and avoids carrying deprecated aliases.
