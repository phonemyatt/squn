import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { resolveConfig } from "../../../src/config/resolve.ts";

describe("config/resolve — resolveConfig()", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.BUN_ENV = process.env.BUN_ENV;
    savedEnv.NODE_ENV = process.env.NODE_ENV;
    delete process.env.BUN_ENV;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    if (savedEnv.BUN_ENV !== undefined) {
      process.env.BUN_ENV = savedEnv.BUN_ENV;
    } else {
      delete process.env.BUN_ENV;
    }
    if (savedEnv.NODE_ENV !== undefined) {
      process.env.NODE_ENV = savedEnv.NODE_ENV;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  describe("environment detection precedence", () => {
    it("uses explicit env arg over BUN_ENV and NODE_ENV", () => {
      process.env.BUN_ENV = "production";
      process.env.NODE_ENV = "production";
      const config = resolveConfig({}, "test");
      expect(config.env).toBe("test");
    });

    it("uses BUN_ENV when no explicit arg is provided", () => {
      process.env.BUN_ENV = "production";
      process.env.NODE_ENV = "test";
      const config = resolveConfig({});
      expect(config.env).toBe("production");
    });

    it("uses NODE_ENV when no explicit arg and no BUN_ENV", () => {
      process.env.NODE_ENV = "test";
      const config = resolveConfig({});
      expect(config.env).toBe("test");
    });

    it("falls back to development when nothing is set", () => {
      const config = resolveConfig({});
      expect(config.env).toBe("development");
    });

    it("falls back to development for an unrecognised env string", () => {
      const config = resolveConfig({}, "staging");
      expect(config.env).toBe("development");
    });
  });

  describe("deep merge — partial overrides", () => {
    it("fills missing fields from the preset", () => {
      const config = resolveConfig({}, "development");
      expect(config.pool?.min).toBe(1);
      expect(config.pool?.max).toBe(5);
      expect(config.timeout?.query).toBe(60_000);
    });

    it("user override replaces a scalar field in a nested object", () => {
      const config = resolveConfig({ pool: { max: 10 } }, "development");
      expect(config.pool?.max).toBe(10);
      // min should still come from preset
      expect(config.pool?.min).toBe(1);
    });

    it("user override replaces a top-level scalar field", () => {
      const config = resolveConfig({ deadlockRetries: 5 }, "production");
      expect(config.deadlockRetries).toBe(5);
    });

    it("null in user config is preserved for disabling features", () => {
      const config = resolveConfig({ cache: { ttlMs: null } }, "development");
      expect(config.cache?.ttlMs).toBeNull();
      // maxSize should still come from preset
      expect(config.cache?.maxSize).toBe(100);
    });

    it("uses test preset values when env is test", () => {
      const config = resolveConfig({}, "test");
      expect(config.pool?.max).toBe(1);
      expect(config.cache?.maxSize).toBe(0);
      expect(config.deadlockRetries).toBe(0);
    });

    it("uses production preset values when env is production", () => {
      const config = resolveConfig({}, "production");
      expect(config.pool?.max).toBe(20);
      expect(config.maskSensitive).toBe(true);
      expect(config.deadlockRetries).toBe(3);
    });
  });
});
