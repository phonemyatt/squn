import { Database, type SQLQueryBindings } from "bun:sqlite";
import { materializeTvpTempTable } from "../core/tvp/strategies/temp-table.ts";
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

  execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }> {
    try {
      this.db.prepare(sql).run(...(params as SQLQueryBindings[]));
      const result = this.db.query("SELECT changes() as c").get() as {
        c: number;
      } | null;
      return Promise.resolve({ rowsAffected: result?.c ?? 0 });
    } catch (err) {
      return Promise.reject(
        wrapError(
          err,
          ErrorCode.ADAPTER_DRIVER_ERROR,
          { operation: "execute", adapter: "sqlite", sql },
          "SQLite execute failed",
        ),
      );
    }
  }

  query(sql: string, params: unknown[]): Promise<Row[]> {
    try {
      const rows = this.db.query(sql).all(...(params as SQLQueryBindings[])) as Row[];
      return Promise.resolve(rows);
    } catch (err) {
      return Promise.reject(
        wrapError(
          err,
          ErrorCode.ADAPTER_DRIVER_ERROR,
          { operation: "query", adapter: "sqlite", sql },
          "SQLite query failed",
        ),
      );
    }
  }

  queryMultiple(sql: string, params: unknown[]): Promise<Row[][]> {
    try {
      const results: Row[][] = [];
      const statements = sql.split(";").filter((s) => s.trim().length > 0);
      for (const stmt of statements) {
        results.push(this.db.query(stmt).all(...(params as SQLQueryBindings[])) as Row[]);
      }
      return Promise.resolve(results);
    } catch (err) {
      return Promise.reject(
        wrapError(
          err,
          ErrorCode.ADAPTER_DRIVER_ERROR,
          { operation: "queryMultiple", adapter: "sqlite", sql },
          "SQLite queryMultiple failed",
        ),
      );
    }
  }

  beginTransaction(): Promise<IDbTransaction> {
    try {
      this.db.run("BEGIN");
    } catch (err) {
      return Promise.reject(
        wrapError(
          err,
          ErrorCode.ADAPTER_DRIVER_ERROR,
          { operation: "beginTransaction", adapter: "sqlite" },
          "SQLite BEGIN failed",
        ),
      );
    }

    const db = this.db;

    const tx: IDbTransaction = {
      execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }> {
        try {
          db.prepare(sql).run(...(params as SQLQueryBindings[]));
          const result = db.query("SELECT changes() as c").get() as {
            c: number;
          } | null;
          return Promise.resolve({ rowsAffected: result?.c ?? 0 });
        } catch (err) {
          return Promise.reject(
            wrapError(
              err,
              ErrorCode.ADAPTER_DRIVER_ERROR,
              { operation: "execute", adapter: "sqlite", sql },
              "SQLite tx execute failed",
            ),
          );
        }
      },
      query(sql: string, params: unknown[]): Promise<Row[]> {
        try {
          const rows = db.query(sql).all(...(params as SQLQueryBindings[])) as Row[];
          return Promise.resolve(rows);
        } catch (err) {
          return Promise.reject(
            wrapError(
              err,
              ErrorCode.ADAPTER_DRIVER_ERROR,
              { operation: "query", adapter: "sqlite", sql },
              "SQLite tx query failed",
            ),
          );
        }
      },
      commit(): Promise<void> {
        try {
          db.run("COMMIT");
          return Promise.resolve();
        } catch (err) {
          return Promise.reject(
            wrapError(
              err,
              ErrorCode.ADAPTER_DRIVER_ERROR,
              { operation: "commit", adapter: "sqlite" },
              "SQLite COMMIT failed",
            ),
          );
        }
      },
      rollback(): Promise<void> {
        try {
          db.run("ROLLBACK");
          return Promise.resolve();
        } catch (err) {
          return Promise.reject(
            wrapError(
              err,
              ErrorCode.ADAPTER_DRIVER_ERROR,
              { operation: "rollback", adapter: "sqlite" },
              "SQLite ROLLBACK failed",
            ),
          );
        }
      },
      savepoint(name: string): Promise<void> {
        try {
          db.run(`SAVEPOINT ${name}`);
          return Promise.resolve();
        } catch (err) {
          return Promise.reject(
            wrapError(
              err,
              ErrorCode.ADAPTER_DRIVER_ERROR,
              { operation: "savepoint", adapter: "sqlite" },
              "SQLite SAVEPOINT failed",
            ),
          );
        }
      },
      releaseSavepoint(name: string): Promise<void> {
        try {
          db.run(`RELEASE SAVEPOINT ${name}`);
          return Promise.resolve();
        } catch (err) {
          return Promise.reject(
            wrapError(
              err,
              ErrorCode.ADAPTER_DRIVER_ERROR,
              { operation: "releaseSavepoint", adapter: "sqlite" },
              "SQLite RELEASE failed",
            ),
          );
        }
      },
      rollbackToSavepoint(name: string): Promise<void> {
        try {
          db.run(`ROLLBACK TO SAVEPOINT ${name}`);
          return Promise.resolve();
        } catch (err) {
          return Promise.reject(
            wrapError(
              err,
              ErrorCode.ADAPTER_DRIVER_ERROR,
              { operation: "rollbackToSavepoint", adapter: "sqlite" },
              "SQLite ROLLBACK TO failed",
            ),
          );
        }
      },
    };
    return Promise.resolve(tx);
  }

  executeBatch(
    sql: string,
    rows: readonly Record<string, unknown>[],
    paramNames: readonly string[],
    _strategy?: "prepared-loop" | "copy" | "bulk-load",
  ): Promise<{ rowsAffected: number }> {
    try {
      const stmt = this.db.prepare(sql);
      let total = 0;
      for (const row of rows) {
        const params = paramNames.map((name) => row[name]) as SQLQueryBindings[];
        stmt.run(...params);
        total++;
      }
      return Promise.resolve({ rowsAffected: total });
    } catch (err) {
      return Promise.reject(
        wrapError(
          err,
          ErrorCode.ADAPTER_DRIVER_ERROR,
          { operation: "executeBatch", adapter: "sqlite", sql },
          "SQLite executeBatch failed",
        ),
      );
    }
  }

  hasCursorSupport(): boolean {
    return false;
  }

  ping(): Promise<void> {
    try {
      this.db.query("SELECT 1").get();
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(
        wrapError(
          err,
          ErrorCode.ADAPTER_DRIVER_ERROR,
          { operation: "ping", adapter: "sqlite" },
          "SQLite ping failed",
        ),
      );
    }
  }

  close(): Promise<void> {
    try {
      this.db.close();
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(
        wrapError(
          err,
          ErrorCode.ADAPTER_DRIVER_ERROR,
          { operation: "close", adapter: "sqlite" },
          "SQLite close failed",
        ),
      );
    }
  }

  materializeTvp(tvp: TvpValue, _index: number): Promise<TvpMaterialised> {
    return materializeTvpTempTable(tvp, (sql, params) => this.execute(sql, [...params]));
  }
}
