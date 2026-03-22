import type { IDbTransaction } from "../adapters/base.ts";
import { TransactionClock } from "../async/clock.ts";
import { ErrorCode } from "../errors/codes.ts";
import { TransactionError } from "../errors/types.ts";
import type { Row } from "../types/primitives.ts";
import { Savepoint } from "./savepoint.ts";

export type TransactionState = "ACTIVE" | "COMMITTED" | "ROLLED_BACK" | "TIMED_OUT" | "FAILED";

/**
 * Transaction with state machine: ACTIVE → COMMITTED | ROLLED_BACK | TIMED_OUT | FAILED.
 * Any operation on a non-ACTIVE transaction throws TX_ALREADY_CLOSED immediately.
 */
export class Transaction {
  private _state: TransactionState = "ACTIVE";
  private _savepointDepth = 0;
  readonly id: string;
  readonly clock: TransactionClock;

  constructor(
    private readonly tx: IDbTransaction,
    id?: string,
  ) {
    this.id = id ?? crypto.randomUUID();
    this.clock = new TransactionClock();
  }

  get state(): TransactionState {
    return this._state;
  }

  async query(sql: string, params: unknown[]): Promise<Row[]> {
    this.assertActive("query");
    return this.tx.query(sql, params);
  }

  async execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }> {
    this.assertActive("execute");
    return this.tx.execute(sql, params);
  }

  async commit(): Promise<void> {
    this.assertActive("commit");
    try {
      await this.tx.commit();
      this._state = "COMMITTED";
    } catch (err) {
      this._state = "FAILED";
      throw new TransactionError(
        ErrorCode.TX_COMMIT_FAILED,
        "COMMIT failed",
        { operation: "commit", txId: this.id },
        err,
      );
    }
  }

  async rollback(): Promise<void> {
    this.assertActive("rollback");
    try {
      await this.tx.rollback();
      this._state = "ROLLED_BACK";
    } catch (err) {
      this._state = "FAILED";
      throw new TransactionError(
        ErrorCode.TX_ROLLBACK_FAILED,
        "ROLLBACK failed",
        { operation: "rollback", txId: this.id },
        err,
      );
    }
  }

  async savepoint(): Promise<Savepoint> {
    this.assertActive("savepoint");
    this._savepointDepth++;
    const sp = new Savepoint(this.tx, this.id, this._savepointDepth);
    await sp.create();
    return sp;
  }

  markTimedOut(): void {
    this._state = "TIMED_OUT";
  }

  markFailed(): void {
    this._state = "FAILED";
  }

  private assertActive(operation: string): void {
    if (this._state !== "ACTIVE") {
      throw new TransactionError(
        ErrorCode.TX_ALREADY_CLOSED,
        `Cannot ${operation}() on a ${this._state} transaction`,
        { operation, txId: this.id },
      );
    }
  }
}
