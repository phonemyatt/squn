import type { IDbAdapter, IDbTransaction, TvpMaterialised, TvpValue } from "../adapters/base.ts";
import type { Row } from "../types/primitives.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Options for {@link createCachedDb}.
 * @public
 */
export interface CacheOptions {
  /**
   * Time-to-live in milliseconds for each cached result.
   * The entry is evicted when it has not been accessed within this window.
   */
  readonly ttl: number;
  /**
   * Maximum number of entries the cache may hold.
   * Oldest-inserted entries are evicted when the limit is reached (FIFO order,
   * since we keep insertion order in the underlying Map).
   * Defaults to 500.
   */
  readonly maxSize?: number;
  /**
   * Custom cache-key function. Receives the raw SQL string and the parameter
   * array and must return a stable string key.
   * Defaults to `sql + JSON.stringify(params)`.
   */
  readonly keyFn?: (sql: string, params: readonly unknown[]) => string;
}

/**
 * Hit/miss counters returned by {@link CachedDb.stats}.
 * @public
 */
export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
}

// ---------------------------------------------------------------------------
// Internal result-cache entry
// ---------------------------------------------------------------------------

interface ResultEntry {
  readonly rows: Row[];
  readonly storedAt: number;
  lastUsedAt: number;
}

// ---------------------------------------------------------------------------
// CachedDb — wraps IDbAdapter and caches query() results
// ---------------------------------------------------------------------------

/**
 * An {@link IDbAdapter} wrapper that caches the results of `query()` calls
 * for the configured TTL. All other adapter methods are delegated to the
 * underlying adapter without modification.
 *
 * Obtain an instance via {@link createCachedDb}.
 * @public
 */
export class CachedDb implements IDbAdapter {
  readonly type: IDbAdapter["type"];

  private readonly _adapter: IDbAdapter;
  private readonly _ttl: number;
  private readonly _maxSize: number;
  private readonly _keyFn: (sql: string, params: readonly unknown[]) => string;
  private readonly _entries = new Map<string, ResultEntry>();
  private _hits = 0;
  private _misses = 0;

  /** @internal */
  constructor(adapter: IDbAdapter, options: CacheOptions) {
    this._adapter = adapter;
    this.type = adapter.type;
    this._ttl = options.ttl;
    this._maxSize = options.maxSize ?? 500;
    this._keyFn = options.keyFn ?? defaultKeyFn;
  }

  // -------------------------------------------------------------------------
  // Cached path
  // -------------------------------------------------------------------------

  async query(sql: string, params: readonly unknown[]): Promise<Row[]> {
    const key = this._keyFn(sql, params);
    const now = Date.now();

    const existing = this._entries.get(key);
    if (existing !== undefined && now - existing.lastUsedAt <= this._ttl) {
      existing.lastUsedAt = now;
      this._hits++;
      // Return a shallow copy so callers cannot mutate the cached array
      return existing.rows.slice();
    }

    // Miss — remove stale entry (if any) before fetching
    if (existing !== undefined) {
      this._entries.delete(key);
    }
    this._misses++;

    const rows = await this._adapter.query(sql, params);
    this._store(key, rows, now);
    return rows;
  }

  // -------------------------------------------------------------------------
  // Delegated adapter methods
  // -------------------------------------------------------------------------

  execute(sql: string, params: readonly unknown[]): Promise<{ rowsAffected: number }> {
    return this._adapter.execute(sql, params);
  }

  queryMultiple(sql: string, params: readonly unknown[]): Promise<Row[][]> {
    return this._adapter.queryMultiple(sql, params);
  }

  executeBatch(
    sql: string,
    rows: readonly Record<string, unknown>[],
    paramNames: readonly string[],
    strategy?: "prepared-loop" | "copy" | "bulk-load",
  ): Promise<{ rowsAffected: number }> {
    return this._adapter.executeBatch(sql, rows, paramNames, strategy);
  }

  beginTransaction(): Promise<IDbTransaction> {
    return this._adapter.beginTransaction();
  }

  hasCursorSupport(): boolean {
    return this._adapter.hasCursorSupport();
  }

  ping(): Promise<void> {
    return this._adapter.ping();
  }

  close(): Promise<void> {
    return this._adapter.close();
  }

  materializeTvp(tvp: TvpValue, index: number): Promise<TvpMaterialised> {
    return this._adapter.materializeTvp(tvp, index);
  }

  // -------------------------------------------------------------------------
  // Cache management
  // -------------------------------------------------------------------------

  /**
   * Returns a snapshot of hit/miss counters and the current cache size.
   * @public
   */
  stats(): CacheStats {
    return {
      hits: this._hits,
      misses: this._misses,
      size: this._entries.size,
    } satisfies CacheStats;
  }

  /**
   * Invalidates cache entries.
   *
   * - No argument → clears all entries.
   * - `string` → removes the exact entry matching that key.
   * - `RegExp` → removes all entries whose key matches the pattern.
   *
   * @public
   */
  invalidate(keyOrPattern?: string | RegExp): void {
    if (keyOrPattern === undefined) {
      this._entries.clear();
      return;
    }

    if (typeof keyOrPattern === "string") {
      this._entries.delete(keyOrPattern);
      return;
    }

    // RegExp path
    for (const key of this._entries.keys()) {
      if (keyOrPattern.test(key)) {
        this._entries.delete(key);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _store(key: string, rows: Row[], now: number): void {
    if (this._maxSize === 0) return;

    // Evict oldest (first-inserted) entry when full
    if (this._entries.size >= this._maxSize) {
      const oldest = this._entries.keys().next().value;
      if (oldest !== undefined) {
        this._entries.delete(oldest);
      }
    }

    this._entries.set(key, { rows, storedAt: now, lastUsedAt: now });
  }
}

function defaultKeyFn(sql: string, params: readonly unknown[]): string {
  return `${sql}\0${JSON.stringify(params)}`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Wraps an existing {@link IDbAdapter} with a result cache.
 *
 * ```ts
 * const db = createCachedDb(adapter, { ttl: 5_000, maxSize: 200 });
 * // query() results are now cached for 5 seconds
 * db.cache.invalidate();  // clear all
 * db.cache.stats();       // { hits, misses, size }
 * ```
 *
 * @public
 */
export function createCachedDb(adapter: IDbAdapter, options: CacheOptions): CachedDb {
  return new CachedDb(adapter, options);
}
