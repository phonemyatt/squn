import { describe, it, expect } from "bun:test";
import { TransactionClock } from "../../../src/async/clock.ts";

describe("async/clock — TransactionClock", () => {
  describe("elapsed()", () => {
    it("returns a non-negative number immediately after creation", () => {
      const clock = new TransactionClock();
      expect(clock.elapsed()).toBeGreaterThanOrEqual(0);
    });

    it("increases over time", () => {
      const clock = new TransactionClock();
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait
      }
      expect(clock.elapsed()).toBeGreaterThanOrEqual(4);
    });
  });

  describe("remaining()", () => {
    it("returns approximately budgetMs immediately after creation", () => {
      const clock = new TransactionClock();
      const rem = clock.remaining(10_000);
      expect(rem).not.toBeNull();
      // Should be very close to 10000
      expect(rem as number).toBeGreaterThan(9_900);
      expect(rem as number).toBeLessThanOrEqual(10_000);
    });

    it("returns null when budgetMs is 0 (no budget)", () => {
      const clock = new TransactionClock();
      expect(clock.remaining(0)).toBeNull();
    });

    it("returns null when budgetMs is negative (no budget)", () => {
      const clock = new TransactionClock();
      expect(clock.remaining(-1)).toBeNull();
    });

    it("returns 0 instead of negative when budget is exhausted", () => {
      const clock = new TransactionClock();
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait
      }
      const rem = clock.remaining(1);
      expect(rem).toBe(0);
    });

    it("decreases as time passes", () => {
      const clock = new TransactionClock();
      const first = clock.remaining(10_000) as number;
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait
      }
      const second = clock.remaining(10_000) as number;
      expect(second).toBeLessThan(first);
    });
  });

  describe("expired()", () => {
    it("returns false immediately after creation with a large budget", () => {
      const clock = new TransactionClock();
      expect(clock.expired(10_000)).toBe(false);
    });

    it("returns true after the budget has been exceeded", () => {
      const clock = new TransactionClock();
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait
      }
      expect(clock.expired(1)).toBe(true);
    });

    it("returns false when budgetMs is 0 (no budget means never expires)", () => {
      const clock = new TransactionClock();
      expect(clock.expired(0)).toBe(false);
    });

    it("returns false when budgetMs is negative", () => {
      const clock = new TransactionClock();
      expect(clock.expired(-1)).toBe(false);
    });
  });
});
