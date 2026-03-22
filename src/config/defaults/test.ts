import { noopLogger } from "../../logging/noop-logger.ts";
import type { SqunConfig } from "../types.ts";

export const TEST_DEFAULTS: SqunConfig = {
  env: "test",
  pool: {
    min: 1,
    max: 1,
  },
  timeout: {
    query: 5_000,
    transaction: 10_000,
  },
  cache: {
    maxSize: 0,
  },
  log: {
    logger: noopLogger,
    level: "fatal",
  },
  errorVerbosity: "full",
  maskSensitive: false,
  deadlockRetries: 0,
} as const;
