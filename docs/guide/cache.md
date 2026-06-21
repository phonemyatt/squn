# Query Result Cache

`createCachedDb` wraps any adapter with a TTL-based result cache. `query()` calls are cached; `execute()`, `beginTransaction()`, and all other methods are delegated to the underlying adapter without caching.

## Setup

```typescript
import { createConnection, createCachedDb } from "@phonemyatt/squn";

const db = await createConnection({ adapter: "postgres", /* ... */ });
const cached = createCachedDb(db.adapter, { ttl: 5_000 });

// query() results are now cached for 5 seconds
const users = await cached.query("SELECT * FROM users WHERE active = $1", [true]);
```

## Options

```typescript
const cached = createCachedDb(db.adapter, {
  ttl: 5_000,       // required — TTL in ms; entry evicted after this idle window
  maxSize: 200,     // max entries (default 500); oldest-inserted evicted when full
  keyFn: (sql, params) => `${sql}|${JSON.stringify(params)}`,  // custom cache key
});
```

### Cache key

By default the key is `sql + "\0" + JSON.stringify(params)`. Supply `keyFn` when you need a different strategy — for example, hashing the SQL for shorter keys, or ignoring certain parameters.

## Inspecting the cache

```typescript
const stats = cached.stats();
// { hits: number, misses: number, size: number }
```

## Invalidating entries

```typescript
cached.invalidate();                    // clear everything
cached.invalidate("SELECT * FROM …\0…"); // exact key
cached.invalidate(/^SELECT.*users/);    // RegExp — removes all matching keys
```

Invalidate after writes to keep the cache consistent:

```typescript
await db.execute(sql`UPDATE users SET name = ${"Alice"} WHERE id = ${1}`);
cached.invalidate(/users/);
```

## Using with the `Database` interface

`createCachedDb` returns a `CachedDb` which implements `IDbAdapter`. Pass it to `createConnection` or use it directly with your query functions:

```typescript
import { query } from "@phonemyatt/squn";

const rows = await query(cached, sql`SELECT * FROM products WHERE in_stock = ${true}`);
```

## Caveats

- Only `query()` results are cached. `execute()` always hits the database.
- The cache does not invalidate automatically on writes — call `invalidate()` after mutations.
- Entries are shallow-copied on return so callers cannot mutate cached arrays.
- When `maxSize` is reached, the oldest-inserted entry is evicted (FIFO).

## API reference

```typescript
interface CacheOptions {
  readonly ttl: number;                                             // idle TTL in ms
  readonly maxSize?: number;                                        // default 500
  readonly keyFn?: (sql: string, params: readonly unknown[]) => string;
}

interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
}

class CachedDb implements IDbAdapter {
  stats(): CacheStats;
  invalidate(keyOrPattern?: string | RegExp): void;
  // + all IDbAdapter methods
}

function createCachedDb(adapter: IDbAdapter, options: CacheOptions): CachedDb;
```
