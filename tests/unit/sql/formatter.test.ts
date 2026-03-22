import { describe, expect, it } from "bun:test";
import { formatSql } from "../../../src/sql/formatter.ts";

describe("sql/formatter — formatSql()", () => {
  it("collapses multiple spaces to single space", () => {
    expect(formatSql("SELECT  *   FROM   users")).toBe("SELECT * FROM users");
  });

  it("collapses newlines and tabs to single space", () => {
    expect(formatSql("SELECT *\n  FROM\t  users")).toBe("SELECT * FROM users");
  });

  it("trims leading and trailing whitespace", () => {
    expect(formatSql("  SELECT 1  ")).toBe("SELECT 1");
  });

  it("uppercases SQL keywords", () => {
    expect(formatSql("select * from users where id = $1")).toBe(
      "SELECT * FROM users WHERE id = $1",
    );
  });

  it("does not uppercase non-keyword words", () => {
    expect(formatSql("SELECT name FROM users")).toBe("SELECT name FROM users");
  });

  it("handles complex multi-line queries", () => {
    const input = `
      select u.id, u.name
      from   users u
      left join roles r on r.id = u.role_id
      where  u.active = $1
      order by u.name asc
    `;
    const result = formatSql(input);
    expect(result).toContain("SELECT");
    expect(result).toContain("FROM");
    expect(result).toContain("LEFT JOIN");
    expect(result).toContain("WHERE");
    expect(result).toContain("ORDER BY");
    expect(result).not.toContain("\n");
  });
});
