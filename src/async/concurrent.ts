/**
 * Runs multiple promises concurrently and returns a typed tuple of results.
 * Wraps Promise.all with correct TypeScript tuple inference so callers get
 * typed results per position rather than (T1 | T2 | ...)[].
 */
export function concurrent<T extends readonly unknown[]>(
  ...queries: { [K in keyof T]: Promise<T[K]> }
): Promise<T> {
  return Promise.all(queries) as Promise<T>;
}
