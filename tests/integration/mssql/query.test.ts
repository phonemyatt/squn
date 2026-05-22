import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { MssqlAdapter } from "../../../src/adapters/mssql.ts";
import { SqunError } from "../../../src/errors/base.ts";

const url = process.env.SQUN_MSSQL_URL ?? "";

function parseMssqlUrl(connUrl: string): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  // mssql://sa:Password123!@localhost:1433/master
  const parsed = new URL(connUrl);
  return {
    host: parsed.hostname,
    port: Number.parseInt(parsed.port || "1433", 10),
    database: parsed.pathname.slice(1),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

describe.skipIf(!url)("integration/mssql — MssqlAdapter", () => {
  let adapter: MssqlAdapter;

  beforeAll(async () => {
    const opts = parseMssqlUrl(url);
    adapter = new MssqlAdapter({
      ...opts,
      encrypt: false,
      trustServerCertificate: true,
    });

    // MSSQL uses IF OBJECT_ID for conditional drop
    await adapter.execute(
      "IF OBJECT_ID('squn_test_users', 'U') IS NOT NULL DROP TABLE squn_test_users",
      [],
    );
    await adapter.execute(
      `CREATE TABLE squn_test_users (
        id    INT IDENTITY(1,1) PRIMARY KEY,
        name  NVARCHAR(255) NOT NULL,
        age   INT NULL
      )`,
      [],
    );
  });

  afterAll(async () => {
    await adapter.execute(
      "IF OBJECT_ID('squn_test_users', 'U') IS NOT NULL DROP TABLE squn_test_users",
      [],
    );
    await adapter.close();
  });

  describe("ping()", () => {
    it("does not throw on a healthy connection", async () => {
      await expect(adapter.ping()).resolves.toBeUndefined();
    });
  });

  // Note: MSSQL adapter binds params as @p0, @p1, etc.
  describe("basic SELECT", () => {
    it("returns correctly typed rows from a SELECT", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES (@p0, @p1)", [
        "Alice",
        30,
      ]);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES (@p0, @p1)", [
        "Bob",
        25,
      ]);

      const rows = await adapter.query("SELECT name, age FROM squn_test_users ORDER BY name", []);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ name: "Alice", age: 30 });
      expect(rows[1]).toEqual({ name: "Bob", age: 25 });
    });

    it("returns an empty array when no rows match", async () => {
      const rows = await adapter.query("SELECT * FROM squn_test_users WHERE id = @p0", [999999]);
      expect(rows).toEqual([]);
    });
  });

  describe("parameterized INSERT", () => {
    it("returns rowsAffected for a single INSERT", async () => {
      const result = await adapter.execute(
        "INSERT INTO squn_test_users (name, age) VALUES (@p0, @p1)",
        ["Charlie", 40],
      );
      expect(result.rowsAffected).toBe(1);
    });

    it("returns correct rowsAffected for UPDATE affecting multiple rows", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES (@p0, @p1)", ["A", 10]);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES (@p0, @p1)", ["B", 20]);
      const result = await adapter.execute("UPDATE squn_test_users SET age = @p0", [99]);
      expect(result.rowsAffected).toBe(2);
    });
  });

  describe("error wrapping", () => {
    it("wraps a MSSQL error as a SqunError", async () => {
      try {
        await adapter.query("SELECT * FROM nonexistent_table_xyz", []);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SqunError);
        expect((err as SqunError).context.adapter).toBe("mssql");
        expect((err as SqunError).context.operation).toBe("query");
      }
    });
  });

  describe("transactions", () => {
    it("commits changes that persist after commit", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);

      const tx = await adapter.beginTransaction();
      await tx.execute("INSERT INTO squn_test_users (name, age) VALUES (@p0, @p1)", ["TxUser", 50]);
      await tx.commit();

      const rows = await adapter.query("SELECT * FROM squn_test_users WHERE name = @p0", [
        "TxUser",
      ]);
      expect(rows).toHaveLength(1);
    });

    it("rollback undoes changes", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);

      const tx = await adapter.beginTransaction();
      await tx.execute("INSERT INTO squn_test_users (name, age) VALUES (@p0, @p1)", ["Gone", 99]);
      await tx.rollback();

      const rows = await adapter.query("SELECT * FROM squn_test_users WHERE name = @p0", ["Gone"]);
      expect(rows).toHaveLength(0);
    });
  });

  describe("NULL handling", () => {
    it("inserts and retrieves NULL values correctly", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES (@p0, @p1)", [
        "NoAge",
        null,
      ]);

      const rows = await adapter.query("SELECT name, age FROM squn_test_users WHERE name = @p0", [
        "NoAge",
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ name: "NoAge", age: null });
    });
  });
});
