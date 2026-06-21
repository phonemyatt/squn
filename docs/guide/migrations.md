# Migrations

squn's migration runner applies schema changes in a defined order, tracks which migrations have been applied, and supports rolling individual migrations back.

Migrations are plain objects — no files to scan, no conventions to follow. You control how they are loaded and ordered.

## Defining migrations

```typescript
import type { Migration } from "@phonemyatt/squn";

const migrations: Migration[] = [
  {
    id: "001_create_users",
    up: `
      CREATE TABLE users (
        id   INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        name TEXT    NOT NULL,
        email TEXT   NOT NULL UNIQUE
      )
    `,
    down: `DROP TABLE users`,
  },
  {
    id: "002_add_role_to_users",
    up: `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'`,
    down: `ALTER TABLE users DROP COLUMN role`,
  },
];
```

`id` must be unique across all migrations. Use a prefix (timestamp or sequence number) to enforce run order.

`down` is optional — if omitted, the migration cannot be rolled back via `rollbackMigration()`.

## Running migrations

```typescript
import { createConnection, runMigrations } from "@phonemyatt/squn";

const db = await createConnection({ adapter: "postgres", /* ... */ });

const result = await runMigrations(db.adapter, migrations);
// result.applied → string[] of migration IDs applied this run
// result.skipped → string[] of IDs already recorded, skipped
```

`runMigrations` creates a tracking table (`_squn_migrations`) on first run. Each pending migration runs inside a transaction — if it fails, the transaction is rolled back and a `TransactionError` is thrown.

### Options

```typescript
await runMigrations(db.adapter, migrations, {
  tableName: "_myapp_migrations",  // override tracking table name
  logger: myLogger,                // SqunLogger for lifecycle events
});
```

## Rolling back a migration

```typescript
import { rollbackMigration } from "@phonemyatt/squn";

await rollbackMigration(db.adapter, "002_add_role_to_users", migrations);
```

`rollbackMigration` runs the `down` SQL in a transaction and removes the record from the tracking table. It throws if:
- The migration ID is not found in the `migrations` array
- The migration has no `down` SQL
- The migration is not recorded as applied

## Accessing the adapter directly

`runMigrations` accepts `IDbAdapter`, not `Database`. Access it via `db.adapter`:

```typescript
await runMigrations(db.adapter, migrations);
```

## Example: loading migrations from files

squn does not scan directories — load your SQL files and build the array yourself:

```typescript
import { readdir, readFile } from "node:fs/promises";

async function loadMigrations(dir: string): Promise<Migration[]> {
  const files = (await readdir(dir)).filter(f => f.endsWith(".sql")).sort();
  return Promise.all(
    files.map(async (file) => ({
      id: file.replace(/\.sql$/, ""),
      up: await readFile(`${dir}/${file}`, "utf8"),
    })),
  );
}

const migrations = await loadMigrations("./migrations");
await runMigrations(db.adapter, migrations);
```

## Migration interface

```typescript
interface Migration {
  readonly id: string;         // unique identifier, determines order
  readonly up: string;         // SQL to apply
  readonly down?: string;      // SQL to revert (optional)
}

interface MigrationResult {
  readonly applied: string[];  // IDs applied this run
  readonly skipped: string[];  // IDs already recorded
}
```
