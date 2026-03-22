import { describe, it, expect } from "bun:test";
import { validateConfig } from "../../../src/config/validate.ts";
import { SqunConfigError } from "../../../src/errors/types.ts";
import { ErrorCode } from "../../../src/errors/codes.ts";
import type { SqunConfig } from "../../../src/config/types.ts";

describe("config/validate — validateConfig()", () => {
  it("does not throw for a valid config", () => {
    const config: SqunConfig = {
      pool: { min: 1, max: 5 },
      timeout: { query: 5000 },
      deadlockRetries: 1,
      tvpCopyThreshold: 1000,
      cache: { maxSize: 100 },
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it("does not throw for an empty config", () => {
    expect(() => validateConfig({})).not.toThrow();
  });

  describe("pool validation", () => {
    it("throws CONFIG_INVALID_VALUE when pool.min is negative", () => {
      expect(() => validateConfig({ pool: { min: -1 } })).toThrow(SqunConfigError);
      try {
        validateConfig({ pool: { min: -1 } });
      } catch (e) {
        expect((e as SqunConfigError).code).toBe(ErrorCode.CONFIG_INVALID_VALUE);
      }
    });

    it("throws CONFIG_INVALID_VALUE when pool.max is less than 1", () => {
      expect(() => validateConfig({ pool: { max: 0 } })).toThrow(SqunConfigError);
    });

    it("throws CONFIG_INVALID_VALUE when pool.min exceeds pool.max", () => {
      expect(() => validateConfig({ pool: { min: 10, max: 5 } })).toThrow(SqunConfigError);
    });
  });

  describe("timeout validation", () => {
    it("throws CONFIG_INVALID_VALUE when a timeout value is negative", () => {
      expect(() => validateConfig({ timeout: { query: -1 } })).toThrow(SqunConfigError);
    });

    it("does not throw when timeout is zero", () => {
      expect(() => validateConfig({ timeout: { query: 0 } })).not.toThrow();
    });
  });

  describe("tvpCopyThreshold validation", () => {
    it("throws CONFIG_INVALID_VALUE when tvpCopyThreshold is negative", () => {
      expect(() => validateConfig({ tvpCopyThreshold: -1 })).toThrow(SqunConfigError);
    });

    it("does not throw when tvpCopyThreshold is zero", () => {
      expect(() => validateConfig({ tvpCopyThreshold: 0 })).not.toThrow();
    });
  });

  describe("deadlockRetries validation", () => {
    it("throws CONFIG_INVALID_VALUE when deadlockRetries is negative", () => {
      expect(() => validateConfig({ deadlockRetries: -1 })).toThrow(SqunConfigError);
    });
  });

  describe("cache validation", () => {
    it("throws CONFIG_INVALID_VALUE when cache.maxSize is negative", () => {
      expect(() => validateConfig({ cache: { maxSize: -1 } })).toThrow(SqunConfigError);
    });
  });
});
