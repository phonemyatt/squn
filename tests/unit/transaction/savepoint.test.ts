import { describe, expect, it } from "bun:test";
import type { IDbTransaction } from "../../../src/adapters/base.ts";
import { TransactionError } from "../../../src/errors/types.ts";
import { Savepoint } from "../../../src/transaction/savepoint.ts";
import type { Row } from "../../../src/types/primitives.ts";

function mockTx(opts?: {
  savepointFail?: boolean;
  rollbackFail?: boolean;
  releaseFail?: boolean;
}): IDbTransaction {
  return {
    async execute(_s: string, _p: unknown[]) {
      return { rowsAffected: 0 };
    },
    async query(_s: string, _p: unknown[]) {
      return [] as Row[];
    },
    async commit() {},
    async rollback() {},
    async savepoint(_n: string) {
      if (opts?.savepointFail) throw new Error("sp fail");
    },
    async releaseSavepoint(_n: string) {
      if (opts?.releaseFail) throw new Error("release fail");
    },
    async rollbackToSavepoint(_n: string) {
      if (opts?.rollbackFail) throw new Error("rb fail");
    },
  };
}

describe("transaction/savepoint — Savepoint", () => {
  it("generates name in format squn_sp_{txId}_{depth} with hyphens replaced", () => {
    const sp = new Savepoint(mockTx(), "tx-123", 1);
    expect(sp.name).toBe("squn_sp_tx_123_1");
  });

  it("create() calls the underlying transaction savepoint", async () => {
    const sp = new Savepoint(mockTx(), "tx-1", 1);
    await expect(sp.create()).resolves.toBeUndefined();
  });

  it("rollback() calls the underlying rollbackToSavepoint", async () => {
    const sp = new Savepoint(mockTx(), "tx-1", 1);
    await expect(sp.rollback()).resolves.toBeUndefined();
  });

  it("release() calls the underlying releaseSavepoint", async () => {
    const sp = new Savepoint(mockTx(), "tx-1", 1);
    await expect(sp.release()).resolves.toBeUndefined();
  });

  it("create() wraps errors in TransactionError", async () => {
    const sp = new Savepoint(mockTx({ savepointFail: true }), "tx-1", 1);
    await expect(sp.create()).rejects.toThrow(TransactionError);
  });

  it("rollback() wraps errors in TransactionError", async () => {
    const sp = new Savepoint(mockTx({ rollbackFail: true }), "tx-1", 1);
    await expect(sp.rollback()).rejects.toThrow(TransactionError);
  });

  it("release() wraps errors in TransactionError", async () => {
    const sp = new Savepoint(mockTx({ releaseFail: true }), "tx-1", 1);
    await expect(sp.release()).rejects.toThrow(TransactionError);
  });
});
