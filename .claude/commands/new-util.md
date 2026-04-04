## Task: Add utility function — $ARGUMENTS

A utility function is a pure, side-effect-free helper that belongs inside an
existing module. It is not a service, not a class, not a feature — just a
focused function that other code in the same module reuses.

---
## Where to put it

Add to the most relevant existing file in the target module. Create a new file
only if no existing file fits and the function is genuinely standalone.

Common targets:
- SQL helpers       → `src/sql/helpers.ts`
- Async helpers     → `src/async/timeout.ts` or a new `src/async/X.ts`
- Type predicates   → the types file closest to what is being narrowed
- Param/core utils  → `src/core/param-builder.ts` or `src/core/type-mapper.ts`
- Error helpers     → `src/errors/wrap.ts`

If none of these fit, propose the location in your response before writing.

---
## Rules

### Pure functions only
```typescript
// ✅ Pure — same input always produces same output, no side effects
export function renumberPlaceholders(text: string, offset: number): string {
  if (offset === 0) return text;
  return text.replace(/\$(\d+)/g, (_, n: string) => `$${Number.parseInt(n, 10) + offset}`);
}

// ❌ Not a util — has I/O, use a service instead
export async function logAndRenumber(text: string, offset: number): Promise<string> {
  console.log("renumbering..."); // I/O = not a util
  return renumberPlaceholders(text, offset);
}
```

- No `async` unless the function is genuinely computing asynchronously (not I/O)
- No module-level state — all inputs through parameters
- No `console.log` — if you need to log, accept a `SqunLogger` parameter
- Use `const` type parameters on generic functions when the type should be inferred literally

### Type safety
- No `any`, no `!`, no `as X` outside a single validated boundary
- Guard all array/record access (noUncheckedIndexedAccess)
- Catch variables are `unknown` — narrow before use
- TS 5.5+: do NOT write manual type predicate functions — TypeScript infers
  them automatically from the function body return type

### Exports
- Export only what other modules need — keep helpers private where possible
- If used only within the same file: do not export
- If used across the module but not externally: export, tag `@internal`
- If part of the public API: tag `@public` and add to `src/index.ts`

---
## Tests
Add a unit test in `tests/unit/$MODULE/$FUNCTION.test.ts` (or extend the
nearest existing test file). Use Bun's native test runner:

```typescript
import { describe, expect, it } from "bun:test";
import { myUtil } from "../../../src/module/utils.ts";

describe("module/myUtil", () => {
  it("describes behaviour", () => {
    expect(myUtil(input)).toBe(expected);
  });
});
```

---
## After generating
1. List the file modified and the function added with a one-line summary
2. Note if the function is exported and at what visibility level (`@public` / `@internal` / unexported)
3. Flag any edge cases the tests do not cover
