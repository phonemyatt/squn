import { describe, expect, it } from "bun:test";
import { SQUN_ENV_VARS } from "../../../src/config/env-vars.ts";

describe("config/env-vars — SQUN_ENV_VARS", () => {
  const entries = Object.entries(SQUN_ENV_VARS);

  it("contains at least 30 entries", () => {
    expect(entries.length).toBeGreaterThanOrEqual(30);
  });

  for (const [key, value] of entries) {
    it(`${key} is a non-empty string`, () => {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    });

    it(`${key} starts with SQUN_`, () => {
      expect(value.startsWith("SQUN_")).toBe(true);
    });
  }
});
