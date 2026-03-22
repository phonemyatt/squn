import { Database, type SQLQueryBindings } from "bun:sqlite";
import { ErrorCode } from "../errors/codes.ts";
import { wrapError } from "../errors/wrap.ts";
import type { Row } from "../types/primitives.ts";
import type { IDbAdapter, IDbTransaction, TvpMaterialised, TvpValue } from "./base.ts";

export interface SqliteAdapterOptions {
  readonly file?: string;
}

export class SqliteAdapter implements IDbAdapter {
  readonly type = "sqlite" as const;
  private db: Database;

  constructor(options: SqliteAdapterOptions = {}) {
    const file = options.file ?? ":memory:";
    try {
      this.db = new Database(file);
      this.db.exec("PRAGMA journal_mode=WAL;");
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "connect", adapter: "sqlite" },
        `Failed to open SQLite database: ${file}`,
      );
    }
  }

  async execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }> {
    try {
      this.db.prepare(sql).run(...(params as SQLQueryBindings[]));
      const result = this.db.query("SELECT changes() as c").get() as { c: number } | null;
      return { rowsAffected: result?.c ?? 0 };
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "execute", adapter: "sqlite", sql },
        `SQLite execute failed`,
      );
    }
  }

  async query(sql: string, params: unknown[]): Promise<Row[]> {
    try {
      return this.db.query(sql).all(...(params as SQLQueryBindings[])) as Row[];
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "query", adapter: "sqlite", sql },
        `SQLite query failed`,
      );
    }
  }

  async queryMultiple(sql: string, params: unknown[]): Promise<Row[][]> {
    try {
      const results: Row[][] = [];
      const statements = sql.split(";").filter((s) => s.trim().length > 0);
      for (const stmt of statements) {
        results.push(this.db.query(stmt).all(...(params as SQLQueryBindings[])) as Row[]);
      }
      return results;
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "queryMultiple", adapter: "sqlite", sql },
        `SQLite queryMultiple failed`,
      );
    }
  }

  async beginTransaction(): Promise<IDbTransaction> {
    try {
      this.db.run("BEGIN");
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "beginTransaction", adapter: "sqlite" },
        `SQLite BEGIN failed`,
      );
    }

    const db = this.db;

    const tx: IDbTransaction = {
      async execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }> {
        try {
          db.prepare(sql).run(...(params as SQLQueryBindings[]));
          const result = db.query("SELECT changes() as c").get() as { c: number } | null;
          return { rowsAffected: result?.c ?? 0 };
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "execute", adapter: "sqlite", sql },
            `SQLite tx execute failed`,
          );
        }
      },
      async query(sql: string, params: unknown[]): Promise<Row[]> {
        try {
          return db.query(sql).all(...(params as SQLQueryBindings[])) as Row[];
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "query", adapter: "sqlite", sql },
            `SQLite tx query failed`,
          );
        }
      },
      async commit(): Promise<void> {
        try {
          db.run("COMMIT");
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "commit", adapter: "sqlite" },
            `SQLite COMMIT failed`,
          );
        }
      },
      async rollback(): Promise<void> {
        try {
          db.run("ROLLBACK");
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "rollback", adapter: "sqlite" },
            `SQLite ROLLBACK failed`,
          );
        }
      },
      async savepoint(name: string): Promise<void> {
        try {
          db.run(`SAVEPOINT ${name}`);
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "savepoint", adapter: "sqlite" },
            `SQLite SAVEPOINT failed`,
          );
        }
      },
      async releaseSavepoint(name: string): Promise<void> {
        try {
          db.run(`RELEASE SAVEPOINT ${name}`);
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "releaseSavepoint", adapter: "sqlite" },
            `SQLite RELEASE failed`,
          );
        }
      },
      async rollbackToSavepoint(name: string): Promise<void> {
        try {
          db.run(`ROLLBACK TO SAVEPOINT ${name}`);
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "rollbackToSavepoint", adapter: "sqlite" },
            `SQLite ROLLBACK TO failed`,
          );
        }
      },
    };
    return tx;
  }

  async ping(): Promise<void> {
    try {
      this.db.query("SELECT 1").get();
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "ping", adapter: "sqlite" },
        `SQLite ping failed`,
      );
    }
  }

  async close(): Promise<void> {
    try {
      this.db.close();
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "close", adapter: "sqlite" },
        `SQLite close failed`,
      );
    }
  }

  async materializeTvp(_tvp: TvpValue, _index: number): Promise<TvpMaterialised> {
    throw wrapError(
      new Error("TVP materialisation not yet implemented for SQLite"),
      ErrorCode.ADAPTER_NOT_SUPPORTED,
      { operation: "materializeTvp", adapter: "sqlite" },
      "TVP materialisation not yet implemented for SQLite",
    );
  }
}
