import { describe, it, expect } from "bun:test";
import { resolveTimeout, withTimeout } from "../../../src/async/timeout.ts";
import { TimeoutError } from "../../../src/errors/types.ts";
import type { TimeoutConfig } from "../../../src/config/types.ts";

function makeClock(remainingMs: number | null): { remaining: () => number | null } {
  return { remaining: () => remainingMs };
}

const globalConfig: TimeoutConfig = { query: 30_000, transaction: 60_000 };

describe("async/timeout — resolveTimeout()", () => {
  describe("precedence — call-site option", () => {
    it("uses the call-site timeoutMs when it is shorter than the global", () => {
      const result = resolveTimeout(5_000, undefined, globalConfig, "query");
      expect(result).toBe(5_000);
    });

    it("uses the call-site timeoutMs even when longer than the global", () => {
      const result = resolveTimeout(60_000, undefined, globalConfig, "query");
      expect(result).toBe(60_000);
    });

    it("uses the call-site timeoutMs when no global is set", () => {
      const result = resolveTimeout(10_000, undefined, {}, "query");
      expect(result).toBe(10_000);
    });

    it("uses null when neither call-site nor global is set", () => {
      const result = resolveTimeout(undefined, undefined, {}, "query");
      expect(result).toBeNull();
    });

    it("uses the global timeout when no call-site option is provided", () => {
      const result = resolveTimeout(undefined, undefined, globalConfig, "query");
      expect(result).toBe(30_000);
    });
  });

  describe("precedence — transaction budget", () => {
    it("caps the resolved timeout to the remaining transaction budget", () => {
      const result = resolveTimeout(50_000, makeClock(10_000), globalConfig, "query");
      expect(result).toBe(10_000);
    });

    it("uses the remaining budget when no call-site or global timeout is set", () => {
      const result = resolveTimeout(undefined, makeClock(5_000), {}, "query");
      expect(result).toBe(5_000);
    });

    it("uses the remaining budget when it is shorter than both call-site and global", () => {
      const result = resolveTimeout(20_000, makeClock(3_000), globalConfig, "query");
      expect(result).toBe(3_000);
    });

    it("uses the call-site timeout when it is shorter than the remaining budget", () => {
      const result = resolveTimeout(2_000, makeClock(10_000), globalConfig, "query");
      expect(result).toBe(2_000);
    });

    it("ignores budget when remaining returns null", () => {
      const result = resolveTimeout(5_000, makeClock(null), globalConfig, "query");
      expect(result).toBe(5_000);
    });
  });

  describe("withTimeout()", () => {
    it("resolves normally when the operation completes before the deadline", async () => {
      const result = await withTimeout(async () => "done", 1_000);
      expect(result).toBe("done");
    });

    it("throws TimeoutError when the operation exceeds the deadline", async () => {
      try {
        await withTimeout(
          (signal) =>
            new Promise((_resolve, reject) => {
              const id = setTimeout(() => _resolve(undefined), 5_000);
              signal.addEventListener("abort", () => {
                clearTimeout(id);
                reject(signal.reason);
              });
            }),
          10,
          "slow_query",
        );
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(TimeoutError);
        expect((e as TimeoutError).message).toContain("slow_query");
        expect((e as TimeoutError).message).toContain("10ms");
      }
    });

    it("propagates non-timeout errors unchanged", async () => {
      try {
        await withTimeout(async () => {
          throw new Error("boom");
        }, 1_000);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toBe("boom");
        expect(e).not.toBeInstanceOf(TimeoutError);
      }
    });
  });
});
