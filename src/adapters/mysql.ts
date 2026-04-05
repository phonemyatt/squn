import { SQL } from "bun";
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

export class MysqlAdapter implements IDbAdapter {
  readonly type = "mysql" as const;
  private readonly sql: InstanceType<typeof SQL>;
  private readonly options: MysqlAdapterOptions;

  constructor(options: MysqlAdapterOptions = {}) {
    this.options = options;
    try {
      this.sql = new SQL({
        url: options.url,
        hostname: options.host,
        port: options.port,
        database: options.database,
        username: options.user,
        password: options.password,
      });
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "connect", adapter: "mysql" },
        "Failed to create MySQL connection",
      );
    }
  }

  async execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }> {
    try {
      const result = await this.sql.unsafe(sql, params as (string | number | boolean | null)[]);
      // Bun.SQL MySQL: 'count' = rows returned (SELECT); 'affectedRows' = rows mutated (DML)
      const affected =
        (result as unknown as { affectedRows?: number }).affectedRows ?? result.count ?? 0;
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

  async query(sql: string, params: unknown[]): Promise<Row[]> {
    try {
      const result = await this.sql.unsafe(sql, params as (string | number | boolean | null)[]);
      return [...result] as Row[];
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "query", adapter: "mysql", sql },
        "MySQL query failed",
      );
    }
  }

  async queryMultiple(sql: string, params: unknown[]): Promise<Row[][]> {
    try {
      const result = await this.sql.unsafe(sql, params as (string | number | boolean | null)[]);
      return [[...result] as Row[]];
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "queryMultiple", adapter: "mysql", sql },
        "MySQL queryMultiple failed",
      );
    }
  }

  /**
   * Opens a dedicated single-connection SQL instance for the transaction.
   * We cannot use sql.reserve() here: Bun.SQL MySQL leaves the pool connection
   * in a mid-read state after any DML, causing the next query on the same pool
   * to hang. A private SQL(max:1) instance is isolated and closed on commit/rollback.
   */
  async beginTransaction(): Promise<IDbTransaction> {
    const txSql = new SQL({
      url: this.options.url,
      hostname: this.options.host,
      port: this.options.port,
      database: this.options.database,
      username: this.options.user,
      password: this.options.password,
      max: 1,
    });

    try {
      await txSql.unsafe("BEGIN");
    } catch (err) {
      await txSql.close().catch(() => undefined);
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "beginTransaction", adapter: "mysql" },
        "MySQL BEGIN failed",
      );
    }

    const tx: IDbTransaction = {
      async execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }> {
        try {
          const result = await txSql.unsafe(sql, params as (string | number | boolean | null)[]);
          const affected =
            (result as unknown as { affectedRows?: number }).affectedRows ?? result.count ?? 0;
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
      async query(sql: string, params: unknown[]): Promise<Row[]> {
        try {
          const result = await txSql.unsafe(sql, params as (string | number | boolean | null)[]);
          return [...result] as Row[];
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
          await txSql.unsafe("COMMIT");
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "commit", adapter: "mysql" },
            "MySQL COMMIT failed",
          );
        } finally {
          await txSql.close().catch(() => undefined);
        }
      },
      async rollback(): Promise<void> {
        try {
          await txSql.unsafe("ROLLBACK");
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "rollback", adapter: "mysql" },
            "MySQL ROLLBACK failed",
          );
        } finally {
          await txSql.close().catch(() => undefined);
        }
      },
      async savepoint(name: string): Promise<void> {
        try {
          await txSql.unsafe(`SAVEPOINT ${name}`);
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
          await txSql.unsafe(`RELEASE SAVEPOINT ${name}`);
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "releaseSavepoint", adapter: "mysql" },
            "MySQL RELEASE failed",
          );
        }
      },
      async rollbackToSavepoint(name: string): Promise<void> {
        try {
          await txSql.unsafe(`ROLLBACK TO SAVEPOINT ${name}`);
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "rollbackToSavepoint", adapter: "mysql" },
            "MySQL ROLLBACK TO failed",
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
        const params = paramNames.map((name) => row[name]) as (string | number | boolean | null)[];
        const result = await this.sql.unsafe(sql, params);
        total += (result as unknown as { affectedRows?: number }).affectedRows ?? result.count ?? 0;
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
      await this.sql.unsafe("SELECT 1");
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
      await this.sql.close();
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
