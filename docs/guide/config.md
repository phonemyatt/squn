# Configuration

`createConnection` accepts an optional `Partial<SqunConfig>` as its second argument.

```typescript
const db = createConnection(adapter, {
  environment: "production",
  pool: { min: 2, max: 10, acquireTimeoutMs: 5_000 },
  timeout: { queryMs: 30_000, transactionMs: 60_000 },
  log: { logger: myLogger, level: "info" },
  security: { blockRawSql: true, detectInjection: true },
});
```

## Environment presets

squn ships presets for `"development"`, `"test"`, and `"production"`. Set `environment` or the `SQUN_ENV` environment variable:

```bash
SQUN_ENV=production bun run start
```

Production preset enforces stricter pool settings and blocks localhost connections without an explicit override.

## Pool config

```typescript
pool: {
  min:              2,       // minimum idle connections
  max:              10,      // maximum concurrent connections
  acquireTimeoutMs: 5_000,   // throw PoolError after this wait
  idleTimeoutMs:    60_000,  // recycle idle connections after this
  maxAgeMs:         600_000, // recycle connections older than this
  maxUseCount:      1_000,   // recycle connections after N uses
}
```

## Timeout config

```typescript
timeout: {
  queryMs:       30_000,  // per-query timeout
  transactionMs: 60_000,  // per-transaction timeout
}
```

## Logging

squn ships three loggers. Pass any object implementing `SqunLogger`:

```typescript
import { jsonLogger, consoleLogger, noopLogger } from "@phonemyatt/squn";

createConnection(adapter, { log: { logger: jsonLogger, level: "debug" } });
createConnection(adapter, { log: { logger: consoleLogger } });
createConnection(adapter, { log: { logger: noopLogger } });  // default
```

### Custom logger

```typescript
import type { SqunLogger } from "@phonemyatt/squn";

const myLogger: SqunLogger = {
  log(entry) {
    myObservabilityPlatform.emit(entry.event, entry);
  },
};
```

## Security config

```typescript
security: {
  blockRawSql:      true,  // block sqlRaw() in production
  detectInjection:  true,  // scan all SQL for injection patterns
  allowedOperations: ["SELECT"], // allowlist DML operations
}
```

### `allowedOperations` — restricting SQL operations

Use `allowedOperations` to enforce an allowlist of SQL operation types. squn inspects each statement before it reaches the adapter and throws `SecurityError` (`ErrorCode.OPERATION_NOT_ALLOWED`) if the operation is not in the list.

```typescript
import { createConnection, SqliteAdapter, sql } from "@phonemyatt/squn";

const db = createConnection(new SqliteAdapter({ filename: "app.db" }), {
  security: {
    allowedOperations: ["SELECT"], // only SELECT statements are permitted
  },
});

// This works:
const users = await db.query(sql`SELECT * FROM users`);

// This throws SecurityError before touching the adapter:
await db.execute(sql`DROP TABLE users`);
```

Allowed values for `allowedOperations`:

| Value       | Permits                                      |
|-------------|----------------------------------------------|
| `"SELECT"`  | `SELECT` queries                             |
| `"INSERT"`  | `INSERT` statements                          |
| `"UPDATE"`  | `UPDATE` statements                          |
| `"DELETE"`  | `DELETE` statements                          |
| `"DDL"`     | `CREATE`, `DROP`, `ALTER`, `TRUNCATE`, etc.  |

Omitting `allowedOperations` (the default) permits all operation types. To allow reads and writes but block schema changes, use:

```typescript
security: {
  allowedOperations: ["SELECT", "INSERT", "UPDATE", "DELETE"],
}
```

This is useful for application accounts that should never run DDL in production, or for building readonly query services on top of a shared connection pool.

## Environment variables

squn reads connection details from environment variables when no explicit config is provided:

| Variable         | Description                    |
|-----------------|--------------------------------|
| `SQUN_ENV`      | `development` / `test` / `production` |
| `SQUN_PG_URL`   | PostgreSQL connection URL      |
| `SQUN_MYSQL_URL`| MySQL connection URL           |
| `SQUN_MSSQL_URL`| MSSQL connection URL           |
| `SQUN_DB_FILE`  | SQLite database file path      |
