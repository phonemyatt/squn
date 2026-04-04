## Task: Audit this project and regenerate all prompt contracts

You are a senior TypeScript architect. Read the codebase first — write nothing yet.

---
## Phase 1: Scan (read only)

Analyse:
- tsconfig.json — exact compiler flags in use
- package.json — TS version, runtime, frameworks, test runner
- Folder and file structure — actual layout, not ideal
- Naming conventions — files, classes, interfaces, functions
- Existing patterns — how services, repos, controllers are structured
- Error handling style — throw vs Result, middleware vs try/catch
- Import style — ESM vs CJS, extensions used or not
- Any existing CLAUDE.md or .claude/ configuration

Then output a summary:
- TypeScript version detected
- Architecture pattern identified
- Conventions that are consistent
- Inconsistencies or missing standards found
- Files you will generate or update

**Wait for my confirmation before Phase 2.**

---
## Phase 2: Regenerate contracts

Update or create these files to reflect what you ACTUALLY found:
1. CLAUDE.md
2. .claude/settings.json
3. .claude/commands/new-module.md
4. .claude/commands/new-feature.md
5. .claude/commands/new-entity.md
6. .claude/commands/new-endpoint.md
7. .claude/commands/review-code.md

For every section, populate from observed patterns.
If a convention is missing, flag it as:
⚠️ NOT FOUND — recommend: [your suggestion]

After generating, print a checklist of things I should manually verify
before trusting these contracts.
