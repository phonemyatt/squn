import type { IDbAdapter } from "../adapters/base.ts";
import type { SqlFragment } from "../sql/fragment.ts";

/**
 * AsyncIterableIterator<T> backed by either a native server cursor
 * (when adapter.hasCursorSupport() is true, future work) or a
 * full-fetch-then-slice fallback for all current adapters.
 *
 * Consumers MUST call close() in a finally block to release resources.
 */
export class Cursor<T> implements AsyncIterableIterator<T> {
  private readonly adapter: IDbAdapter;
  private readonly fragment: SqlFragment;

  private rows: readonly T[] = [];
  private index: number = 0;
  private fetched: boolean = false;
  private closed: boolean = false;

  // _batchSize is reserved for native cursor support (future enhancement)
  constructor(adapter: IDbAdapter, fragment: SqlFragment, _batchSize: number) {
    this.adapter = adapter;
    this.fragment = fragment;
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.closed) {
      return { value: undefined as unknown as T, done: true };
    }

    if (!this.fetched) {
      // Fallback: fetch all rows once (native cursor is a future enhancement)
      const raw = await this.adapter.query(this.fragment.text, this.fragment.params);
      this.rows = raw as T[];
      this.fetched = true;
    }

    if (this.index >= this.rows.length) {
      return { value: undefined as unknown as T, done: true };
    }

    const value = this.rows[this.index] as T;
    this.index++;
    return { value, done: false };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.rows = [];
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }
}
