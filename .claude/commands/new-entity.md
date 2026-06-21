## Task: Define table entity — $ARGUMENTS

Generate ONLY these files:

- src/types/$ARGUMENTS.ts        → `defineTable()` definition + inferred types
- src/mapping/$ARGUMENTS.ts      → `defineMapper()` registration (only if row mapping needed)

---
## Table definition rules

Use the fluent `col` builder from `src/types/col.ts` and `defineTable` from `src/types/table.ts`:

```typescript
import { col } from "../types/col.ts";
import { defineTable } from "../types/table.ts";
import type { InferInsert, InferModel, InferUpdate } from "../types/infer.ts";

export const $ARGUMENTSTable = defineTable("table_name", {
  id:        col.int().primaryKey(),
  name:      col.nvarchar(100).notNull(),
  email:     col.nvarchar(255).notNull(),
  age:       col.int().nullable(),
  createdAt: col.datetime().notNull(),
});

export type $ARGUMENTS       = InferModel<typeof $ARGUMENTSTable>;
export type Insert$ARGUMENTS = InferInsert<typeof $ARGUMENTSTable>;
export type Update$ARGUMENTS = InferUpdate<typeof $ARGUMENTSTable>;
```

### Available col builders
| Builder | TS type | Notes |
|---|---|---|
| `col.int()` | `number` | |
| `col.bigint()` | `number` | |
| `col.float()` / `col.decimal(p?)` | `number` | |
| `col.boolean()` | `boolean` | |
| `col.nvarchar(len\|"MAX")` | `string` | preferred for Unicode text |
| `col.varchar(len\|"MAX")` | `string` | |
| `col.text()` | `string` | |
| `col.uuid()` | `string` | |
| `col.datetime()` / `col.date()` | `Date` | |
| `col.json<T>()` | `T` | use a specific type, not `unknown` |
| `col.array<T>()` | `T[]` | PostgreSQL arrays |
| `col.blob()` | `Buffer` | |

### Fluent modifiers (chain after any builder)
- `.notNull()` — required on insert, non-null in model
- `.nullable()` — `T | null` in model, optional on insert
- `.primaryKey()` — implies `.readonly()`
- `.readonly()` — excluded from `InferInsert` and `InferUpdate`
- `.unique()` — metadata only (no runtime enforcement)
- `.computed(expr)` — implies `.readonly()`

### Rules
- Every column needs exactly one nullability modifier (`.notNull()` or `.nullable()`)
- Primary key always uses `.primaryKey()` — never just `.readonly()`
- Do NOT invent columns — base on real schema; flag guesses explicitly
- Do NOT add `createdAt`/`updatedAt`/`isDeleted` unless the table actually has them
- Use `InferModel`, `InferInsert`, `InferUpdate` — never write shape types manually

---
## Mapper rules (only if object mapping is needed)

Use `defineMapper()` from `src/mapping/define-mapper.ts`. Its signature is:

```typescript
defineMapper(cls: Constructor<T>, schema: SchemaLike, factoryOrOptions?)
```

- First arg is a **class** (not a table definition)
- Second arg is a schema with `columnNames` (the table definition satisfies this)
- Third arg is either a factory `(row: Row) => T` or `{ strategy: "property" | "constructor" | "static" }`

```typescript
import { defineMapper } from "../mapping/define-mapper.ts";
import { $ARGUMENTSTable } from "../types/$ARGUMENTS.ts";

class $ARGUMENTS { /* ... */ }

defineMapper($ARGUMENTS, $ARGUMENTSTable, (row) => ({
  // map raw DB row fields to domain object shape
}));
```

Skip this file entirely if callers will use raw rows or `compileMapper()` directly.

---
## Constraints
- `.ts` extensions on all relative imports
- `import type` for type-only imports
- No `any`, no `!`, no `as X`

## After generating
- Flag any column types that required a guess (no schema provided)
- List which `InferX` helpers you used and why
- Note if a mapper was skipped and why
