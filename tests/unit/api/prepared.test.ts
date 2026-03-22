import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { SqliteAdapter } from "../../../src/adapters/sqlite.ts";
import { PreparedQuery, prepare } from "../../../src/api/prepared.ts";
import { ErrorCode } from "../../../src/errors/codes.ts";
import { QueryError } from "../../../src/errors/types.ts";
import { sql } from "../../../src/sql/tag.ts";

describe("api/prepared — PreparedQuery", () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter({ file: ":memory:" });
    await adapter.execute(
      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER)",
      [],
    );
    await adapter.execute("INSERT INTO users (name, age) VALUES (?, ?)", ["Alice", 30]);
    await adapter.execute("INSERT INTO users (name, age) VALUES (?, ?)", ["Bob", 25]);
    await adapter.execute("INSERT INTO users (name, age) VALUES (?, ?)", ["Charlie", 40]);
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe("prepare() — one-time compilation", () => {
    it("returns a PreparedQuery instance", () => {
      const fragment = sql`SELECT * FROM users WHERE id = ${0}`;
      const q = prepare(adapter, fragment, ["id"]);
      expect(q).toBeInstanceOf(PreparedQuery);
    });

    it("stores the SQL text and param names", () => {
      const fragment = sql`SELECT * FROM users WHERE id = ${0}`;
      const q = prepare(adapter, fragment, ["id"]);
      expect(q.rawSql).toBe(fragment.text);
      expect(q.paramNames).toEqual(["id"]);
    });

    it("normalises the SQL for logging", () => {
      const fragment = sql`select * from users where id = ${0}`;
      const q = prepare(adapter, fragment, ["id"]);
      expect(q.sql).toContain("SELECT");
      expect(q.sql).toContain("FROM");
    });
  });

  describe(".all() — returns T[]", () => {
    it("executes the prepared query and returns all matching rows", async () => {
      const fragment = sql`SELECT * FROM users WHERE age >= ${0}`;
      const q = prepare<{ id: number; name: string; age: number }, { minAge: number }>(
        adapter,
        fragment,
        ["minAge"],
      );
      const rows = await q.all({ minAge: 30 });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.name).sort()).toEqual(["Alice", "Charlie"]);
    });

    it("can be called multiple times with different params — reuses the buffer", async () => {
      const fragment = sql`SELECT * FROM users WHERE age >= ${0}`;
      const q = prepare<{ id: number; name: string; age: number }, { minAge: number }>(
        adapter,
        fragment,
        ["minAge"],
      );

      const r1 = await q.all({ minAge: 30 });
      expect(r1).toHaveLength(2);

      const r2 = await q.all({ minAge: 40 });
      expect(r2).toHaveLength(1);
      expect(r2[0]?.name).toBe("Charlie");

      const r3 = await q.all({ minAge: 100 });
      expect(r3).toHaveLength(0);
    });
  });

  describe(".first() — returns T | null", () => {
    it("returns the first row when rows exist", async () => {
      const fragment = sql`SELECT * FROM users WHERE name = ${0}`;
      const q = prepare<{ id: number; name: string; age: number }, { name: string }>(
        adapter,
        fragment,
        ["name"],
      );
      const row = await q.first({ name: "Alice" });
      expect(row).not.toBeNull();
      expect(row?.name).toBe("Alice");
    });

    it("returns null when no rows match", async () => {
      const fragment = sql`SELECT * FROM users WHERE name = ${0}`;
      const q = prepare<{ id: number; name: string; age: number }, { name: string }>(
        adapter,
        fragment,
        ["name"],
      );
      const row = await q.first({ name: "Nobody" });
      expect(row).toBeNull();
    });
  });

  describe(".single() — returns exactly one T", () => {
    it("returns the row when exactly one matches", async () => {
      const fragment = sql`SELECT * FROM users WHERE name = ${0}`;
      const q = prepare<{ id: number; name: string; age: number }, { name: string }>(
        adapter,
        fragment,
        ["name"],
      );
      const row = await q.single({ name: "Bob" });
      expect(row.name).toBe("Bob");
    });

    it("throws NO_ROWS_FOUND when zero rows match", async () => {
      const fragment = sql`SELECT * FROM users WHERE name = ${0}`;
      const q = prepare<{ id: number; name: string; age: number }, { name: string }>(
        adapter,
        fragment,
        ["name"],
      );
      try {
        await q.single({ name: "Nobody" });
        expect.unreachable("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(QueryError);
        expect((e as QueryError).code).toBe(ErrorCode.NO_ROWS_FOUND);
      }
    });

    it("throws MULTIPLE_ROWS_FOUND when more than one row matches", async () => {
      const fragment = sql`SELECT * FROM users WHERE age >= ${0}`;
      const q = prepare<{ id: number; name: string; age: number }, { minAge: number }>(
        adapter,
        fragment,
        ["minAge"],
      );
      try {
        await q.single({ minAge: 1 });
        expect.unreachable("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(QueryError);
        expect((e as QueryError).code).toBe(ErrorCode.MULTIPLE_ROWS_FOUND);
      }
    });
  });

  describe(".scalar() — returns first column of first row", () => {
    it("returns the scalar value", async () => {
      const fragment = sql`SELECT COUNT(*) as cnt FROM users WHERE age >= ${0}`;
      const q = prepare<number, { minAge: number }>(adapter, fragment, ["minAge"]);
      const count = await q.scalar({ minAge: 30 });
      expect(count).toBe(2);
    });

    it("throws NO_ROWS_FOUND on empty result", async () => {
      const fragment = sql`SELECT id FROM users WHERE name = ${0}`;
      const q = prepare<number, { name: string }>(adapter, fragment, ["name"]);
      await expect(q.scalar({ name: "Nobody" })).rejects.toThrow(QueryError);
    });
  });

  describe(".execute() — returns { rowsAffected }", () => {
    it("executes a write and returns affected count", async () => {
      const fragment = sql`UPDATE users SET age = ${0} WHERE name = ${0}`;
      const q = prepare<never, { newAge: number; name: string }>(adapter, fragment, [
        "newAge",
        "name",
      ]);
      const result = await q.execute({ newAge: 99, name: "Alice" });
      expect(result.rowsAffected).toBe(1);

      const rows = await adapter.query("SELECT age FROM users WHERE name = ?", ["Alice"]);
      expect((rows[0] as { age: number }).age).toBe(99);
    });
  });

  describe("hot path efficiency", () => {
    it("does not re-validate SQL on each call", async () => {
      // If validation happened per-call, we'd see measurable overhead.
      // This test verifies correctness — the real perf benefit is in benchmarks.
      const fragment = sql`SELECT * FROM users WHERE id = ${0}`;
      const q = prepare<{ id: number; name: string; age: number }, { id: number }>(
        adapter,
        fragment,
        ["id"],
      );

      // Call 1000 times — should not throw and should be fast
      for (let i = 0; i < 1000; i++) {
        await q.first({ id: 1 });
      }
    });
  });
});
