import { jsonLogger } from "../../logging/json-logger.ts";
import type { SqunConfig } from "../types.ts";

export const PRODUCTION_DEFAULTS: SqunConfig = {
  env: "production",
  pool: {
    min: 5,
    max: 20,
    maxConnectionAgeMs: 3_600_000,
    maxUseCount: 10_000,
  },
  timeout: {
    query: 30_000,
    transaction: 60_000,
  },
  cache: {
    maxSize: 1_000,
    ttlMs: 3_600_000,
    maxAgeMs: 86_400_000,
    reaperIntervalMs: 60_000,
  },
  log: {
    logger: jsonLogger,
    level: "warn",
    slowQueryMs: 1_000,
  },
  errorVerbosity: "minimal",
  maskSensitive: true,
  deadlockRetries: 3,
} as const;
