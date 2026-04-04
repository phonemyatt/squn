import { describe, expect, it } from "bun:test";
import { maskConnectionString } from "../../../src/auth/mask.ts";

describe("auth/mask — maskConnectionString()", () => {
  describe("URL format masking", () => {
    it("masks the password in a PostgreSQL URL", () => {
      const masked = maskConnectionString(
        "postgresql://admin:s3cret@db.host:5432/mydb",
      );
      expect(masked).toBe("postgresql://admin:****@db.host:5432/mydb");
      expect(masked).not.toContain("s3cret");
    });

    it("masks the password in a MySQL URL", () => {
      const masked = maskConnectionString(
        "mysql://root:hunter2@localhost:3306/app",
      );
      expect(masked).toBe("mysql://root:****@localhost:3306/app");
      expect(masked).not.toContain("hunter2");
    });

    it("masks the password in an MSSQL URL", () => {
      const masked = maskConnectionString(
        "mssql://sa:P@ssw0rd!@db:1433/billing",
      );
      expect(masked).not.toContain("P@ssw0rd!");
      expect(masked).toContain("****");
    });

    it("does not alter a URL without a password", () => {
      const url = "postgresql://admin@db.host:5432/mydb";
      expect(maskConnectionString(url)).toBe(url);
    });

    it("handles multiple URLs in a single string", () => {
      const input =
        "primary=postgresql://u:p1@h1/d1 replica=postgresql://u:p2@h2/d2";
      const masked = maskConnectionString(input);
      expect(masked).not.toContain("p1");
      expect(masked).not.toContain("p2");
    });
  });

  describe("key=value format masking", () => {
    it("masks Password= in a connection string", () => {
      const masked = maskConnectionString(
        "Server=db;Database=app;User=sa;Password=s3cret;",
      );
      expect(masked).toContain("Password=****");
      expect(masked).not.toContain("s3cret");
    });

    it("masks Pwd= in a connection string (case-insensitive)", () => {
      const masked = maskConnectionString(
        "Server=db;Pwd=hunter2;Database=app;",
      );
      expect(masked).toContain("Pwd=****");
      expect(masked).not.toContain("hunter2");
    });

    it("masks password= in lowercase", () => {
      const masked = maskConnectionString(
        "server=db;password=secret;database=app;",
      );
      expect(masked).toContain("password=****");
      expect(masked).not.toContain("secret");
    });

    it("handles spaces around the equals sign", () => {
      const masked = maskConnectionString("Password = mypass;Server=db");
      expect(masked).not.toContain("mypass");
      expect(masked).toContain("****");
    });
  });

  describe("no password leaks", () => {
    it("returns the input unchanged when no password pattern is found", () => {
      const clean = "Server=db;Database=app;Trusted_Connection=true;";
      expect(maskConnectionString(clean)).toBe(clean);
    });

    it("an empty string returns an empty string", () => {
      expect(maskConnectionString("")).toBe("");
    });
  });
});
