import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { SqliteAdapter } from "../../../src/adapters/sqlite.ts";
import { deleteRow, upsert } from "../../../src/api/execute.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setup(): Promise<SqliteAdapter> {
  const adapter = new SqliteAdapter({ file: ":memory:" });
  await adapter.execute(
    `CREATE TABLE users (
      id   INTEGER PRIMARY KEY,
      name TEXT    NOT NULL,
      age  INTEGER NOT NULL
    )`,
    [],
  );
  await adapter.execute(`INSERT INTO users (id, name, age) VALUES (1, 'Alice', 30)`, []);
  await adapter.execute(`INSERT INTO users (id, name, age) VALUES (2, 'Bob', 25)`, []);
  return adapter;
}

// ---------------------------------------------------------------------------
// deleteRow()
// ---------------------------------------------------------------------------

describe("api/execute — deleteRow()", () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = await setup();
  });

  afterEach(async () => {
    await adapter.close();
  });

  it("deletes an existing row and returns rowsAffected = 1", async () => {
    const result = await deleteRow(adapter, "users", "id", 1);
    expect(result.rowsAffected).toBe(1);

    const rows = await adapter.query(`SELECT * FROM users WHERE id = 1`, []);
    expect(rows).toHaveLength(0);
  });

  it("returns rowsAffected = 0 when no row matches", async () => {
    const result = await deleteRow(adapter, "users", "id", 9999);
    expect(result.rowsAffected).toBe(0);
  });

  it("does not delete other rows", async () => {
    await deleteRow(adapter, "users", "id", 1);
    const rows = await adapter.query(`SELECT * FROM users`, []);
    expect(rows).toHaveLength(1);
    expect((rows[0] as { id: number }).id).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// upsert() — SQLite branch (INSERT OR REPLACE)
// ---------------------------------------------------------------------------

describe("api/execute — upsert() [sqlite]", () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = await setup();
  });

  afterEach(async () => {
    await adapter.close();
  });

  it("inserts a new row when it does not exist", async () => {
    const result = await upsert(adapter, "users", { id: 3, name: "Charlie", age: 40 }, ["id"]);
    // SQLite INSERT OR REPLACE rowsAffected may be 1 for insert
    expect(result.rowsAffected).toBeGreaterThanOrEqual(1);

    const rows = await adapter.query(`SELECT * FROM users WHERE id = 3`, []);
    expect(rows).toHaveLength(1);
    expect((rows[0] as { name: string }).name).toBe("Charlie");
  });

  it("replaces an existing row on conflict", async () => {
    const result = await upsert(adapter, "users", { id: 1, name: "Alice Updated", age: 31 }, [
      "id",
    ]);
    // SQLite INSERT OR REPLACE counts as delete + insert = 2, but at least 1
    expect(result.rowsAffected).toBeGreaterThanOrEqual(1);

    const rows = await adapter.query(`SELECT * FROM users WHERE id = 1`, []);
    expect(rows).toHaveLength(1);
    expect((rows[0] as { name: string }).name).toBe("Alice Updated");
    expect((rows[0] as { age: number }).age).toBe(31);
  });

  it("respects explicit updateColumns (SQLite: full replace uses all cols anyway)", async () => {
    // SQLite INSERT OR REPLACE always replaces all columns; explicit updateColumns
    // is accepted without error and the row is replaced in full.
    const result = await upsert(
      adapter,
      "users",
      { id: 1, name: "Alice", age: 99 },
      ["id"],
      ["age"],
    );
    expect(result.rowsAffected).toBeGreaterThanOrEqual(1);

    const rows = await adapter.query(`SELECT * FROM users WHERE id = 1`, []);
    expect((rows[0] as { age: number }).age).toBe(99);
  });
});
