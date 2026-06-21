# Connection Pooling

squn uses different pooling strategies per adapter:

| Adapter | Pool management |
|---------|----------------|
| SQLite | Built into Bun.SQL — no external config |
| PostgreSQL | Built into Bun.SQL — configure via `SqunConfig.pool` |
| MySQL | Built into Bun.SQL (mysql2 legacy adapter uses mysql2's internal pool) |
| MSSQL | `ConnectionPool` — squn's own pool, configurable via `PoolConfig` |

## Bun.SQL adapters (SQLite, PostgreSQL, MySQL)

These adapters rely on Bun's built-in connection pool. Set pool options in your adapter config:

```typescript
import { createConnection } from "@phonemyatt/squn";

const db = await createConnection({
  adapter: "postgres",
  host: "localhost",
  database: "mydb",
  pool: {
    min: 2,
    max: 20,
    idleTimeoutMs: 30_000,
    acquireTimeoutMs: 5_000,
  },
});
```

Bun.SQL manages connection lifecycle automatically — you do not call `acquire()` or `release()` directly.

## MSSQL — `ConnectionPool`

MSSQL connections go through squn's `ConnectionPool`, which you can observe and tune independently of the `mssql` driver pool.

### Configuration

```typescript
import { createConnection } from "@phonemyatt/squn";

const db = await createConnection({
  adapter: "mssql",
  server: "localhost",
  database: "mydb",
  pool: {
    min: 1,
    max: 10,
    acquireTimeoutMs: 5_000,
    idleTimeoutMs: 30_000,
    maxConnectionAgeMs: 600_000,  // recycle connections older than 10 min
    maxUseCount: 1_000,           // recycle after 1 000 uses
    reapIntervalMs: 1_000,        // idle reaper tick
    maxQueueSize: 100,            // max queued acquire requests
  },
});
```

### Pool event hooks

```typescript
const db = await createConnection({
  adapter: "mssql",
  // ...
  pool: {
    onConnect: (conn) => console.log("new connection", conn.id),
    onAcquire: (conn) => console.log("acquired", conn.id),
    onRelease: (conn) => console.log("released", conn.id),
    onDestroy: (conn) => console.log("destroyed", conn.id),
    onError:   (err)  => console.error("pool error", err),
  },
});
```

### Reading pool metrics

```typescript
const stats = db.poolStats();
// {
//   total:          number,  // idle + acquired
//   idle:           number,
//   acquired:       number,
//   waiting:        number,  // requests queued for a connection
//   min:            number,
//   max:            number,
//   totalCreated:   number,
//   totalDestroyed: number,
//   totalAcquired:  number,
//   avgAcquireMs:   number,  // exponential moving average
//   avgIdleMs:      number,
//   avgUseMs:       number,
// }
```

### Draining the pool

Call `drain()` before process exit to close all connections gracefully:

```typescript
await db.pool.drain({ timeoutMs: 5_000 });
```

If `timeoutMs` is omitted, drain waits indefinitely for in-flight connections to be released before destroying everything.

## Pool config reference (`PoolConfig`)

| Option | Default | Description |
|--------|---------|-------------|
| `min` | `1` | Minimum connections to keep alive |
| `max` | `10` | Maximum concurrent connections |
| `acquireTimeoutMs` | `5_000` | Max wait time to acquire a connection |
| `idleTimeoutMs` | `30_000` | Evict idle connections after this duration |
| `maxConnectionAgeMs` | `undefined` | Recycle connections older than this |
| `maxUseCount` | `undefined` | Recycle connections after N uses |
| `reapIntervalMs` | `1_000` | Idle reaper check interval (`0` disables) |
| `maxQueueSize` | `100` | Max pending acquire requests before rejection |
