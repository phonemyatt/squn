import { describe, it, expect } from "bun:test";
import { SQUN_REGEX } from "../../../src/sql/regex.ts";

describe("sql/regex — SQUN_REGEX", () => {
  describe("NULL_BYTE", () => {
    it("matches a null byte in the middle of a string", () => {
      expect(SQUN_REGEX.NULL_BYTE.test("abc\0def")).toBe(true);
    });

    it("matches a null byte at the start", () => {
      expect(SQUN_REGEX.NULL_BYTE.test("\0abc")).toBe(true);
    });

    it("does not match clean input", () => {
      expect(SQUN_REGEX.NULL_BYTE.test("SELECT 1")).toBe(false);
    });
  });

  describe("STACKED_STATEMENTS", () => {
    it("matches '; DROP TABLE users'", () => {
      expect(SQUN_REGEX.STACKED_STATEMENTS.test("; DROP TABLE users")).toBe(true);
    });

    it("matches '; SELECT * FROM secrets'", () => {
      expect(SQUN_REGEX.STACKED_STATEMENTS.test("; SELECT * FROM secrets")).toBe(true);
    });

    it("matches regardless of whitespace around the semicolon", () => {
      expect(SQUN_REGEX.STACKED_STATEMENTS.test(";   DELETE FROM users")).toBe(true);
    });

    it("does not match a semicolon at the very end with no following keyword", () => {
      expect(SQUN_REGEX.STACKED_STATEMENTS.test("SELECT 1;")).toBe(false);
    });

    it("does not match a semicolon with non-SQL text after it", () => {
      expect(SQUN_REGEX.STACKED_STATEMENTS.test("; hello world")).toBe(false);
    });
  });

  describe("MSSQL_DANGEROUS", () => {
    it("matches xp_cmdshell", () => {
      expect(SQUN_REGEX.MSSQL_DANGEROUS.test("EXEC xp_cmdshell 'dir'")).toBe(true);
    });

    it("matches sp_oacreate", () => {
      expect(SQUN_REGEX.MSSQL_DANGEROUS.test("sp_oacreate")).toBe(true);
    });

    it("matches OPENROWSET", () => {
      expect(SQUN_REGEX.MSSQL_DANGEROUS.test("SELECT * FROM OPENROWSET(...)")).toBe(true);
    });

    it("does not match a normal query", () => {
      expect(SQUN_REGEX.MSSQL_DANGEROUS.test("SELECT id FROM users")).toBe(false);
    });
  });

  describe("UNION_INJECTION", () => {
    it("matches 'UNION SELECT'", () => {
      expect(SQUN_REGEX.UNION_INJECTION.test("UNION SELECT 1,2,3")).toBe(true);
    });

    it("matches 'UNION ALL SELECT'", () => {
      expect(SQUN_REGEX.UNION_INJECTION.test("UNION ALL SELECT 1")).toBe(true);
    });

    it("matches lowercase", () => {
      expect(SQUN_REGEX.UNION_INJECTION.test("union select 1")).toBe(true);
    });

    it("does not match the word 'union' in a column alias", () => {
      expect(SQUN_REGEX.UNION_INJECTION.test("SELECT union_type FROM t")).toBe(false);
    });
  });

  describe("TAUTOLOGY", () => {
    it("matches OR 1=1", () => {
      expect(SQUN_REGEX.TAUTOLOGY.test("' OR 1=1")).toBe(true);
    });

    it("matches OR 'a'='a'", () => {
      expect(SQUN_REGEX.TAUTOLOGY.test("OR 'a'='a'")).toBe(true);
    });

    it("matches OR true", () => {
      expect(SQUN_REGEX.TAUTOLOGY.test("OR true")).toBe(true);
    });

    it("does not match a legitimate OR clause", () => {
      expect(SQUN_REGEX.TAUTOLOGY.test("WHERE a = 1 OR b = 2")).toBe(false);
    });
  });

  describe("TIME_BASED", () => {
    it("matches WAITFOR DELAY", () => {
      expect(SQUN_REGEX.TIME_BASED.test("WAITFOR DELAY '00:00:05'")).toBe(true);
    });

    it("matches SLEEP()", () => {
      expect(SQUN_REGEX.TIME_BASED.test("SLEEP(5)")).toBe(true);
    });

    it("matches PG_SLEEP()", () => {
      expect(SQUN_REGEX.TIME_BASED.test("PG_SLEEP(5)")).toBe(true);
    });

    it("matches BENCHMARK()", () => {
      expect(SQUN_REGEX.TIME_BASED.test("BENCHMARK(1000, SHA1('a'))")).toBe(true);
    });

    it("does not match normal SQL", () => {
      expect(SQUN_REGEX.TIME_BASED.test("SELECT sleep_hours FROM schedule")).toBe(false);
    });
  });

  describe("MYSQL_DANGEROUS", () => {
    it("matches LOAD_FILE()", () => {
      expect(SQUN_REGEX.MYSQL_DANGEROUS.test("LOAD_FILE('/etc/passwd')")).toBe(true);
    });

    it("matches INTO OUTFILE", () => {
      expect(SQUN_REGEX.MYSQL_DANGEROUS.test("INTO OUTFILE '/tmp/dump'")).toBe(true);
    });

    it("does not match normal INSERT INTO", () => {
      expect(SQUN_REGEX.MYSQL_DANGEROUS.test("INSERT INTO users VALUES (1)")).toBe(false);
    });
  });

  describe("PG_DANGEROUS", () => {
    it("matches pg_read_file()", () => {
      expect(SQUN_REGEX.PG_DANGEROUS.test("pg_read_file('/etc/passwd')")).toBe(true);
    });

    it("matches lo_import()", () => {
      expect(SQUN_REGEX.PG_DANGEROUS.test("lo_import('/tmp/file')")).toBe(true);
    });

    it("does not match normal pg_ prefixed columns", () => {
      expect(SQUN_REGEX.PG_DANGEROUS.test("SELECT pg_class FROM catalog")).toBe(false);
    });
  });

  describe("CHAR_ENCODING", () => {
    it("matches CHAR(65)", () => {
      expect(SQUN_REGEX.CHAR_ENCODING.test("CHAR(65)")).toBe(true);
    });

    it("does not match the word 'character'", () => {
      expect(SQUN_REGEX.CHAR_ENCODING.test("CHARACTER SET utf8")).toBe(false);
    });
  });

  describe("HEX_ENCODING", () => {
    it("matches 0x41", () => {
      expect(SQUN_REGEX.HEX_ENCODING.test("0x41")).toBe(true);
    });

    it("matches longer hex strings", () => {
      expect(SQUN_REGEX.HEX_ENCODING.test("0x414243")).toBe(true);
    });

    it("does not match a single hex digit", () => {
      expect(SQUN_REGEX.HEX_ENCODING.test("0xA")).toBe(false);
    });
  });

  describe("BLOCK_COMMENT", () => {
    it("matches /* comment */", () => {
      expect(SQUN_REGEX.BLOCK_COMMENT.test("SELECT /* hidden */ 1")).toBe(true);
    });

    it("does not match normal SQL", () => {
      expect(SQUN_REGEX.BLOCK_COMMENT.test("SELECT 1")).toBe(false);
    });
  });

  describe("LINE_COMMENT", () => {
    it("matches --", () => {
      expect(SQUN_REGEX.LINE_COMMENT.test("SELECT 1 -- comment")).toBe(true);
    });

    it("matches #", () => {
      expect(SQUN_REGEX.LINE_COMMENT.test("SELECT 1 # comment")).toBe(true);
    });

    it("does not match normal SQL", () => {
      expect(SQUN_REGEX.LINE_COMMENT.test("SELECT 1")).toBe(false);
    });
  });

  describe("VALID_IDENTIFIER", () => {
    it("matches a simple lowercase identifier", () => {
      expect(SQUN_REGEX.VALID_IDENTIFIER.test("users")).toBe(true);
    });

    it("matches an identifier starting with an underscore", () => {
      expect(SQUN_REGEX.VALID_IDENTIFIER.test("_private")).toBe(true);
    });

    it("matches an identifier containing digits after the first character", () => {
      expect(SQUN_REGEX.VALID_IDENTIFIER.test("table2")).toBe(true);
    });

    it("does not match an identifier starting with a digit", () => {
      expect(SQUN_REGEX.VALID_IDENTIFIER.test("2table")).toBe(false);
    });

    it("does not match an identifier containing a hyphen", () => {
      expect(SQUN_REGEX.VALID_IDENTIFIER.test("my-table")).toBe(false);
    });

    it("does not match an empty string", () => {
      expect(SQUN_REGEX.VALID_IDENTIFIER.test("")).toBe(false);
    });

    it("does not match an identifier containing a space", () => {
      expect(SQUN_REGEX.VALID_IDENTIFIER.test("my table")).toBe(false);
    });
  });

  describe("VALID_USERNAME", () => {
    it("matches a simple username", () => {
      expect(SQUN_REGEX.VALID_USERNAME.test("app_user")).toBe(true);
    });

    it("matches a username with dots and @", () => {
      expect(SQUN_REGEX.VALID_USERNAME.test("user.name@org")).toBe(true);
    });

    it("matches a DOMAIN\\user format", () => {
      expect(SQUN_REGEX.VALID_USERNAME.test("CORP\\admin")).toBe(true);
    });

    it("does not match a username with spaces", () => {
      expect(SQUN_REGEX.VALID_USERNAME.test("bad user")).toBe(false);
    });
  });

  describe("VALID_DOMAIN_USER", () => {
    it("matches DOMAIN\\username", () => {
      expect(SQUN_REGEX.VALID_DOMAIN_USER.test("CORP\\admin")).toBe(true);
    });

    it("matches a domain with hyphens", () => {
      expect(SQUN_REGEX.VALID_DOMAIN_USER.test("my-corp.local\\svc_user")).toBe(true);
    });

    it("does not match a username with no domain prefix", () => {
      expect(SQUN_REGEX.VALID_DOMAIN_USER.test("admin")).toBe(false);
    });

    it("does not match a double backslash", () => {
      expect(SQUN_REGEX.VALID_DOMAIN_USER.test("CORP\\\\admin")).toBe(false);
    });
  });

  describe("VALID_UPN", () => {
    it("matches user@domain.com", () => {
      expect(SQUN_REGEX.VALID_UPN.test("user@domain.com")).toBe(true);
    });

    it("matches admin@corp.example.com", () => {
      expect(SQUN_REGEX.VALID_UPN.test("admin@corp.example.com")).toBe(true);
    });

    it("does not match a UPN without @", () => {
      expect(SQUN_REGEX.VALID_UPN.test("not-an-email")).toBe(false);
    });

    it("does not match a UPN with single-char TLD", () => {
      expect(SQUN_REGEX.VALID_UPN.test("user@domain.c")).toBe(false);
    });
  });

  describe("PASSWORD_IN_URL", () => {
    it("matches the password portion of a URL", () => {
      // Reset lastIndex for global regex
      SQUN_REGEX.PASSWORD_IN_URL.lastIndex = 0;
      expect(SQUN_REGEX.PASSWORD_IN_URL.test("postgresql://user:secret@host")).toBe(true);
    });

    it("can be used to mask passwords", () => {
      const url = "postgresql://admin:s3cret@db.host:5432/mydb";
      const masked = url.replace(SQUN_REGEX.PASSWORD_IN_URL, "$1****$3");
      expect(masked).toBe("postgresql://admin:****@db.host:5432/mydb");
      expect(masked).not.toContain("s3cret");
    });
  });
});
