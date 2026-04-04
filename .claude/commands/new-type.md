## Task: Add TypeScript type constructs — $ARGUMENTS

This command is for pure TypeScript type work: branded IDs, discriminated unions,
Result types, const status objects, utility types. Not for DB table definitions
(use /new-entity for that).

Add to the most relevant existing `types.ts` file in the module, or create
`src/$MODULE/types.ts` if none exists. Never create a file just for one type.

---
## Patterns — use exactly these shapes

### Branded ID
```typescript
type UserId = string & { readonly __brand: "UserId" };

function asUserId(raw: string): UserId {
  return raw as UserId; // only cast at validated boundaries
}
```

One brand per domain concept. Never use raw `string` or `number` for IDs
that cross module boundaries.

### Discriminated union (state modeling)
```typescript
type QueryState =
  | { status: "idle" }
  | { status: "running"; startedAt: Date }
  | { status: "done"; rows: Row[]; durationMs: number }
  | { status: "failed"; error: SqunError };
```

- Use a `status` string literal discriminant (not a numeric or enum discriminant)
- Every branch carries only the data that exists in that state
- Never use optional fields to represent state — use separate branches

### Result type (for fallible operations that should not throw)
```typescript
type Result<T, E extends SqunError = SqunError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}
function err<E extends SqunError>(error: E): Result<never, E> {
  return { ok: false, error };
}
```

Use `Result<T,E>` when the caller is expected to handle the failure inline.
Use `throw` (with a `SqunError` subclass) for unexpected/unrecoverable errors.

### Const status object (replaces enums)
```typescript
const PoolStatus = {
  IDLE:     "IDLE",
  ACQUIRED: "ACQUIRED",
  DRAINED:  "DRAINED",
} as const;

type PoolStatus = (typeof PoolStatus)[keyof typeof PoolStatus];
```

The `as const` object provides runtime values; the derived type provides
type safety. No `enum` keyword needed (except the three permitted ones).

### Utility / mapped types
```typescript
// Extract only the writable keys of a type
type Writable<T> = {
  -readonly [K in keyof T]: T[K];
};
```

Prefer built-in `Partial`, `Required`, `Readonly`, `Pick`, `Omit` before
writing custom mapped types. Only create a utility type if you need it in
two or more places.

---
## Constraints (every file)
- `import type` only — zero value imports in a types-only file
- No `any`, no `!`, no `as X` except at the single validated boundary function
- Catch variables are `unknown` — always narrow before accessing properties
- `.ts` extensions on all relative imports

## After generating
1. List each type/construct with a one-line purpose summary
2. Flag any type that required a guess about domain semantics
3. Note where you placed the type and why
