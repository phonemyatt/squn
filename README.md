# Claude Code — TypeScript 6.0 Prompt Contracts

> Generated April 2026. Based on TypeScript 6.0 (March 23 2026 release).

## What's included

```
.claudeignore                    ← Exclude build artefacts (saves tokens every session)
CLAUDE.md                        ← Lean core contract (<60 lines, always loaded)
.claude/
  settings.json                  ← Hooks + permission denies (deterministic enforcement)
  settings.local.json            ← Personal prefs template (add to .gitignore)
  commands/
    plan.md          → /plan           Plan before coding — always run this first
    new-module.md    → /new-module     Create types + service + lib
    new-feature.md   → /new-feature    Full vertical slice
    new-entity.md    → /new-entity     Data entity + repo + schema
    new-endpoint.md  → /new-endpoint   Add endpoint to existing feature
    review-code.md   → /review-code    TS 6.0 compliance audit
    audit-project.md → /audit-project  One-time scan to tailor contracts to your project
```

## Quick start

### 1. Copy files into your project root

```bash
cp -r claude-code-ts-contracts/. your-project/
```

### 2. Tailor to your actual codebase

Run this once inside Claude Code at your project root:

```
/audit-project
```

Claude scans your codebase, shows a summary, waits for your approval,
then rewrites every contract to match your actual patterns.

### 3. Daily workflow

```
/plan add Stripe webhook handler     ← always plan first
/new-feature Webhooks                ← generate after plan approved
/review-code src/features/webhooks/  ← audit before PR
```

## How the layers work

| Layer | File            | Loaded         | Purpose                                             |
| ----- | --------------- | -------------- | --------------------------------------------------- |
| 1     | `.claudeignore` | Always         | Exclude noise files — saves tokens passively        |
| 2     | `CLAUDE.md`     | Every session  | Lean core rules — stack, hard rules, build commands |
| 3     | `settings.json` | Every session  | Hooks run tsc + prettier automatically after edits  |
| 4     | `commands/*.md` | On demand only | Detailed contracts — zero token cost until invoked  |

## Practical usage tips

### Session hygiene

- `/compact` when context hits ~50% — don't wait for auto-compact at 95%
- `/clear` between unrelated tasks — stale context wastes tokens
- `/model sonnet` for 80% of tasks, `/model opus` for architecture decisions only
- `--continue` to resume a previous session with context intact

### Prompting

- Always run `/plan` and approve it before any code generation
- "Prove to me this works" — challenge Claude before accepting output
- "Knowing everything now, scrap this and implement the elegant solution" — after a mediocre fix
- Paste the bug and say "fix" — don't micromanage the approach

### What hooks enforce (not just request)

- **PostToolUse Write/Edit** → runs `tsc --noEmit` + `prettier` automatically
- **PreToolUse Bash** → blocks `rm -rf /`, `DROP TABLE`, `DELETE FROM`, `shutdown`
- **Permissions deny** → Claude cannot read `.env`, `secrets/`, `build/`, `dist/`

### What CLAUDE.md does NOT replace

- `settings.json` for anything that must run 100% of the time
- `.claudeignore` for files Claude should never touch
- `/audit-project` for making contracts match your actual codebase

## TypeScript 6.0 key changes (why the contracts are written this way)

- ES5 target deprecated and removed — minimum is now ES2015, default ES2025
- AMD module system removed
- `import ... assert {}` deprecated — use `import ... with {}`
- `suppressExcessPropertyErrors` and `noImplicitUseStrict` removed from tsconfig
- Decorator metadata is now stable (no experimentalDecorators needed)
- Temporal API types added to DOM lib
- TypeScript 7.0 (Go-native rewrite) is extremely close — these contracts are 7.0-ready

## File to add to .gitignore

```
.claude/settings.local.json
```
