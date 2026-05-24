import { describe, expect, it } from "bun:test";
import type {
  IDbAdapter,
  IDbTransaction,
  TvpMaterialised,
  TvpValue,
} from "../../../src/adapters/base.ts";
import { ErrorCode } from "../../../src/errors/codes.ts";
import { ConnectionError } from "../../../src/errors/types.ts";
import { sql } from "../../../src/sql/tag.ts";
import { AtomicNestingError, runAtomically } from "../../../src/transaction/atomic.ts";
import { IsolationLevel } from "../../../src/transaction/isolation.ts";
import type { Row } from "../../../src/types/primitives.ts";

function mockAdapter(opts?: { queryFail?: boolean; commitFail?: boolean }): IDbAdapter {
  const log: string[] = [];
  const tx: IDbTransaction = {
    async execute(s: string, _p: unknown[]) {
      log.push(`exec:${s}`);
      return { rowsAffected: 1 };
    },
    async query(s: string, _p: unknown[]) {
      log.push(`query:${s}`);
      if (opts?.queryFail) throw new Error("query fail");
      return [{ id: 1 }] as Row[];
    },
    async commit() {
      log.push("commit");
      if (opts?.commitFail) throw new Error("commit fail");
    },
    async rollback() {
      log.push("rollback");
    },
    async savepoint(_n: string) {},
    async releaseSavepoint(_n: string) {},
    async rollbackToSavepoint(_n: string) {},
  };

  return {
    type: "sqlite",
    async execute(_s, _p) {
      return { rowsAffected: 0 };
    },
    async query(_s, _p) {
      return [];
    },
    async queryMultiple(_s, _p) {
      return [];
    },
    async beginTransaction() {
      log.push("begin");
      return tx;
    },
    async executeBatch(
      _s: string,
      _rows: readonly Record<string, unknown>[],
      _p: readonly string[],
    ) {
      return { rowsAffected: 0 };
    },
    hasCursorSupport() {
      return false;
    },
    async ping() {},
    async close() {},
    async materializeTvp(_t: TvpValue, _i: number): Promise<TvpMaterialised> {
      throw new Error("not impl");
    },
    get _log() {
      return log;
    },
  } as IDbAdapter & { _log: string[] };
}

describe("transaction/atomic — runAtomically()", () => {
  describe("successful batch", () => {
    it("sends BEGIN before any query and COMMIT after", async () => {
      const adapter = mockAdapter();
      await runAtomically(adapter, async (q) => {
        await q.execute(sql`INSERT INTO users VALUES (${1})`);
      });
      const log = (adapter as unknown as { _log: string[] })._log;
      expect(log[0]).toBe("begin");
      expect(log[log.length - 1]).toBe("commit");
    });

    it("returns the value returned by the callback", async () => {
      const adapter = mockAdapter();
      const result = await runAtomically(adapter, async () => 42);
      expect(result).toBe(42);
    });
  });

  describe("rollback on failure", () => {
    it("sends ROLLBACK when the callback throws", async () => {
      const adapter = mockAdapter();
      try {
        await runAtomically(adapter, async () => {
          throw new Error("oops");
        });
      } catch {
        /* expected */
      }
      const log = (adapter as unknown as { _log: string[] })._log;
      expect(log).toContain("rollback");
      expect(log).not.toContain("commit");
    });

    it("rethrows the original error after rolling back", async () => {
      const adapter = mockAdapter();
      await expect(
        runAtomically(adapter, async () => {
          throw new Error("original");
        }),
      ).rejects.toThrow("original");
    });
  });

  describe("retry on transient errors", () => {
    it("retries on ConnectionError when retryOnError is true", async () => {
      let attempt = 0;
      const adapter = mockAdapter();
      const result = await runAtomically(
        adapter,
        async () => {
          attempt++;
          if (attempt === 1)
            throw new ConnectionError(ErrorCode.CONN_UNKNOWN, "transient", {
              operation: "q",
            });
          return "ok";
        },
        { retryOnError: true, maxRetries: 2, retryDelayMs: 1 },
      );
      expect(result).toBe("ok");
      expect(attempt).toBe(2);
    });

    it("does not retry on non-ConnectionError even when retryOnError is true", async () => {
      let attempt = 0;
      const adapter = mockAdapter();
      try {
        await runAtomically(
          adapter,
          async () => {
            attempt++;
            throw new Error("not transient");
          },
          { retryOnError: true, maxRetries: 3, retryDelayMs: 1 },
        );
      } catch {
        /* expected */
      }
      expect(attempt).toBe(1);
    });
  });

  describe("isolation level", () => {
    it("issues SET TRANSACTION ISOLATION LEVEL before the callback runs", async () => {
      const adapter = mockAdapter();
      await runAtomically(
        adapter,
        async (q) => {
          await q.execute(sql`SELECT 1`);
        },
        { isolation: IsolationLevel.SERIALIZABLE },
      );
      const log = (adapter as unknown as { _log: string[] })._log;
      expect(log[0]).toBe("begin");
      expect(log[1]).toBe("exec:SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
      expect(log[log.length - 1]).toBe("commit");
    });

    it("skips the SET statement when no isolation is specified", async () => {
      const adapter = mockAdapter();
      await runAtomically(adapter, async (q) => {
        await q.execute(sql`SELECT 1`);
      });
      const log = (adapter as unknown as { _log: string[] })._log;
      expect(log.some((e) => e.startsWith("exec:SET TRANSACTION"))).toBe(false);
    });
  });

  describe("nesting prohibition", () => {
    it("throws AtomicNestingError when atomically is called inside another atomically", async () => {
      const adapter = mockAdapter();
      await expect(
        runAtomically(adapter, async () => {
          await runAtomically(adapter, async () => "inner");
        }),
      ).rejects.toThrow(AtomicNestingError);
    });
  });
});
