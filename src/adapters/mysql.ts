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

  constructor(options: MysqlAdapterOptions = {}) {
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
      return { rowsAffected: result.count ?? 0 };
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
   * Uses Bun.SQL's sql.reserve() to pin a single connection from the pool.
   * Same issue as PostgreSQL — raw BEGIN/COMMIT via unsafe() doesn't pin a connection.
   */
  async beginTransaction(): Promise<IDbTransaction> {
    let reserved: Awaited<ReturnType<InstanceType<typeof SQL>["reserve"]>>;
    try {
      reserved = await this.sql.reserve();
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "beginTransaction", adapter: "mysql" },
        "MySQL reserve connection failed",
      );
    }

    try {
      await reserved.unsafe("BEGIN");
    } catch (err) {
      reserved.release();
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
          const result = await reserved.unsafe(sql, params as (string | number | boolean | null)[]);
          return { rowsAffected: result.count ?? 0 };
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
          const result = await reserved.unsafe(sql, params as (string | number | boolean | null)[]);
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
          await reserved.unsafe("COMMIT");
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "commit", adapter: "mysql" },
            "MySQL COMMIT failed",
          );
        } finally {
          reserved.release();
        }
      },
      async rollback(): Promise<void> {
        try {
          await reserved.unsafe("ROLLBACK");
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "rollback", adapter: "mysql" },
            "MySQL ROLLBACK failed",
          );
        } finally {
          reserved.release();
        }
      },
      async savepoint(name: string): Promise<void> {
        try {
          await reserved.unsafe(`SAVEPOINT ${name}`);
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
          await reserved.unsafe(`RELEASE SAVEPOINT ${name}`);
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
          await reserved.unsafe(`ROLLBACK TO SAVEPOINT ${name}`);
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
        total += result.count ?? 0;
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
