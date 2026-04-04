import type { IDbTransaction } from "../adapters/base.ts";
import { ErrorCode } from "../errors/codes.ts";
import { TransactionError } from "../errors/types.ts";

/**
 * Savepoint within a transaction. Names use format: squn_sp_{txId}_{depth}.
 */
export class Savepoint {
  readonly name: string;

  constructor(
    private readonly tx: IDbTransaction,
    txId: string,
    depth: number,
  ) {
    this.name = `squn_sp_${txId}_${depth}`;
  }

  /** Creates the savepoint on the database. */
  async create(): Promise<void> {
    try {
      await this.tx.savepoint(this.name);
    } catch (err) {
      throw new TransactionError(
        ErrorCode.TX_COMMIT_FAILED,
        `Failed to create savepoint ${this.name}`,
        { operation: "savepoint", txId: this.name },
        err,
      );
    }
  }

  /** Rolls back to this savepoint. */
  async rollback(): Promise<void> {
    try {
      await this.tx.rollbackToSavepoint(this.name);
    } catch (err) {
      throw new TransactionError(
        ErrorCode.TX_ROLLBACK_FAILED,
        `Failed to rollback to savepoint ${this.name}`,
        { operation: "rollbackToSavepoint", txId: this.name },
        err,
      );
    }
  }

  /** Releases this savepoint. */
  async release(): Promise<void> {
    try {
      await this.tx.releaseSavepoint(this.name);
    } catch (err) {
      throw new TransactionError(
        ErrorCode.TX_COMMIT_FAILED,
        `Failed to release savepoint ${this.name}`,
        { operation: "releaseSavepoint", txId: this.name },
        err,
      );
    }
  }
}
