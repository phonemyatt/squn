import { SQL } from "bun";
import { ErrorCode } from "../errors/codes.ts";
import { wrapError } from "../errors/wrap.ts";
import type { Row } from "../types/primitives.ts";
import type { IDbAdapter, IDbTransaction, TvpMaterialised, TvpValue } from "./base.ts";

export interface PostgresAdapterOptions {
  readonly url?: string;
  readonly host?: string;
  readonly port?: number;
  readonly database?: string;
  readonly user?: string;
  readonly password?: string;
  readonly ssl?: boolean | "require";
  readonly tvpCopyThreshold?: number;
}

export class PostgresAdapter implements IDbAdapter {
  readonly type = "postgres" as const;
  private readonly sql: InstanceType<typeof SQL>;
  readonly tvpCopyThreshold: number;

  constructor(options: PostgresAdapterOptions = {}) {
    this.tvpCopyThreshold = options.tvpCopyThreshold ?? 1_000;
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
        { operation: "connect", adapter: "postgres" },
        "Failed to create PostgreSQL connection",
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
        { operation: "execute", adapter: "postgres", sql },
        "PostgreSQL execute failed",
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
        { operation: "query", adapter: "postgres", sql },
        "PostgreSQL query failed",
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
        { operation: "queryMultiple", adapter: "postgres", sql },
        "PostgreSQL queryMultiple failed",
      );
    }
  }

  /**
   * Uses Bun.SQL's sql.reserve() to pin a single connection from the pool.
   * Raw BEGIN/COMMIT via unsafe() is rejected by Bun when pool max > 1
   * because queries could land on different connections.
   *
   * The reserved connection is released when commit() or rollback() is called.
   */
  async beginTransaction(): Promise<IDbTransaction> {
    let reserved: Awaited<ReturnType<InstanceType<typeof SQL>["reserve"]>>;
    try {
      reserved = await this.sql.reserve();
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "beginTransaction", adapter: "postgres" },
        "PostgreSQL reserve connection failed",
      );
    }

    try {
      await reserved.unsafe("BEGIN");
    } catch (err) {
      reserved.release();
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "beginTransaction", adapter: "postgres" },
        "PostgreSQL BEGIN failed",
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
            { operation: "execute", adapter: "postgres", sql },
            "PostgreSQL tx execute failed",
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
            { operation: "query", adapter: "postgres", sql },
            "PostgreSQL tx query failed",
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
            { operation: "commit", adapter: "postgres" },
            "PostgreSQL COMMIT failed",
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
            { operation: "rollback", adapter: "postgres" },
            "PostgreSQL ROLLBACK failed",
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
            { operation: "savepoint", adapter: "postgres" },
            "PostgreSQL SAVEPOINT failed",
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
            { operation: "releaseSavepoint", adapter: "postgres" },
            "PostgreSQL RELEASE failed",
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
            { operation: "rollbackToSavepoint", adapter: "postgres" },
            "PostgreSQL ROLLBACK TO failed",
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
        { operation: "executeBatch", adapter: "postgres", sql },
        "PostgreSQL executeBatch failed",
      );
    }
  }

  hasCursorSupport(): boolean {
    return true;
  }

  async ping(): Promise<void> {
    try {
      await this.sql.unsafe("SELECT 1");
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "ping", adapter: "postgres" },
        "PostgreSQL ping failed",
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
        { operation: "close", adapter: "postgres" },
        "PostgreSQL close failed",
      );
    }
  }

  async materializeTvp(_tvp: TvpValue, _index: number): Promise<TvpMaterialised> {
    throw wrapError(
      new Error("TVP materialisation not yet implemented for PostgreSQL"),
      ErrorCode.ADAPTER_NOT_SUPPORTED,
      { operation: "materializeTvp", adapter: "postgres" },
      "TVP materialisation not yet implemented for PostgreSQL",
    );
  }
}
