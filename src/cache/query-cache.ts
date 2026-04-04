import type { CacheConfig } from "../config/types.ts";

/** The compiled representation of a query stored in the cache. */
export interface CompiledQuery {
  readonly normalizedSql: string;
  readonly paramNames: readonly string[];
}

interface CacheEntry {
  ref: WeakRef<CompiledQuery>;
  createdAt: number;
  lastUsedAt: number;
}

/**
 * LRU query cache keyed on Bun.hash() of normalised SQL text.
 * Entries are held via WeakRef so the GC can reclaim them under memory pressure.
 * Supports TTL, max-age, LRU eviction, and a background reaper.
 */
export class QueryCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number | null;
  private readonly maxAgeMs: number | null;
  private reaperTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: CacheConfig = {}) {
    this.maxSize = config.maxSize ?? 1_000;
    this.ttlMs = config.ttlMs === undefined ? null : config.ttlMs;
    this.maxAgeMs = config.maxAgeMs === undefined ? null : config.maxAgeMs;

    const reaperMs =
      config.reaperIntervalMs === undefined ? null : config.reaperIntervalMs;
    if (reaperMs !== null && reaperMs > 0 && this.maxSize > 0) {
      this.reaperTimer = setInterval(() => this.reap(), reaperMs);
      // Allow the process to exit even if the reaper is running
      if (typeof this.reaperTimer === "object" && "unref" in this.reaperTimer) {
        this.reaperTimer.unref();
      }
    }
  }

  /** Returns the cached CompiledQuery or undefined on miss / expiry / GC reclaim. */
  get(sql: string): CompiledQuery | undefined {
    if (this.maxSize === 0) return undefined;

    const key = this.hash(sql);
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;

    const now = Date.now();

    // TTL check — evict if not used within the window
    if (this.ttlMs !== null && now - entry.lastUsedAt > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }

    // Max-age check — evict if created too long ago
    if (this.maxAgeMs !== null && now - entry.createdAt > this.maxAgeMs) {
      this.entries.delete(key);
      return undefined;
    }

    // WeakRef may have been collected
    const compiled = entry.ref.deref();
    if (compiled === undefined) {
      this.entries.delete(key);
      return undefined;
    }

    // Touch for LRU — delete and re-insert so it becomes newest
    entry.lastUsedAt = now;
    this.entries.delete(key);
    this.entries.set(key, entry);

    return compiled;
  }

  /** Stores a CompiledQuery. Evicts the LRU entry if the cache is full. */
  set(sql: string, compiled: CompiledQuery): void {
    if (this.maxSize === 0) return;

    const key = this.hash(sql);

    // If already present, delete so re-insert moves it to newest
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    // LRU eviction — drop the oldest (first) entry
    if (this.entries.size >= this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }

    const now = Date.now();
    this.entries.set(key, {
      ref: new WeakRef(compiled),
      createdAt: now,
      lastUsedAt: now,
    });
  }

  /** Current number of entries (including potentially GC'd WeakRefs). */
  get size(): number {
    return this.entries.size;
  }

  /** Removes all entries and stops the background reaper. */
  clear(): void {
    this.entries.clear();
    if (this.reaperTimer !== null) {
      clearInterval(this.reaperTimer);
      this.reaperTimer = null;
    }
  }

  /** Proactively removes expired and GC'd entries. */
  private reap(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.ref.deref() === undefined) {
        this.entries.delete(key);
        continue;
      }
      if (this.ttlMs !== null && now - entry.lastUsedAt > this.ttlMs) {
        this.entries.delete(key);
        continue;
      }
      if (this.maxAgeMs !== null && now - entry.createdAt > this.maxAgeMs) {
        this.entries.delete(key);
      }
    }
  }

  private hash(sql: string): string {
    return Bun.hash(sql).toString(36);
  }
}
