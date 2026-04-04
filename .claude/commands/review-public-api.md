## Task: Review public API surface

Audit `src/index.ts` and `package.json` for surface-area hygiene.
Read both files fully before reporting anything.

---
## Check 1 — Accidental internal exports

For every symbol in `src/index.ts`, classify it:

| Class | Criteria | Action |
|---|---|---|
| **Stable public** | Consumer-facing, documented, `@public` tag | Keep |
| **Intentional internal** | Cross-module helper, `@internal` + `_` prefix | Flag — consider removing or sub-pathing |
| **Leaked internal** | No TSDoc tag, implementation detail, unlikely to be used by consumers | Flag — should be `@internal` or unexported |
| **Duplicate** | Same symbol exported under two names | Flag — pick one, deprecate the other |

Known over-exposed symbols to look for (found in initial audit):
- `SQUN_REGEX` — internal regex constants
- `buildParams` — internal param binding utility
- `ParamBuffer` — internal performance buffer
- `BunSqlStatsFacade` — Bun-specific internal detail
- `globalMapperRegistry` — mutable global singleton
- `validateProductionConfig` — internal validation step

---
## Check 2 — package.json exports map

Verify these conditions:

```json
{
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",   ← "types" MUST come before "default"
        "default": "./dist/index.js"
      }
    }
  },
  "sideEffects": false   ← must be present
}
```

- `"types"` condition must precede `"default"` inside each condition object
- `"sideEffects": false` must be set (enables tree-shaking in bundlers)
- Sub-path entries must mirror actual dist/ file paths exactly

---
## Check 3 — Exports map tooling

Run these commands and report their output verbatim:

```bash
# Checks that "exports" conditions and .d.ts files are correctly wired
bunx attw --pack .

# Validates package.json fields against npm/Node best practices
bunx publint
```

If attw or publint are not installed, print the install command:
```bash
bun add -d @arethetypeswrong/cli publint
```

---
## Check 4 — Tree-shaking hygiene

Flag any of these in `src/`:
- Top-level side effects (code that runs at import time outside of function bodies)
- `console.log/warn/error` at module scope
- Immediately-invoked expressions that mutate global state

`globalMapperRegistry` in `src/mapping/mapper-registry.ts` is a known
module-level singleton — flag it if it executes code at import time.

---
## Check 5 — Sub-path export candidates

Flag symbols that are:
- Adapter-specific (e.g., `MssqlAdapter`) — candidates for `./mssql` sub-path
- Large standalone utilities unlikely to be used with the core `Db` API
- Currently `@internal` but leaking through the main barrel

---
## Output format

### Verdict: CLEAN ✅ / NEEDS WORK ⚠️

### Accidental internals
[symbol — why it looks internal — suggested action]

### exports map issues
[specific field — what is wrong — exact fix]

### attw output
[paste verbatim]

### publint output
[paste verbatim]

### Tree-shaking risks
[file:line — what runs at import time — impact]

### Sub-path candidates
[symbol — rationale — suggested sub-path name]
