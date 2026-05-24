import type mssql from "mssql";
import type { AuthConfig } from "../auth/types.ts";

let _mssql: typeof mssql | null = null;

async function getMssql(): Promise<typeof mssql> {
  if (_mssql !== null) return _mssql;
  try {
    const mod = await import("mssql");
    _mssql = (mod.default ?? mod) as typeof mssql;
    return _mssql;
  } catch {
    throw new Error("mssql package is not installed. Run: bun add mssql");
  }
}

import { ErrorCode } from "../errors/codes.ts";
import { wrapError } from "../errors/wrap.ts";
import type { Row } from "../types/primitives.ts";
import type { IDbAdapter, IDbTransaction, TvpMaterialised, TvpValue } from "./base.ts";

export interface MssqlAdapterOptions {
  readonly url?: string;
  readonly host?: string;
  readonly port?: number;
  readonly database?: string;
  readonly user?: string;
  readonly password?: string;
  readonly auth?: AuthConfig;
  readonly domain?: string;
  readonly encrypt?: boolean;
  readonly trustServerCertificate?: boolean;
}

function buildConfig(options: MssqlAdapterOptions): mssql.config {
  const config: mssql.config = {
    server: options.host ?? "localhost",
    port: options.port ?? 1433,
    database: options.database,
    user: options.user,
    password: options.password,
    options: {
      encrypt: options.encrypt ?? true,
      trustServerCertificate: options.trustServerCertificate ?? false,
    },
  };

  if (options.auth !== undefined) {
    switch (options.auth.type) {
      case "userpass":
        config.user = options.auth.username;
        config.password = options.auth.password;
        break;
      case "windows":
        config.domain = options.auth.domain ?? options.domain;
        if (options.auth.username !== undefined) {
          config.user = options.auth.username;
        }
        break;
      case "windows-upn":
        config.user = options.auth.upn;
        config.password = options.auth.password;
        break;
      case "connection-string":
        // Connection string is handled separately via mssql.connect(url)
        break;
      case "azure-ad":
        config.authentication = {
          type: "azure-active-directory-service-principal-secret" as mssql.config["authentication"] extends {
            type: infer T;
          }
            ? T
            : string,
          options: {
            clientId: options.auth.clientId,
            clientSecret: options.auth.clientSecret ?? "",
            tenantId: options.auth.tenantId,
          },
        } as mssql.config["authentication"];
        break;
    }
  }

  return config;
}

export class MssqlAdapter implements IDbAdapter {
  readonly type = "mssql" as const;
  private pool: mssql.ConnectionPool | null = null;
  private readonly options: MssqlAdapterOptions;

  constructor(options: MssqlAdapterOptions) {
    this.options = options;
  }

  private async getPool(): Promise<mssql.ConnectionPool> {
    if (this.pool?.connected) return this.pool;
    try {
      const m = await getMssql();
      if (this.options.auth?.type === "connection-string" && this.options.auth.url) {
        this.pool = await m.connect(this.options.auth.url);
      } else {
        const config = buildConfig(this.options);
        this.pool = await m.connect(config);
      }
      return this.pool;
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "connect", adapter: "mssql" },
        "MSSQL connection failed",
      );
    }
  }

  async execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }> {
    try {
      const pool = await this.getPool();
      const request = pool.request();
      bindParams(request, params);
      const result = await request.query(sql);
      const affected = result.rowsAffected.reduce((a: number, b: number) => a + b, 0);
      return { rowsAffected: affected };
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "execute", adapter: "mssql", sql },
        "MSSQL execute failed",
      );
    }
  }

  async query(sql: string, params: unknown[]): Promise<Row[]> {
    try {
      const pool = await this.getPool();
      const request = pool.request();
      bindParams(request, params);
      const result = await request.query(sql);
      return result.recordset as Row[];
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "query", adapter: "mssql", sql },
        "MSSQL query failed",
      );
    }
  }

  async queryMultiple(sql: string, params: unknown[]): Promise<Row[][]> {
    try {
      const pool = await this.getPool();
      const request = pool.request();
      bindParams(request, params);
      const result = await request.query(sql);
      return result.recordsets as Row[][];
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "queryMultiple", adapter: "mssql", sql },
        "MSSQL queryMultiple failed",
      );
    }
  }

  async beginTransaction(): Promise<IDbTransaction> {
    const m = await getMssql();
    const pool = await this.getPool();
    const transaction = new m.Transaction(pool);
    try {
      await transaction.begin();
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "beginTransaction", adapter: "mssql" },
        "MSSQL BEGIN failed",
      );
    }

    const tx: IDbTransaction = {
      async execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }> {
        try {
          const request = new m.Request(transaction);
          bindParams(request, params);
          const result = await request.query(sql);
          const affected = result.rowsAffected.reduce((a: number, b: number) => a + b, 0);
          return { rowsAffected: affected };
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "execute", adapter: "mssql", sql },
            "MSSQL tx execute failed",
          );
        }
      },
      async query(sql: string, params: unknown[]): Promise<Row[]> {
        try {
          const request = new m.Request(transaction);
          bindParams(request, params);
          const result = await request.query(sql);
          return result.recordset as Row[];
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "query", adapter: "mssql", sql },
            "MSSQL tx query failed",
          );
        }
      },
      async commit(): Promise<void> {
        try {
          await transaction.commit();
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "commit", adapter: "mssql" },
            "MSSQL COMMIT failed",
          );
        }
      },
      async rollback(): Promise<void> {
        try {
          await transaction.rollback();
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "rollback", adapter: "mssql" },
            "MSSQL ROLLBACK failed",
          );
        }
      },
      async savepoint(name: string): Promise<void> {
        try {
          const request = new m.Request(transaction);
          await request.query(`SAVE TRANSACTION ${name}`);
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "savepoint", adapter: "mssql" },
            "MSSQL SAVE TRANSACTION failed",
          );
        }
      },
      async releaseSavepoint(_name: string): Promise<void> {
        // MSSQL does not support RELEASE SAVEPOINT — savepoints are released on commit
      },
      async rollbackToSavepoint(name: string): Promise<void> {
        try {
          const request = new m.Request(transaction);
          await request.query(`ROLLBACK TRANSACTION ${name}`);
        } catch (err) {
          throw wrapError(
            err,
            ErrorCode.ADAPTER_DRIVER_ERROR,
            { operation: "rollbackToSavepoint", adapter: "mssql" },
            "MSSQL ROLLBACK TRANSACTION failed",
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
    strategy?: "prepared-loop" | "copy" | "bulk-load",
  ): Promise<{ rowsAffected: number }> {
    if (strategy === "bulk-load") {
      return Promise.reject(
        wrapError(
          new Error("bulk-load strategy not yet implemented for MSSQL"),
          ErrorCode.ADAPTER_NOT_SUPPORTED,
          { operation: "executeBatch", adapter: "mssql" },
          "bulk-load strategy not yet implemented for MSSQL",
        ),
      );
    }
    try {
      const pool = await this.getPool();
      let total = 0;
      for (const row of rows) {
        const params = paramNames.map((name) => row[name]);
        const request = pool.request();
        bindParams(request, params);
        const result = await request.query(sql);
        total += result.rowsAffected.reduce((a: number, b: number) => a + b, 0);
      }
      return { rowsAffected: total };
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "executeBatch", adapter: "mssql", sql },
        "MSSQL executeBatch failed",
      );
    }
  }

  hasCursorSupport(): boolean {
    return false;
  }

  async ping(): Promise<void> {
    try {
      const pool = await this.getPool();
      await pool.request().query("SELECT 1");
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "ping", adapter: "mssql" },
        "MSSQL ping failed",
      );
    }
  }

  async close(): Promise<void> {
    try {
      if (this.pool !== null) {
        await this.pool.close();
        this.pool = null;
      }
    } catch (err) {
      throw wrapError(
        err,
        ErrorCode.ADAPTER_DRIVER_ERROR,
        { operation: "close", adapter: "mssql" },
        "MSSQL close failed",
      );
    }
  }

  async materializeTvp(_tvp: TvpValue, _index: number): Promise<TvpMaterialised> {
    throw wrapError(
      new Error("TVP materialisation not yet implemented for MSSQL"),
      ErrorCode.ADAPTER_NOT_SUPPORTED,
      { operation: "materializeTvp", adapter: "mssql" },
      "TVP materialisation not yet implemented for MSSQL",
    );
  }
}

function bindParams(request: mssql.Request, params: unknown[]): void {
  for (let i = 0; i < params.length; i++) {
    request.input(`p${i}`, params[i]);
  }
}
