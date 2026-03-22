import { ErrorCode } from "../errors/codes.ts";
import { SqunConfigError } from "../errors/types.ts";
import type { SqunConfig } from "./types.ts";

/**
 * General config sanity checks that apply regardless of environment.
 * Throws SqunConfigError on invalid values.
 */
export function validateConfig(config: SqunConfig): void {
  if (config.pool !== undefined) {
    const { min, max } = config.pool;
    if (min !== undefined && min < 0) {
      throw new SqunConfigError(
        ErrorCode.CONFIG_INVALID_VALUE,
        "pool.min must be >= 0",
        { operation: "validateConfig" },
      );
    }
    if (max !== undefined && max < 1) {
      throw new SqunConfigError(
        ErrorCode.CONFIG_INVALID_VALUE,
        "pool.max must be >= 1",
        { operation: "validateConfig" },
      );
    }
    if (min !== undefined && max !== undefined && min > max) {
      throw new SqunConfigError(
        ErrorCode.CONFIG_INVALID_VALUE,
        "pool.min must be <= pool.max",
        { operation: "validateConfig" },
      );
    }
  }

  if (config.timeout !== undefined) {
    for (const [key, value] of Object.entries(config.timeout)) {
      if (value !== undefined && value < 0) {
        throw new SqunConfigError(
          ErrorCode.CONFIG_INVALID_VALUE,
          `timeout.${key} must be >= 0`,
          { operation: "validateConfig" },
        );
      }
    }
  }

  if (config.tvpCopyThreshold !== undefined && config.tvpCopyThreshold < 0) {
    throw new SqunConfigError(
      ErrorCode.CONFIG_INVALID_VALUE,
      "tvpCopyThreshold must be >= 0",
      { operation: "validateConfig" },
    );
  }

  if (config.deadlockRetries !== undefined && config.deadlockRetries < 0) {
    throw new SqunConfigError(
      ErrorCode.CONFIG_INVALID_VALUE,
      "deadlockRetries must be >= 0",
      { operation: "validateConfig" },
    );
  }

  if (config.cache !== undefined) {
    const { maxSize } = config.cache;
    if (maxSize !== undefined && maxSize < 0) {
      throw new SqunConfigError(
        ErrorCode.CONFIG_INVALID_VALUE,
        "cache.maxSize must be >= 0",
        { operation: "validateConfig" },
      );
    }
  }
}
