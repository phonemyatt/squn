import { consoleLogger } from "../../logging/console-logger.ts";
import type { SqunConfig } from "../types.ts";

export const DEVELOPMENT_DEFAULTS: SqunConfig = {
  env: "development",
  pool: {
    min: 1,
    max: 5,
  },
  timeout: {
    query: 60_000,
    transaction: 120_000,
  },
  cache: {
    maxSize: 100,
    ttlMs: 300_000,
    maxAgeMs: null,
    reaperIntervalMs: 60_000,
  },
  log: {
    logger: consoleLogger,
    level: "debug",
    slowQueryMs: 200,
  },
  errorVerbosity: "full",
  maskSensitive: false,
  deadlockRetries: 1,
} as const;
