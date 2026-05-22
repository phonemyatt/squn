## Task: Add library feature — $ARGUMENTS

Run /plan first and wait for approval.

A "feature" adds a new horizontal capability to the squn library
(e.g. query batching, schema diffing, connection mirroring, retry policies).
It must integrate cleanly with the existing `Db` interface and adapter layer.

---
## Files to generate or modify

- src/$ARGUMENTS/types.ts               → types, interfaces, branded IDs
- src/$ARGUMENTS/index.ts               → core implementation
- src/$ARGUMENTS/<supporting>.ts        → helpers, strategies, sub-modules as needed
- src/db.ts                             → extend `Database` interface if adding public methods
- src/index.ts                          → add public exports

---
## Implementation rules

- This is a library — no HTTP, no Zod schemas, no controllers, no route files
- Integrate through `IDbAdapter` — never call driver APIs directly from feature code
- If adding public methods to `Database`, write the interface signature first, implement second
- All errors extend `SqunError` with a meaningful `ErrorCode` in src/errors/codes.ts
- Log notable lifecycle events via the `SqunLogger` interface — never `console.log`
- Any stateful resource must implement `Symbol.asyncDispose`
- Add unit tests in tests/unit/$ARGUMENTS/ before marking complete

## Naming conventions (match existing)
- Factory functions: `create${Feature}()`
- State types: discriminated union string literals (not enums)
- Config types: `${Feature}Config` interface
- Private mutable state: `_camelCase` prefix
- Constants: `UPPER_SNAKE_CASE`

## After generating
1. List all files created or modified with one-line summaries
2. Note any new `ErrorCode` values added to src/errors/codes.ts
3. Show the updated `Database` interface block (method signatures only, if changed)
4. Print any bun commands to verify the feature — never auto-run
5. Flag assumptions and ambiguities
