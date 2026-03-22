import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { MysqlAdapter } from "../../../src/adapters/mysql.ts";
import { SqunError } from "../../../src/errors/base.ts";

const url = process.env.SQUN_MYSQL_URL;

describe.skipIf(!url)("integration/mysql — MysqlAdapter", () => {
  let adapter: MysqlAdapter;

  beforeAll(async () => {
    adapter = new MysqlAdapter({ url: url! });
    await adapter.execute("DROP TABLE IF EXISTS squn_test_users", []);
    await adapter.execute(
      `CREATE TABLE squn_test_users (
        id    INT AUTO_INCREMENT PRIMARY KEY,
        name  VARCHAR(255) NOT NULL,
        age   INT NULL
      )`,
      [],
    );
  });

  afterAll(async () => {
    try {
      await adapter.execute("DROP TABLE IF EXISTS squn_test_users", []);
      await adapter.close();
    } catch {
      // ignore cleanup errors
    }
  });

  describe("ping()", () => {
    it("does not throw on a healthy connection", async () => {
      await expect(adapter.ping()).resolves.toBeUndefined();
    });
  });

  describe("basic SELECT", () => {
    it("returns correctly typed rows from a SELECT", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES (?, ?)", ["Alice", 30]);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES (?, ?)", ["Bob", 25]);

      const rows = await adapter.query("SELECT name, age FROM squn_test_users ORDER BY name", []);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ name: "Alice", age: 30 });
      expect(rows[1]).toEqual({ name: "Bob", age: 25 });
    });

    it("returns an empty array when no rows match", async () => {
      const rows = await adapter.query("SELECT * FROM squn_test_users WHERE id = ?", [999999]);
      expect(rows).toEqual([]);
    });
  });

  describe("parameterized INSERT", () => {
    it("returns rowsAffected for a single INSERT", async () => {
      const result = await adapter.execute(
        "INSERT INTO squn_test_users (name, age) VALUES (?, ?)",
        ["Charlie", 40],
      );
      expect(result.rowsAffected).toBe(1);
    });

    it("returns correct rowsAffected for UPDATE affecting multiple rows", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES (?, ?)", ["A", 10]);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES (?, ?)", ["B", 20]);
      const result = await adapter.execute("UPDATE squn_test_users SET age = ?", [99]);
      expect(result.rowsAffected).toBe(2);
    });
  });

  describe("error wrapping", () => {
    it("wraps a MySQL error as a SqunError", async () => {
      try {
        await adapter.query("SELECT * FROM nonexistent_table_xyz", []);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SqunError);
        expect((err as SqunError).context.adapter).toBe("mysql");
        expect((err as SqunError).context.operation).toBe("query");
      }
    });
  });

  describe("transactions", () => {
    it("commits changes that persist after commit", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);

      const tx = await adapter.beginTransaction();
      await tx.execute("INSERT INTO squn_test_users (name, age) VALUES (?, ?)", ["TxUser", 50]);
      await tx.commit();

      const rows = await adapter.query("SELECT * FROM squn_test_users WHERE name = ?", ["TxUser"]);
      expect(rows).toHaveLength(1);
    });

    it("rollback undoes changes", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);

      const tx = await adapter.beginTransaction();
      await tx.execute("INSERT INTO squn_test_users (name, age) VALUES (?, ?)", ["Gone", 99]);
      await tx.rollback();

      const rows = await adapter.query("SELECT * FROM squn_test_users WHERE name = ?", ["Gone"]);
      expect(rows).toHaveLength(0);
    });
  });

  describe("NULL handling", () => {
    it("inserts and retrieves NULL values correctly", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES (?, ?)", [
        "NoAge",
        null,
      ]);

      const rows = await adapter.query("SELECT name, age FROM squn_test_users WHERE name = ?", [
        "NoAge",
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ name: "NoAge", age: null });
    });
  });
});
