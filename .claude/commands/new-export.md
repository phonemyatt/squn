## Task: Manage public export — $ARGUMENTS
## Format: "add|remove|deprecate  SymbolName  from src/path/to/file.ts"
## Examples:
##   "add queryBatch from src/api/batch.ts"
##   "deprecate globalMapperRegistry from src/mapping/mapper-registry.ts"
##   "remove SQUN_REGEX from src/sql/regex.ts"

---
## Adding an export

### Step 1 — Tag the symbol at its source
Add a TSDoc tag to the declaration before touching `src/index.ts`:

```typescript
/** @public — stable API, subject to semver */
export function queryBatch(...) {}

/** @internal — exported for cross-module use, not part of public API */
export function _buildBatchParams(...) {}
```

Use `@public` for anything a consumer should depend on.
Use `@internal` for cross-module helpers you must export but do not want
in the public contract. Pair `@internal` with a `_` prefix.

### Step 2 — Add to src/index.ts
Follow the existing comment-block structure (grouped by module):

```typescript
// API
export { queryBatch } from "./api/batch.ts";
export type { BatchOptions } from "./api/batch.ts";
```

`export type` for type-only re-exports — never `export { SomeType }`.

### Step 3 — Consider sub-path exports
If the symbol is adapter-specific or large enough that most consumers
won't need it, consider a sub-path entry instead of the main barrel:

```json
// package.json "exports"
"./batch": {
  "import": { "types": "./dist/api/batch.d.ts", "default": "./dist/api/batch.js" }
}
```

Sub-paths keep the main bundle lean and tree-shaking reliable.

### Step 4 — Verify before committing
```bash
# Verify exports map is correct and .d.ts files align
bunx attw --pack .

# Validate package.json fields
bunx publint

# Confirm "sideEffects": false is still set (check package.json manually)
```

---
## Removing an export

Never remove a `@public` export without a deprecation cycle, even at 0.x:

1. Add `@deprecated Use newApi() instead. Will be removed in next minor.` TSDoc
2. Keep the export for one release
3. Remove in the following release and document in CHANGELOG.md

For `@internal` exports: remove without ceremony. They are not part of the contract.

---
## Deprecating an export

```typescript
/**
 * @deprecated Use `queryBatch()` instead. Will be removed in v0.3.
 * @public
 */
export function oldQueryApi(...) {
  return queryBatch(...);
}
```

Log a one-time warning via `SqunLogger` if it helps consumers find the issue at runtime.

---
## After changes
- Run `bun run ci` to confirm nothing is broken
- List every symbol added, removed, or deprecated with its `@public`/`@internal` status
- Note if `package.json "exports"` was modified
