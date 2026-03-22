Create a file called CLAUDE.md in the project root with exactly this content:

# Squn — Project Memory

## What this project is
A TypeScript-native SQL query library for Bun. Spec: PRD.md. Style: BUN_TYPESCRIPT_STYLE_GUIDE.md.
Always read the relevant PRD section before writing any file.

## Runtime
Bun >= 1.2. PostgreSQL and MySQL use Bun.SQL (native — no postgres.js, no mysql2).
SQLite uses bun:sqlite (native). MSSQL uses the mssql npm package.

## Commands
bun test                          — run all tests
bun test <path>                   — run one test file
bun test --coverage               — run with coverage
bun run typecheck                 — tsc --noEmit
bun run lint                      — biome ci src tests
bun run lint:fix                  — biome check --write src tests
bun run ci                        — typecheck + lint + test:cov

## Hard rules — never break these
- No `any`. No `!` non-null assertion. No floating promises. No console.log in src/.
- All exported functions have explicit return types.
- Use `import type` for type-only imports (verbatimModuleSyntax is on).
- All errors must be SqunError subclasses from src/errors/. Never throw plain Error.
- All driver errors must be wrapped with wrapError() before leaving src/adapters/.
- The core engine (src/core/, src/api/) never imports from src/adapters/ directly.
- src/index.ts is re-exports only — no logic ever goes in there.

## Test rules
- describe("module/file — functionName()") format always.
- it() labels are full English sentences describing condition and expected outcome.
- Every error assertion must check: the class, the ErrorCode, and at least one context field.
- No real database connections in tests/unit/. Use MockAdapter from tests/fixtures/.
- No shared mutable state between tests. Every test is fully self-contained.

## Commit format
feat(scope): description
fix(scope): description
test(scope): description

After creating CLAUDE.md, run: git add CLAUDE.md && git commit -m "chore: add CLAUDE.md"