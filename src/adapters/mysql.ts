import mysql2 from "mysql2/promise";

type SqlParams = (string | number | boolean | null | Buffer | Date)[];

import { ErrorCode } from "../errors/codes.ts";
import { wrapError } from "../errors/wrap.ts";
import type { Row } from "../types/primitives.ts";
import type { IDbAdapter, IDbTransaction, TvpMaterialised, TvpValue } from "./base.ts";

export interface MysqlAdapterOptions {
  readonly url?: string;
  readonly host?: string;
  readonly port?: number;
  readonly database?: string;
  readonly user?: string;
  readonly password?: string;
}

// squn's sql tag emits $1, $2, ... positional placeholders; mysql2 uses ?
function toQuestionMarkPlaceholders(sql: string): string {
  return sql.replace(/\$\d+/g, "?");
}

function buildPoolConfig(options: MysqlAdapterOptions): mysql2.PoolOptions {
  const base: mysql2.PoolOptions = {
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };
  if (options.url) {
    const u = new URL(options.url);
    if (u.hostname) base.host = u.hostname;
    if (u.port) base.port = Number(u.port);
    if (u.username) base.user = u.username;
    if (u.password) base.password = u.password;
    const db = u.pathname.slice(1);
    if (db) base.database = db;
  } else {
    base.host = options.host ?? "localhost";
    base.port = options.port ?? 3306;
    if (options.user !== undefined) base.user = options.user;
    if (options.password !== undefined) base.password = options.password;
    if (options.database !== undefined) base.database = options.database;
  }
  return base;
}

export class MysqlAdapter implements IDbAdapter {
  readonly type = "mysql" as const;
  private readonly pool: mysql2.Pool;

  constructor(options: MysqlAdapterOptions = {}) {
    try {
      this.pool = mysql2.createPool(buildPoolConfig(options));
      // Unref pool connections so they don't prevent process exit when close() isn't called.
      this.pool.on("connection", (conn) => {
        (conn as unknown as { stream: { unref(): void } }).stream.unref();
      });
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "connect", adapter: "mysql" },
        "Failed to create MySQL connection pool",
      );
    }
  }

  async execute(sql: string, params: readonly unknown[]): Promise<{ rowsAffected: number }> {
    try {
      const [result] = await this.pool.execute(
        toQuestionMarkPlaceholders(sql),
        params as SqlParams,
      );
      const affected = (result as { affectedRows?: number }).affectedRows ?? 0;
      return { rowsAffected: affected };
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "execute", adapter: "mysql", sql },
        "MySQL execute failed",
      );
    }
  }

  async query(sql: string, params: readonly unknown[]): Promise<Row[]> {
    try {
      const [rows] = await this.pool.execute(toQuestionMarkPlaceholders(sql), params as SqlParams);
      return rows as Row[];
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "query", adapter: "mysql", sql },
        "MySQL query failed",
      );
    }
  }

  async queryMultiple(sql: string, params: readonly unknown[]): Promise<Row[][]> {
    const rows = await this.query(sql, params);
    return [rows];
  }

  async beginTransaction(): Promise<IDbTransaction> {
    let conn: mysql2.PoolConnection;
    try {
      conn = await this.pool.getConnection();
      await conn.beginTransaction();
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "beginTransaction", adapter: "mysql" },
        "MySQL BEGIN failed",
      );
    }

    const tx: IDbTransaction = {
      async execute(sql: string, params: readonly unknown[]): Promise<{ rowsAffected: number }> {
        try {
          const [result] = await conn.execute(toQuestionMarkPlaceholders(sql), params as SqlParams);
          const affected = (result as { affectedRows?: number }).affectedRows ?? 0;
          return { rowsAffected: affected };
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "execute", adapter: "mysql", sql },
            "MySQL tx execute failed",
          );
        }
      },
      async query(sql: string, params: readonly unknown[]): Promise<Row[]> {
        try {
          const [rows] = await conn.execute(toQuestionMarkPlaceholders(sql), params as SqlParams);
          return rows as Row[];
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "query", adapter: "mysql", sql },
            "MySQL tx query failed",
          );
        }
      },
      async commit(): Promise<void> {
        try {
          await conn.commit();
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "commit", adapter: "mysql" },
            "MySQL COMMIT failed",
          );
        } finally {
          conn.release();
        }
      },
      async rollback(): Promise<void> {
        try {
          await conn.rollback();
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "rollback", adapter: "mysql" },
            "MySQL ROLLBACK failed",
          );
        } finally {
          conn.release();
        }
      },
      async savepoint(name: string): Promise<void> {
        try {
          await conn.execute(`SAVEPOINT ${name}`);
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "savepoint", adapter: "mysql" },
            "MySQL SAVEPOINT failed",
          );
        }
      },
      async releaseSavepoint(name: string): Promise<void> {
        try {
          await conn.execute(`RELEASE SAVEPOINT ${name}`);
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "releaseSavepoint", adapter: "mysql" },
            "MySQL RELEASE SAVEPOINT failed",
          );
        }
      },
      async rollbackToSavepoint(name: string): Promise<void> {
        try {
          await conn.execute(`ROLLBACK TO SAVEPOINT ${name}`);
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "rollbackToSavepoint", adapter: "mysql" },
            "MySQL ROLLBACK TO SAVEPOINT failed",
          );
        }
      },
    };
    return tx;
  }

  async executeBatch(
    sql: string,
    rows: readonly Record<string, unknown>[],
    paramNames: readonly string[],
    _strategy?: "prepared-loop" | "copy" | "bulk-load",
  ): Promise<{ rowsAffected: number }> {
    try {
      let total = 0;
      for (const row of rows) {
        const params = paramNames.map((name) => row[name]) as SqlParams;
        const [result] = await this.pool.execute(toQuestionMarkPlaceholders(sql), params);
        total += (result as { affectedRows?: number }).affectedRows ?? 0;
      }
      return { rowsAffected: total };
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "executeBatch", adapter: "mysql", sql },
        "MySQL executeBatch failed",
      );
    }
  }

  hasCursorSupport(): boolean {
    return false;
  }

  async ping(): Promise<void> {
    try {
      await this.pool.execute("SELECT 1");
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "ping", adapter: "mysql" },
        "MySQL ping failed",
      );
    }
  }

  async close(): Promise<void> {
    try {
      await this.pool.end();
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "close", adapter: "mysql" },
        "MySQL close failed",
      );
    }
  }

  async materializeTvp(_tvp: TvpValue, _index: number): Promise<TvpMaterialised> {
    throw wrapError(
      new Error("TVP materialisation not yet implemented for MySQL"),
      ErrorCode.ADAPTER_NOT_SUPPORTED,
      { operation: "materializeTvp", adapter: "mysql" },
      "TVP materialisation not yet implemented for MySQL",
    );
  }
}
