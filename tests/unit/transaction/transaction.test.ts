import { describe, expect, it } from "bun:test";
import type { IDbTransaction } from "../../../src/adapters/base.ts";
import { ErrorCode } from "../../../src/errors/codes.ts";
import { TransactionError } from "../../../src/errors/types.ts";
import { Transaction } from "../../../src/transaction/transaction.ts";
import type { Row } from "../../../src/types/primitives.ts";

function mockTx(opts?: {
  commitFail?: boolean;
  rollbackFail?: boolean;
}): IDbTransaction {
  return {
    async execute(_s: string, _p: unknown[]) {
      return { rowsAffected: 1 };
    },
    async query(_s: string, _p: unknown[]) {
      return [{ id: 1 }] as Row[];
    },
    async commit() {
      if (opts?.commitFail) throw new Error("commit fail");
    },
    async rollback() {
      if (opts?.rollbackFail) throw new Error("rollback fail");
    },
    async savepoint(_n: string) {},
    async releaseSavepoint(_n: string) {},
    async rollbackToSavepoint(_n: string) {},
  };
}

describe("transaction/transaction — Transaction state machine", () => {
  describe("valid state transitions", () => {
    it("starts in ACTIVE state", () => {
      const tx = new Transaction(mockTx());
      expect(tx.state).toBe("ACTIVE");
    });

    it("transitions to COMMITTED after commit()", async () => {
      const tx = new Transaction(mockTx());
      await tx.commit();
      expect(tx.state).toBe("COMMITTED");
    });

    it("transitions to ROLLED_BACK after rollback()", async () => {
      const tx = new Transaction(mockTx());
      await tx.rollback();
      expect(tx.state).toBe("ROLLED_BACK");
    });

    it("transitions to TIMED_OUT via markTimedOut()", () => {
      const tx = new Transaction(mockTx());
      tx.markTimedOut();
      expect(tx.state).toBe("TIMED_OUT");
    });

    it("transitions to FAILED when commit throws", async () => {
      const tx = new Transaction(mockTx({ commitFail: true }));
      try {
        await tx.commit();
      } catch {
        /* expected */
      }
      expect(tx.state).toBe("FAILED");
    });
  });

  describe("invalid state transitions", () => {
    it("throws TX_ALREADY_CLOSED when execute() is called on a COMMITTED transaction", async () => {
      const tx = new Transaction(mockTx());
      await tx.commit();
      try {
        await tx.execute("SELECT 1", []);
        expect.unreachable("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(TransactionError);
        expect((e as TransactionError).code).toBe(ErrorCode.TX_ALREADY_CLOSED);
      }
    });

    it("throws TX_ALREADY_CLOSED when query() is called on a ROLLED_BACK transaction", async () => {
      const tx = new Transaction(mockTx());
      await tx.rollback();
      await expect(tx.query("SELECT 1", [])).rejects.toThrow(TransactionError);
    });

    it("throws TX_ALREADY_CLOSED when commit() is called twice", async () => {
      const tx = new Transaction(mockTx());
      await tx.commit();
      await expect(tx.commit()).rejects.toThrow(TransactionError);
    });

    it("throws TX_ALREADY_CLOSED when rollback() is called on a COMMITTED transaction", async () => {
      const tx = new Transaction(mockTx());
      await tx.commit();
      await expect(tx.rollback()).rejects.toThrow(TransactionError);
    });
  });

  describe("savepoints", () => {
    it("generates a savepoint name in the format squn_sp_{txId}_{depth}", async () => {
      const tx = new Transaction(mockTx(), "test-tx");
      const sp = await tx.savepoint();
      expect(sp.name).toBe("squn_sp_test-tx_1");
    });

    it("increments depth for each nested savepoint", async () => {
      const tx = new Transaction(mockTx(), "test-tx");
      const sp1 = await tx.savepoint();
      const sp2 = await tx.savepoint();
      expect(sp1.name).toBe("squn_sp_test-tx_1");
      expect(sp2.name).toBe("squn_sp_test-tx_2");
    });
  });

  describe("markTimedOut and markFailed", () => {
    it("markFailed() transitions to FAILED", () => {
      const tx = new Transaction(mockTx());
      tx.markFailed();
      expect(tx.state).toBe("FAILED");
    });

    it("throws TX_ALREADY_CLOSED after markTimedOut()", async () => {
      const tx = new Transaction(mockTx());
      tx.markTimedOut();
      await expect(tx.query("SELECT 1", [])).rejects.toThrow(TransactionError);
    });

    it("throws TX_ALREADY_CLOSED after markFailed()", async () => {
      const tx = new Transaction(mockTx());
      tx.markFailed();
      await expect(tx.execute("SELECT 1", [])).rejects.toThrow(
        TransactionError,
      );
    });
  });

  describe("rollback failure", () => {
    it("transitions to FAILED when rollback throws", async () => {
      const tx = new Transaction(mockTx({ rollbackFail: true }));
      try {
        await tx.rollback();
      } catch {
        /* expected */
      }
      expect(tx.state).toBe("FAILED");
    });
  });

  describe("query and execute on active transaction", () => {
    it("query() returns rows on an ACTIVE transaction", async () => {
      const tx = new Transaction(mockTx());
      const rows = await tx.query("SELECT 1", []);
      expect(rows).toEqual([{ id: 1 }]);
    });

    it("execute() returns rowsAffected on an ACTIVE transaction", async () => {
      const tx = new Transaction(mockTx());
      const result = await tx.execute("UPDATE t SET x = 1", []);
      expect(result.rowsAffected).toBe(1);
    });
  });

  describe("metadata", () => {
    it("has a unique id", () => {
      const tx = new Transaction(mockTx());
      expect(tx.id.length).toBeGreaterThan(0);
    });

    it("has a TransactionClock", () => {
      const tx = new Transaction(mockTx());
      expect(tx.clock.elapsed()).toBeGreaterThanOrEqual(0);
    });
  });
});
