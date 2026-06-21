## Task: Review TypeScript compliance — $ARGUMENTS

Check in this order. Report everything found — do not stop at the first issue.

---
## BLOCKERS — fix before merge

- `any` used anywhere → file:line
- `enum` keyword outside these three files → file:line
  - `src/errors/codes.ts`          (ErrorCode)
  - `src/logging/logger.ts`        (EventCode)
  - `src/transaction/isolation.ts` (IsolationLevel)
- `require()` or `module.exports` → file:line
- `import ... assert {}` (use `with {}` instead) → file:line
- `target: "es5"` in tsconfig → tsconfig.json
- `module: "AMD"` or `module: "None"` in tsconfig → tsconfig.json
- `console.log/warn/error` inside `src/` (use SqunLogger) → file:line
- Raw `Error` thrown instead of a `SqunError` subclass → file:line
- `"sideEffects"` missing or not `false` in package.json

## TYPE SAFETY — must fix

- Non-null assertion `!` without a preceding guard → file:line
- `as X` cast outside a validated boundary function → file:line
  - Boundary functions are: adapter constructors, `wrapError()`, type-guard predicates
- Array or record indexed without `undefined` check (`noUncheckedIndexedAccess`) → file:line
- Optional field assigned `field = condition ? val : undefined` (`exactOptionalPropertyTypes`) → file:line
- Missing `.ts` extension on a relative import → file:line

## ARCHITECTURE — should fix

- Resource (DB connection / pool / stream) not implementing `Symbol.asyncDispose`
- Value import used where `import type` should be used
- Adapter driver API called directly from feature code (bypass `IDbAdapter`)
- Module-level mutable state (use constructor injection instead)
- Missing guard before an operation that requires a specific state
- New public export in `src/index.ts` missing `@public` or `@internal` TSDoc tag
- Method added to `Database` but not mirrored in `MultiDatabase` (src/db.ts)

## GOOD PATTERNS — call these out positively

- `satisfies` operator in use
- Discriminated unions for state modeling
- Branded types for IDs
- `using` / `await using` for resources
- Guard functions protecting state machines
- Factory functions returning interface types (not concrete shapes)
- `@public` / `@internal` TSDoc tags on exports
- `wrapError()` used consistently in adapter catch blocks

---
## Output format

### Verdict: PASS ✅ / FAIL ❌

### Blockers (fix before merge)
[file:line — what is wrong — exact fix]

### Type Safety Issues
[file:line — what is wrong — exact fix]

### Architecture Warnings
[file:line — what is wrong — why it matters]

### TS 6.0 Readiness
[anything that will need attention when upgrading from 5.9 → 6.0,
 e.g. stricter checks, removed options, renamed APIs]

### Positives
[good patterns found — worth calling out]
