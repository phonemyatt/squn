# Project Prompt Contract
# Updated June 2026 — audited against live codebase
# Keep this file under 60 lines — detailed rules live in .claude/commands/

## Stack (source of truth)
- TypeScript: 5.9 strict (TS 6.0 readiness aspirational — see Soft Rules)
- Runtime: Bun 1.x (ESM only) — Postgres + SQLite use Bun.SQL (built-in)
- Peer deps (optional): mysql2 ≥3, mssql ≥10
- Target: ESNext (tsconfig: moduleResolution bundler, allowImportingTsExtensions)

## Build & Test (must work on first try — always)
- Install:     bun install
- Type check:  bun run typecheck
- Test:        bun test
- Lint:        bun run lint  (fix: bun run lint:fix)
- Full CI:     bun run ci
- Release:     bunx changelogen --release   (conventional commits required)

## Hard Rules — Tier 1 (block PR if violated)
- No `any` — use `unknown` + narrowing
- No non-null assertion `!` — use ?? or guard
- No `as X` casts outside validated boundary functions
- No TypeScript enums — EXCEPTIONS: ErrorCode, EventCode, IsolationLevel only
- No `require()` or `module.exports`
- No `import ... assert {}` — use `import ... with {}`
- Relative imports must include `.ts` extension (moduleResolution: bundler)
- `import type` for all type-only imports (verbatimModuleSyntax)
- All array/record access guarded (noUncheckedIndexedAccess)
- No `console.log` in src/ — use the `SqunLogger` interface
- `"sideEffects": false` must stay set in package.json

## Soft Rules — Tier 2 (warn in review)
- Prefer `satisfies` over explicit type annotation
- Use `using` / `await using` for disposable resources
- Use `Temporal` API instead of `new Date()` in business logic
- Branded types for all domain ID primitives
- Discriminated unions for all state modeling
- Tag new public exports `@public`; tag exported-but-internal items `@internal`

## Scope Rules (apply to every task)
- NEVER modify files outside the task scope without asking first
- NEVER install new packages without listing them and asking first
- NEVER run DB migrations automatically — print the command only

## Compact Instructions
Preserve: code changes, errors found, key decisions.
Discard: tool call logs, file read confirmations, intermediate steps.

## Detailed contracts — load on demand via slash commands:
- /new-module        → create a new internal module (types + impl + lib)
- /new-feature       → add a new library capability
- /new-entity        → define a table + mapper + inferred types
- /new-endpoint      → add a method to the Database interface
- /new-export        → safely add or remove a public export
- /new-type          → add branded IDs, discriminated unions, Result types
- /new-util          → add a pure utility function to an existing module
- /review-code       → audit a file or folder for TS compliance
- /review-public-api → audit src/index.ts for accidental internals
- /plan              → plan without coding (always run this first)
- /audit-project     → one-time codebase scan to regenerate contracts
