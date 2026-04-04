import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { SqliteAdapter } from "../../../src/adapters/sqlite.ts";
import { SqunError } from "../../../src/errors/base.ts";

describe("integration/sqlite — SqliteAdapter", () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter({ file: ":memory:" });
    await adapter.execute(
      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)",
      [],
    );
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe("basic SELECT", () => {
    it("returns correctly typed rows from a SELECT", async () => {
      await adapter.execute("INSERT INTO users (name, age) VALUES (?, ?)", [
        "Alice",
        30,
      ]);
      await adapter.execute("INSERT INTO users (name, age) VALUES (?, ?)", [
        "Bob",
        25,
      ]);

      const rows = await adapter.query("SELECT * FROM users ORDER BY id", []);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ id: 1, name: "Alice", age: 30 });
      expect(rows[1]).toEqual({ id: 2, name: "Bob", age: 25 });
    });

    it("returns an empty array when no rows match", async () => {
      const rows = await adapter.query(
        "SELECT * FROM users WHERE id = ?",
        [999],
      );
      expect(rows).toEqual([]);
    });
  });

  describe("parameterized INSERT", () => {
    it("returns rowsAffected for a single INSERT", async () => {
      const result = await adapter.execute(
        "INSERT INTO users (name, age) VALUES (?, ?)",
        ["Charlie", 40],
      );
      expect(result.rowsAffected).toBe(1);
    });

    it("returns correct rowsAffected for UPDATE affecting multiple rows", async () => {
      await adapter.execute("INSERT INTO users (name, age) VALUES (?, ?)", [
        "A",
        10,
      ]);
      await adapter.execute("INSERT INTO users (name, age) VALUES (?, ?)", [
        "B",
        20,
      ]);
      const result = await adapter.execute("UPDATE users SET age = ?", [99]);
      expect(result.rowsAffected).toBe(2);
    });
  });

  describe("error wrapping", () => {
    it("wraps a SQLite error as a SqunError, never a raw bun:sqlite error", async () => {
      try {
        await adapter.query("SELECT * FROM nonexistent_table", []);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SqunError);
        expect((err as SqunError).context.adapter).toBe("sqlite");
        expect((err as SqunError).context.operation).toBe("query");
      }
    });

    it("wraps an execute error as a SqunError", async () => {
      try {
        await adapter.execute("INSERT INTO nonexistent (x) VALUES (?)", [1]);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SqunError);
      }
    });
  });

  describe("ping()", () => {
    it("does not throw on a healthy connection", async () => {
      await expect(adapter.ping()).resolves.toBeUndefined();
    });
  });

  describe("transactions", () => {
    it("commits changes that persist after commit", async () => {
      const tx = await adapter.beginTransaction();
      await tx.execute("INSERT INTO users (name, age) VALUES (?, ?)", [
        "TxUser",
        50,
      ]);
      await tx.commit();

      const rows = await adapter.query("SELECT * FROM users WHERE name = ?", [
        "TxUser",
      ]);
      expect(rows).toHaveLength(1);
    });

    it("rollback undoes changes", async () => {
      const tx = await adapter.beginTransaction();
      await tx.execute("INSERT INTO users (name, age) VALUES (?, ?)", [
        "Gone",
        99,
      ]);
      await tx.rollback();

      const rows = await adapter.query("SELECT * FROM users WHERE name = ?", [
        "Gone",
      ]);
      expect(rows).toHaveLength(0);
    });
  });
});
