const DEFAULT_CAPACITY = 32;

/**
 * Pre-allocated reusable array for param binding.
 * Fills values in-place — no new Array() per query call.
 * Grows automatically when the param count exceeds current capacity.
 */
export class ParamBuffer {
  private buffer: unknown[];
  private len: number;

  constructor(initialCapacity: number = DEFAULT_CAPACITY) {
    this.buffer = new Array<unknown>(initialCapacity);
    this.len = 0;
  }

  /** Resets the buffer for a new query without re-allocating. */
  reset(): void {
    // Clear references so GC can reclaim param values from the previous query
    for (let i = 0; i < this.len; i++) {
      this.buffer[i] = undefined;
    }
    this.len = 0;
  }

  /** Appends a value and returns its index. Grows the buffer if needed. */
  push(value: unknown): number {
    if (this.len >= this.buffer.length) {
      this.grow();
    }
    const index = this.len;
    this.buffer[index] = value;
    this.len++;
    return index;
  }

  /** Returns a view of the filled portion. The returned array is reused — do not hold a reference. */
  toArray(): readonly unknown[] {
    return this.buffer.slice(0, this.len);
  }

  /** Current number of values in the buffer. */
  get length(): number {
    return this.len;
  }

  /** Current allocated capacity. */
  get capacity(): number {
    return this.buffer.length;
  }

  private grow(): void {
    const newCapacity = this.buffer.length * 2;
    const newBuffer = new Array<unknown>(newCapacity);
    for (let i = 0; i < this.len; i++) {
      newBuffer[i] = this.buffer[i];
    }
    this.buffer = newBuffer;
  }
}
