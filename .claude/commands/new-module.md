## Task: Create TypeScript module — $ARGUMENTS

Run /plan first. Once approved, generate ONLY these files:

- src/$ARGUMENTS/types.ts       → interfaces, branded IDs, discriminated unions
- src/$ARGUMENTS/index.ts       → core implementation
- src/index.ts                  → modify existing — add public exports only

---
## When to use a class vs a factory function

**Use a class** when the module holds open resources (connections, pools, streams, timers).
- Implement `Symbol.asyncDispose` so `await using` works
- Constructor must throw a typed `SqunError` subclass — never raw `Error`
- Example: `MysqlAdapter`, `CachedDb`, `ConnectionPool`

**Use a factory function** when the module is stateless or composes adapters.
- Return an interface type, not the concrete shape
- Accept dependencies via parameters — no module-level globals
- Example: `createCachedDb()`, `createConnection()`

---
## Per-file contracts

### types.ts
- Branded ID if needed: `type ${ARGUMENTS}Id = string & { readonly __brand: '${ARGUMENTS}Id' }`
- Discriminated union for all state — never raw string literals in switch
- `import type` only — zero value imports in this file
- No `any`, no `!`, no `as X`

### index.ts (implementation)
- All fallible paths throw typed `SqunError` subclasses — never throw raw `Error`
- Log lifecycle events via injected `SqunLogger` — never `console.log`
- `await using` for any callers who hold resources; implement `Symbol.asyncDispose` if applicable

### src/index.ts (public API surface)
- Add named exports for all public types and functions
- `export type` for type-only re-exports

---
## Constraints (every file)
- `.ts` extensions on all relative imports (moduleResolution: bundler)
- `import type` for type-only imports (verbatimModuleSyntax)
- No `any`, no `!`, no `as X` outside validated boundary functions
- Guard all array/record access before use (noUncheckedIndexedAccess)
- Catch variables are `unknown` — always narrow before accessing properties
- Error construction: `new XError(ErrorCode.X, "message", { context }, cause)`

## After generating
1. List each file with a one-line summary
2. List any packages imported that are not already in package.json
3. Flag anything you had to guess or assume
