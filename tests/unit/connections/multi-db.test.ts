import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { IDbAdapter, IDbTransaction, TvpMaterialised, TvpValue } from "../../../src/adapters/base.ts";
import { ErrorCode } from "../../../src/errors/codes.ts";
import { ConnectionError } from "../../../src/errors/types.ts";
import { createConnections } from "../../../src/db.ts";
import { sql } from "../../../src/sql/tag.ts";
import type { Row } from "../../../src/types/primitives.ts";

/** Minimal mock adapter that tracks which SQL was executed. */
function mockAdapter(tag: string): IDbAdapter & { calls: string[] } {
  const calls: string[] = [];

  const tx: IDbTransaction = {
    async execute(_s, _p) { return { rowsAffected: 0 }; },
    async query(_s, _p) { return []; },
    async commit() {},
    async rollback() {},
    async savepoint(_n) {},
    async releaseSavepoint(_n) {},
    async rollbackToSavepoint(_n) {},
  };

  return {
    calls,
    type: "sqlite",
    async execute(_s, _p) { return { rowsAffected: 0 }; },
    async query(_s, _p) {
      calls.push(tag);
      return [{ from: tag }] as Row[];
    },
    async queryMultiple(_s, _p) { return []; },
    async beginTransaction() { return tx; },
    async executeBatch(_s: string, _rows: readonly Record<string, unknown>[], _p: readonly string[]) { return { rowsAffected: 0 }; },
    hasCursorSupport() { return false; },
    async ping() {},
    async close() {},
    async materializeTvp(_t: TvpValue, _i: number): Promise<TvpMaterialised> {
      throw new Error("not impl");
    },
  } as IDbAdapter & { calls: string[] };
}

describe("connections/MultiDb — routing", () => {
  let primary: IDbAdapter & { calls: string[] };
  let replica: IDbAdapter & { calls: string[] };

  beforeEach(() => {
    primary = mockAdapter("primary");
    replica = mockAdapter("replica");
  });

  afterEach(async () => {
    await primary.close();
    await replica.close();
  });

  it(".use('replica').query() routes to the replica adapter", async () => {
    const multi = createConnections({
      connections: { primary, replica },
      default: "primary",
    });

    const rows = await multi.use("replica").query(sql`SELECT 1`);
    expect(rows).toEqual([{ from: "replica" }]);
    expect(replica.calls).toHaveLength(1);
    expect(primary.calls).toHaveLength(0);
  });

  it(".query(sql, { connection: 'replica' }) routes to the replica adapter", async () => {
    const multi = createConnections({
      connections: { primary, replica },
      default: "primary",
    });

    const rows = await multi.query(sql`SELECT 1`, { connection: "replica" });
    expect(rows).toEqual([{ from: "replica" }]);
    expect(replica.calls).toHaveLength(1);
    expect(primary.calls).toHaveLength(0);
  });

  it(".query() without options routes to the default adapter", async () => {
    const multi = createConnections({
      connections: { primary, replica },
      default: "primary",
    });

    const rows = await multi.query(sql`SELECT 1`);
    expect(rows).toEqual([{ from: "primary" }]);
    expect(primary.calls).toHaveLength(1);
    expect(replica.calls).toHaveLength(0);
  });

  it(".query(sql, { connection: 'unknown' }) throws ConnectionError(CONN_UNKNOWN)", async () => {
    const multi = createConnections({
      connections: { primary, replica },
      default: "primary",
    });

    let caught: unknown;
    try {
      await multi.query(sql`SELECT 1`, { connection: "unknown" as unknown as "primary" });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ConnectionError);
    expect((caught as ConnectionError).code).toBe(ErrorCode.CONN_UNKNOWN);
  });

  it(".use() returns ScopedDb with connectionName set", () => {
    const multi = createConnections({
      connections: { primary, replica },
      default: "primary",
    });

    const scoped = multi.use("replica");
    expect(scoped.connectionName).toBe("replica");
  });

  it(".use() ScopedDb routes all query methods to the scoped adapter", async () => {
    const multi = createConnections({
      connections: { primary, replica },
      default: "primary",
    });

    const scoped = multi.use("replica");
    await scoped.query(sql`SELECT 1`);
    await scoped.query(sql`SELECT 2`);
    expect(replica.calls).toHaveLength(2);
    expect(primary.calls).toHaveLength(0);
  });
});
