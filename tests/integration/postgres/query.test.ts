import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { PostgresAdapter } from "../../../src/adapters/postgres.ts";
import { SqunError } from "../../../src/errors/base.ts";

const url = process.env.SQUN_PG_URL;

describe.skipIf(!url)("integration/postgres — PostgresAdapter", () => {
  let adapter: PostgresAdapter;

  beforeAll(async () => {
    adapter = new PostgresAdapter({ url: url! });
    await adapter.execute("DROP TABLE IF EXISTS squn_test_users", []);
    await adapter.execute(
      `CREATE TABLE squn_test_users (
        id    SERIAL PRIMARY KEY,
        name  TEXT NOT NULL,
        age   INTEGER
      )`,
      [],
    );
  });

  afterAll(async () => {
    await adapter.execute("DROP TABLE IF EXISTS squn_test_users", []);
    await adapter.close();
  });

  describe("ping()", () => {
    it("does not throw on a healthy connection", async () => {
      await expect(adapter.ping()).resolves.toBeUndefined();
    });
  });

  describe("basic SELECT", () => {
    it("returns correctly typed rows from a SELECT", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES ($1, $2)", [
        "Alice",
        30,
      ]);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES ($1, $2)", ["Bob", 25]);

      const rows = await adapter.query("SELECT name, age FROM squn_test_users ORDER BY name", []);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ name: "Alice", age: 30 });
      expect(rows[1]).toEqual({ name: "Bob", age: 25 });
    });

    it("returns an empty array when no rows match", async () => {
      const rows = await adapter.query("SELECT * FROM squn_test_users WHERE id = $1", [999999]);
      expect(rows).toEqual([]);
    });
  });

  describe("parameterized INSERT", () => {
    it("returns rowsAffected for a single INSERT", async () => {
      const result = await adapter.execute(
        "INSERT INTO squn_test_users (name, age) VALUES ($1, $2)",
        ["Charlie", 40],
      );
      expect(result.rowsAffected).toBe(1);
    });

    it("returns correct rowsAffected for UPDATE affecting multiple rows", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES ($1, $2)", ["A", 10]);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES ($1, $2)", ["B", 20]);
      const result = await adapter.execute("UPDATE squn_test_users SET age = $1", [99]);
      expect(result.rowsAffected).toBe(2);
    });
  });

  describe("error wrapping", () => {
    it("wraps a PostgreSQL error as a SqunError", async () => {
      try {
        await adapter.query("SELECT * FROM nonexistent_table_xyz", []);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SqunError);
        expect((err as SqunError).context.adapter).toBe("postgres");
        expect((err as SqunError).context.operation).toBe("query");
      }
    });
  });

  describe("transactions", () => {
    it("commits changes that persist after commit", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);

      const tx = await adapter.beginTransaction();
      await tx.execute("INSERT INTO squn_test_users (name, age) VALUES ($1, $2)", ["TxUser", 50]);
      await tx.commit();

      const rows = await adapter.query("SELECT * FROM squn_test_users WHERE name = $1", ["TxUser"]);
      expect(rows).toHaveLength(1);
    });

    it("rollback undoes changes", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);

      const tx = await adapter.beginTransaction();
      await tx.execute("INSERT INTO squn_test_users (name, age) VALUES ($1, $2)", ["Gone", 99]);
      await tx.rollback();

      const rows = await adapter.query("SELECT * FROM squn_test_users WHERE name = $1", ["Gone"]);
      expect(rows).toHaveLength(0);
    });
  });

  describe("NULL handling", () => {
    it("inserts and retrieves NULL values correctly", async () => {
      await adapter.execute("DELETE FROM squn_test_users", []);
      await adapter.execute("INSERT INTO squn_test_users (name, age) VALUES ($1, $2)", [
        "NoAge",
        null,
      ]);

      const rows = await adapter.query("SELECT name, age FROM squn_test_users WHERE name = $1", [
        "NoAge",
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ name: "NoAge", age: null });
    });
  });
});
