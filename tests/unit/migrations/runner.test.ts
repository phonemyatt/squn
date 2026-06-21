import { describe, expect, it } from "bun:test";
import type {
  IDbAdapter,
  IDbTransaction,
  TvpMaterialised,
  TvpValue,
} from "../../../src/adapters/base.ts";
import { QueryError, TransactionError } from "../../../src/errors/types.ts";
import { rollbackMigration, runMigrations } from "../../../src/migrations/runner.ts";
import type { Migration } from "../../../src/migrations/types.ts";
import type { Row } from "../../../src/types/primitives.ts";

// ---------------------------------------------------------------------------
// In-memory mock adapter backed by a simple Map — no real SQL parsing.
// ---------------------------------------------------------------------------

interface MockDb {
  /** tableName → rows */
  tables: Map<string, Row[]>;
  /** sequence of [operation, sql] pairs for assertions */
  log: Array<{ op: string; sql: string }>;
}

function makeMockAdapter(db: MockDb): IDbAdapter {
  function makeTx(): IDbTransaction {
    const txOps: Array<{ op: string; sql: string }> = [];
    let rolledBack = false;

    const tx: IDbTransaction = {
      async execute(sql: string, params: readonly unknown[]) {
        txOps.push({ op: "exec", sql });
        db.log.push({ op: "tx:exec", sql });

        // Intercept CREATE TABLE IF NOT EXISTS
        const createMatch = /CREATE TABLE IF NOT EXISTS "([^"]+)"/.exec(sql);
        if (createMatch !== null) {
          const tableName = createMatch[1] ?? "";
          if (!db.tables.has(tableName)) {
            db.tables.set(tableName, []);
          }
          return { rowsAffected: 0 };
        }

        // Intercept INSERT INTO "<table>" (id, applied_at)
        const insertMatch = /INSERT INTO "([^"]+)" \(id, applied_at\) VALUES/.exec(sql);
        if (insertMatch !== null) {
          const tableName = insertMatch[1] ?? "";
          const rows = db.tables.get(tableName) ?? [];
          const id = params[0];
          const applied_at = params[1];
          if (typeof id === "string" && typeof applied_at === "string") {
            rows.push({ id, applied_at } satisfies Row);
            db.tables.set(tableName, rows);
          }
          return { rowsAffected: 1 };
        }

        // Intercept DELETE FROM "<table>" WHERE id = $1
        const deleteMatch = /DELETE FROM "([^"]+)" WHERE id/.exec(sql);
        if (deleteMatch !== null) {
          const tableName = deleteMatch[1] ?? "";
          const targetId = params[0];
          const rows = db.tables.get(tableName) ?? [];
          const filtered = rows.filter((r) => (r as { id: unknown }).id !== targetId);
          db.tables.set(tableName, filtered);
          return { rowsAffected: rows.length - filtered.length };
        }

        // Arbitrary up/down SQL — just record it
        return { rowsAffected: 0 };
      },

      async query(sql: string, _p: readonly unknown[]) {
        db.log.push({ op: "tx:query", sql });
        return [];
      },

      async commit() {
        if (rolledBack) throw new Error("already rolled back");
        db.log.push({ op: "commit", sql: "" });
      },

      async rollback() {
        rolledBack = true;
        db.log.push({ op: "rollback", sql: "" });
        // Undo tx ops on the in-memory tables
        for (const op of txOps) {
          // Simple: undo INSERT by re-fetching nothing — state was mutated above.
          // For test purposes we treat rollback as a no-op; tests that test rollback
          // verify the error is re-thrown, not the DB state.
          void op;
        }
      },

      async savepoint(_name: string) {},
      async releaseSavepoint(_name: string) {},
      async rollbackToSavepoint(_name: string) {},
    };

    return tx;
  }

  const adapter: IDbAdapter = {
    type: "sqlite",

    async execute(sql: string, _params: readonly unknown[]) {
      db.log.push({ op: "exec", sql });

      // CREATE TABLE IF NOT EXISTS
      const createMatch = /CREATE TABLE IF NOT EXISTS "([^"]+)"/.exec(sql);
      if (createMatch !== null) {
        const tableName = createMatch[1] ?? "";
        if (!db.tables.has(tableName)) {
          db.tables.set(tableName, []);
        }
        return { rowsAffected: 0 };
      }

      return { rowsAffected: 0 };
    },

    async query(sql: string, queryParams: readonly unknown[]) {
      db.log.push({ op: "query", sql });

      // SELECT id, applied_at FROM "<table>"
      const selectAllMatch = /SELECT id, applied_at FROM "([^"]+)"$/.exec(sql);
      if (selectAllMatch !== null) {
        const tableName = selectAllMatch[1] ?? "";
        return db.tables.get(tableName) ?? [];
      }

      // SELECT id, applied_at FROM "<table>" WHERE id = $1
      const selectWhereMatch = /SELECT id, applied_at FROM "([^"]+)" WHERE id/.exec(sql);
      if (selectWhereMatch !== null) {
        const tableName = selectWhereMatch[1] ?? "";
        const targetId = queryParams[0];
        const rows = db.tables.get(tableName) ?? [];
        return rows.filter((r) => (r as { id: unknown }).id === targetId);
      }

      return [];
    },

    async queryMultiple(_sql: string, _params: readonly unknown[]) {
      return [];
    },

    async executeBatch(
      _sql: string,
      _rows: readonly Record<string, unknown>[],
      _paramNames: readonly string[],
    ) {
      return { rowsAffected: 0 };
    },

    async beginTransaction() {
      db.log.push({ op: "begin", sql: "" });
      return makeTx();
    },

    hasCursorSupport() {
      return false;
    },

    async ping() {},
    async close() {},

    async materializeTvp(_tvp: TvpValue, _index: number): Promise<TvpMaterialised> {
      throw new Error("not implemented");
    },
  };

  return adapter;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(): MockDb {
  return { tables: new Map(), log: [] };
}

const m1 = {
  id: "001_create_users",
  up: "CREATE TABLE users (id INTEGER PRIMARY KEY)",
  down: "DROP TABLE users",
} satisfies Migration;

const m2 = {
  id: "002_add_email",
  up: "ALTER TABLE users ADD COLUMN email TEXT",
  down: "ALTER TABLE users DROP COLUMN email",
} satisfies Migration;

const m3NoDown = {
  id: "003_seed",
  up: "INSERT INTO users VALUES (1)",
} satisfies Migration;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("migrations/runner — runMigrations()", () => {
  it("creates the tracking table on first run", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    await runMigrations(adapter, [m1]);

    expect(db.tables.has("_squn_migrations")).toBe(true);
    const createCalls = db.log.filter(
      (e) => e.op === "exec" && e.sql.includes("CREATE TABLE IF NOT EXISTS"),
    );
    expect(createCalls.length).toBeGreaterThan(0);
  });

  it("respects a custom tableName option", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    await runMigrations(adapter, [m1], { tableName: "my_migrations" });

    expect(db.tables.has("my_migrations")).toBe(true);
    expect(db.tables.has("_squn_migrations")).toBe(false);
  });

  it("applies pending migrations in order and returns applied list", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    const result = await runMigrations(adapter, [m1, m2]);

    expect(result.applied).toEqual([m1.id, m2.id]);
    expect(result.skipped).toEqual([]);
  });

  it("records each applied migration in the tracking table", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    await runMigrations(adapter, [m1, m2]);

    const tracked = db.tables.get("_squn_migrations") ?? [];
    const ids = tracked.map((r) => (r as { id: string }).id);
    expect(ids).toContain(m1.id);
    expect(ids).toContain(m2.id);
  });

  it("skips already-applied migrations", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    // Pre-populate tracking table
    db.tables.set("_squn_migrations", [
      { id: m1.id, applied_at: "2026-01-01T00:00:00.000Z" } satisfies Row,
    ]);

    const result = await runMigrations(adapter, [m1, m2]);

    expect(result.skipped).toEqual([m1.id]);
    expect(result.applied).toEqual([m2.id]);
  });

  it("returns all skipped when all migrations already applied", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    db.tables.set("_squn_migrations", [
      { id: m1.id, applied_at: "2026-01-01T00:00:00.000Z" } satisfies Row,
      { id: m2.id, applied_at: "2026-01-01T00:00:00.000Z" } satisfies Row,
    ]);

    const result = await runMigrations(adapter, [m1, m2]);

    expect(result.skipped).toEqual([m1.id, m2.id]);
    expect(result.applied).toEqual([]);
  });

  it("runs each migration inside a transaction (begin + commit)", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    await runMigrations(adapter, [m1]);

    const begins = db.log.filter((e) => e.op === "begin");
    const commits = db.log.filter((e) => e.op === "commit");
    expect(begins.length).toBeGreaterThanOrEqual(1);
    expect(commits.length).toBeGreaterThanOrEqual(1);
  });

  it("handles a migration with no down SQL (up only)", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    const result = await runMigrations(adapter, [m3NoDown]);

    expect(result.applied).toEqual([m3NoDown.id]);
  });

  it("wraps adapter errors in TransactionError", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    // Monkey-patch beginTransaction to intercept and inject a failure
    const origBegin = adapter.beginTransaction.bind(adapter);
    adapter.beginTransaction = async () => {
      const tx = await origBegin();
      // Make execute throw on the migration SQL (not the INSERT into tracking)
      const origExec = tx.execute.bind(tx);
      tx.execute = async (sql: string, params: readonly unknown[]) => {
        if (sql === m1.up) throw new Error("driver failure");
        return origExec(sql, params);
      };
      return tx;
    };

    await expect(runMigrations(adapter, [m1])).rejects.toBeInstanceOf(TransactionError);
  });

  it("returns empty result for empty migrations list", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    const result = await runMigrations(adapter, []);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});

describe("migrations/runner — rollbackMigration()", () => {
  it("removes the migration record from the tracking table", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    // Pre-populate
    db.tables.set("_squn_migrations", [
      { id: m1.id, applied_at: "2026-01-01T00:00:00.000Z" } satisfies Row,
    ]);

    await rollbackMigration(adapter, m1.id, [m1]);

    const tracked = db.tables.get("_squn_migrations") ?? [];
    const ids = tracked.map((r) => (r as { id: string }).id);
    expect(ids).not.toContain(m1.id);
  });

  it("throws QueryError when migration ID is not in the list", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    await expect(rollbackMigration(adapter, "does_not_exist", [m1])).rejects.toBeInstanceOf(
      QueryError,
    );
  });

  it("throws QueryError when migration has no down SQL", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    db.tables.set("_squn_migrations", [
      { id: m3NoDown.id, applied_at: "2026-01-01T00:00:00.000Z" } satisfies Row,
    ]);

    await expect(rollbackMigration(adapter, m3NoDown.id, [m3NoDown])).rejects.toBeInstanceOf(
      QueryError,
    );
  });

  it("throws QueryError when migration is not recorded as applied", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    // Tracking table exists but is empty
    db.tables.set("_squn_migrations", []);

    await expect(rollbackMigration(adapter, m1.id, [m1])).rejects.toBeInstanceOf(QueryError);
  });

  it("runs the down SQL inside a transaction", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    db.tables.set("_squn_migrations", [
      { id: m1.id, applied_at: "2026-01-01T00:00:00.000Z" } satisfies Row,
    ]);

    await rollbackMigration(adapter, m1.id, [m1]);

    const begins = db.log.filter((e) => e.op === "begin");
    const commits = db.log.filter((e) => e.op === "commit");
    expect(begins.length).toBeGreaterThanOrEqual(1);
    expect(commits.length).toBeGreaterThanOrEqual(1);
    const txExecs = db.log.filter((e) => e.op === "tx:exec" && e.sql === m1.down);
    expect(txExecs.length).toBe(1);
  });

  it("wraps driver errors in TransactionError during rollback", async () => {
    const db = makeDb();
    const adapter = makeMockAdapter(db);

    db.tables.set("_squn_migrations", [
      { id: m1.id, applied_at: "2026-01-01T00:00:00.000Z" } satisfies Row,
    ]);

    const origBegin = adapter.beginTransaction.bind(adapter);
    adapter.beginTransaction = async () => {
      const tx = await origBegin();
      const origExec = tx.execute.bind(tx);
      tx.execute = async (sql: string, params: readonly unknown[]) => {
        if (sql === m1.down) throw new Error("down failed");
        return origExec(sql, params);
      };
      return tx;
    };

    await expect(rollbackMigration(adapter, m1.id, [m1])).rejects.toBeInstanceOf(TransactionError);
  });
});
