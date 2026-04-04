## Task: Audit this project and generate prompt contracts

You are a senior software architect. Your job is to:
1. Analyze this entire codebase
2. Extract the real patterns, conventions, and structure actually in use
3. Generate a complete prompt contract system for this project

---

## Phase 1: Analyze (read, do not write anything yet)

Scan and understand:
- Overall folder and file structure
- C# project layout (namespaces, layers, patterns used)
- MSSQL schema (entities, relationships, naming conventions)
- Angular structure (modules vs standalone, state management, folder patterns)
- Existing naming conventions (classes, files, tables, columns, components)
- Packages and libraries already installed (NuGet + npm)
- Auth mechanism in use
- Error handling patterns
- Any existing documentation or config files (README, .editorconfig, etc.)

After scanning, output a short summary:
- What architecture pattern is used
- What conventions are consistent across the codebase
- What inconsistencies or missing standards you found
- What files you will generate

Wait for my confirmation before proceeding to Phase 2.

---

## Phase 2: Generate prompt contract files

Generate ONLY these files (no other files):

1. `CLAUDE.md` (project root)
2. `.claude/commands/new-feature.md`
3. `.claude/commands/new-entity.md`
4. `.claude/commands/new-endpoint.md`
5. `.claude/commands/new-angular-component.md`
6. `.claude/commands/review-code.md`

---

## Contract for each file:

### 1. CLAUDE.md
Must include these sections, populated from what you actually found in the codebase:

# Project Prompt Contract

## Stack
[exact versions of .NET, Angular, EF Core, MSSQL from project files]

## Architecture
[actual folder structure with descriptions, based on what exists]

## C# Conventions
- Namespace pattern: [what you observed]
- Controller rules: [thin/fat, return types used]
- Service rules: [patterns observed]
- Repository rules: [generic/specific, patterns observed]
- DTO rules: [naming, separation observed]
- Error handling: [middleware/try-catch pattern observed]
- Async rules: [what's consistently used]

## MSSQL / EF Core Conventions
- Migration naming pattern: [what's used]
- Table naming: [PascalCase/snake_case, singular/plural]
- Column conventions: [audit fields, soft delete, PK pattern]
- Query rules: [raw SQL allowed or LINQ only]

## Angular Conventions
- Component style: [standalone or NgModule — what's actually used]
- State management: [signals/services/ngrx — what's actually used]
- HTTP pattern: [how API calls are structured]
- Form style: [reactive/template-driven]
- Folder pattern per feature: [what you observed]
- Typing rules: [any usage, interface patterns]

## File Generation Rules
### Always generate together:
[based on patterns you observed — what files always exist as a group]

### Never generate unless asked:
[test files, seeds, etc.]

### Naming conventions:
[exact patterns observed — files, classes, components, tables]

## Constraints (apply to every prompt in this project)
- Never change architecture pattern without asking first
- Never install new packages without listing them and asking
- Never modify files outside the scope of the current task
- Never expose domain entities directly in API responses
- Always follow the exact naming conventions above

---

### 2. .claude/commands/new-feature.md
Template for generating a full vertical slice for: $ARGUMENTS

Must scaffold:
- C# files: Entity, DTO (Request + Response), Repository interface,
  Repository implementation, Service interface, Service implementation,
  Controller with full CRUD endpoints, EF DbSet registration,
  FluentValidation validator, Migration command to run
- Angular files: feature folder structure, model interface,
  API service, list component, detail/form component, route registration

Include per-file contracts (what each file must export/contain).
Include verification checklist at the end.

---

### 3. .claude/commands/new-entity.md
Template for generating a new EF Core entity for: $ARGUMENTS

Must scaffold:
- Domain entity class (with audit fields matching project convention)
- EF Core configuration (Fluent API)
- DbSet added to DbContext
- Migration: print the command to run, do not run it
- Generic repository registration in DI
- Response DTO + mapping

Constraints:
- Match exact table/column naming observed in the project
- Match exact audit field pattern observed (CreatedAt, IsDeleted, etc.)

---

### 4. .claude/commands/new-endpoint.md
Template for adding a new API endpoint to an existing feature: $ARGUMENTS
Format: $ARGUMENTS = "FeatureName METHOD /path/description"
Example: "Customer POST /customers/bulk-import Import customers from CSV"

Must generate:
- Controller action method
- Request DTO (if body needed)
- Response DTO
- Service method signature + implementation stub
- FluentValidation rules for the request
- Angular service method
- TypeScript response interface

Constraints:
- Controller must stay thin — logic goes in service
- Always validate before calling service
- Match existing error response format in the project

---

### 5. .claude/commands/new-angular-component.md
Template for generating an Angular component for: $ARGUMENTS
Format: $ARGUMENTS = "feature-name ComponentPurpose"
Example: "customers CustomerListTable"

Must generate:
- Standalone component file
- Component registered in the nearest feature routes file
- If it calls an API: service method + TypeScript interface
- If it has a form: Reactive Form with validators
- Lifecycle: use takeUntilDestroyed() for any subscriptions

Constraints:
- No NgModules
- No `any` types
- No HttpClient in the component — service only
- Match the selector prefix convention observed in the project

---

### 6. .claude/commands/review-code.md
Template for reviewing a file or feature: $ARGUMENTS

Review against:
- Project conventions in CLAUDE.md
- Clean Architecture boundaries (is logic in the right layer?)
- C#: async correctness, DTO separation, thin controllers
- EF Core: N+1 query risks, missing indexes, raw SQL usage
- Angular: memory leaks, any types, business logic in components
- Security: exposed sensitive fields in DTOs, missing auth guards,
  unvalidated inputs

Output format:
## Summary
[2-sentence overall assessment]

## Violations (must fix)
[list with file + line reference + what to change]

## Warnings (should fix)
[list with explanation]

## Suggestions (optional improvements)
[list]

---

## Output rules
- Generate all 6 files
- Use the exact folder paths listed above
- Populate every section from what you actually observed — no placeholders
- If you couldn't determine a convention, flag it as:
  ⚠️ NOT FOUND — recommend: [your suggestion]
- After generating, print a checklist of things I should manually review
  or confirm before trusting these contracts