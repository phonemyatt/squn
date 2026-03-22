import type { SqunLogger } from "./logger.ts";

function noop(): void {}

/** Silent logger — does nothing. Used in test environments. */
export const noopLogger: SqunLogger = {
  debug: noop,
  info:  noop,
  warn:  noop,
  error: noop,
  fatal: noop,
};
