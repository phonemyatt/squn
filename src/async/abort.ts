/**
 * AbortController-based timeout helpers.
 * Lower-level than src/async/timeout.ts — no TimeoutError thrown,
 * just signal management.
 */

/**
 * Runs fn with an AbortSignal that fires after ms.
 * Timer is always cleared in a finally block — no leaks.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns an AbortSignal that fires after ms, plus a clear() function
 * the caller MUST invoke in a finally block to prevent the timer leaking.
 */
export function createTimeoutSignal(ms: number): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}
