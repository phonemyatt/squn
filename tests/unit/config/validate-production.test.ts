import { describe, expect, it } from "bun:test";
import type {
  ConnectionConfig,
  SqunConfig,
} from "../../../src/config/types.ts";
import { validateProductionConfig } from "../../../src/config/validate-production.ts";
import { ErrorCode } from "../../../src/errors/codes.ts";
import { SqunConfigError } from "../../../src/errors/types.ts";
import type { LogEntry, SqunLogger } from "../../../src/logging/logger.ts";

function makeMockLogger(): SqunLogger & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const record = (entry: LogEntry): void => {
    entries.push(entry);
  };
  return {
    entries,
    debug: record,
    info: record,
    warn: record,
    error: record,
    fatal: record,
  };
}

const prodConfig: SqunConfig = { env: "production" };

describe("config/validate-production — validateProductionConfig()", () => {
  describe("in development environment", () => {
    it("does not run any production validation", () => {
      const logger = makeMockLogger();
      expect(() =>
        validateProductionConfig(
          { env: "development" },
          "postgres",
          {},
          logger,
        ),
      ).not.toThrow();
    });
  });

  describe("in test environment", () => {
    it("does not throw even with empty config", () => {
      const logger = makeMockLogger();
      expect(() =>
        validateProductionConfig({ env: "test" }, "sqlite", {}, logger),
      ).not.toThrow();
    });
  });

  describe("PostgreSQL adapter in production", () => {
    it("throws SqunConfigError when no config is provided at all", () => {
      const logger = makeMockLogger();
      expect(() =>
        validateProductionConfig(prodConfig, "postgres", {}, logger),
      ).toThrow(SqunConfigError);
    });

    it("throws SqunConfigError listing the missing host field when only password is set", () => {
      const logger = makeMockLogger();
      const conn: ConnectionConfig = { password: "secret" };
      try {
        validateProductionConfig(prodConfig, "postgres", conn, logger);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(SqunConfigError);
        expect((e as SqunConfigError).code).toBe(ErrorCode.CONFIG_MISSING);
        expect((e as SqunConfigError).message).toContain("host");
      }
    });

    it("throws SqunConfigError listing the missing password field when only host is set", () => {
      const logger = makeMockLogger();
      const conn: ConnectionConfig = { host: "db.example.com" };
      try {
        validateProductionConfig(prodConfig, "postgres", conn, logger);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(SqunConfigError);
        expect((e as SqunConfigError).message).toContain("password");
      }
    });

    it("throws SqunConfigError when a full URL is provided but is malformed", () => {
      const logger = makeMockLogger();
      const conn: ConnectionConfig = { url: "not-a-valid-url" };
      try {
        validateProductionConfig(prodConfig, "postgres", conn, logger);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(SqunConfigError);
        expect((e as SqunConfigError).code).toBe(
          ErrorCode.CONFIG_URL_MALFORMED,
        );
      }
    });

    it("does not throw when a valid full URL is provided", () => {
      const logger = makeMockLogger();
      const conn: ConnectionConfig = {
        url: "postgresql://user:pass@db.host:5432/mydb",
      };
      expect(() =>
        validateProductionConfig(prodConfig, "postgres", conn, logger),
      ).not.toThrow();
    });

    it("does not throw when all individual fields are provided", () => {
      const logger = makeMockLogger();
      const conn: ConnectionConfig = {
        host: "db.example.com",
        password: "secret",
        ssl: true,
      };
      expect(() =>
        validateProductionConfig(prodConfig, "postgres", conn, logger),
      ).not.toThrow();
    });

    it("the error message includes the exact SQUN_PG_URL env var name as a quick fix hint", () => {
      const logger = makeMockLogger();
      try {
        validateProductionConfig(prodConfig, "postgres", {}, logger);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as SqunConfigError).message).toContain("SQUN_PG");
      }
    });

    it("logs a warning when host is localhost but does not throw", () => {
      const logger = makeMockLogger();
      const conn: ConnectionConfig = {
        host: "localhost",
        password: "secret",
        ssl: true,
      };
      expect(() =>
        validateProductionConfig(prodConfig, "postgres", conn, logger),
      ).not.toThrow();
      expect(
        logger.entries.some(
          (e) => e.level === "warn" && e.message.includes("localhost"),
        ),
      ).toBe(true);
    });

    it("logs a warning when SSL is disabled but does not throw", () => {
      const logger = makeMockLogger();
      const conn: ConnectionConfig = {
        host: "db.example.com",
        password: "secret",
        ssl: false,
      };
      expect(() =>
        validateProductionConfig(prodConfig, "postgres", conn, logger),
      ).not.toThrow();
      expect(
        logger.entries.some(
          (e) => e.level === "warn" && e.message.includes("SSL"),
        ),
      ).toBe(true);
    });

    it("logs a warning when user is 'postgres' but does not throw", () => {
      const logger = makeMockLogger();
      const conn: ConnectionConfig = {
        host: "db.example.com",
        password: "secret",
        user: "postgres",
        ssl: true,
      };
      expect(() =>
        validateProductionConfig(prodConfig, "postgres", conn, logger),
      ).not.toThrow();
      expect(
        logger.entries.some(
          (e) => e.level === "warn" && e.message.includes("superuser"),
        ),
      ).toBe(true);
    });
  });

  describe("SQLite adapter in production", () => {
    it("throws SqunConfigError when file is ':memory:'", () => {
      const logger = makeMockLogger();
      const conn: ConnectionConfig = { url: ":memory:" };
      try {
        validateProductionConfig(prodConfig, "sqlite", conn, logger);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(SqunConfigError);
        expect((e as SqunConfigError).code).toBe(
          ErrorCode.CONFIG_PRODUCTION_GUARD,
        );
        expect((e as SqunConfigError).message).toContain(":memory:");
      }
    });

    it("throws SqunConfigError when file is not provided", () => {
      const logger = makeMockLogger();
      try {
        validateProductionConfig(prodConfig, "sqlite", {}, logger);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(SqunConfigError);
        expect((e as SqunConfigError).code).toBe(ErrorCode.CONFIG_MISSING);
      }
    });

    it("does not throw when file is an absolute path", () => {
      const logger = makeMockLogger();
      const conn: ConnectionConfig = { url: "/data/prod.db" };
      expect(() =>
        validateProductionConfig(prodConfig, "sqlite", conn, logger),
      ).not.toThrow();
    });

    it("the error message includes the SQUN_SQLITE_FILE env var name", () => {
      const logger = makeMockLogger();
      try {
        validateProductionConfig(prodConfig, "sqlite", {}, logger);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as SqunConfigError).message).toContain("SQUN_SQLITE_FILE");
      }
    });
  });

  describe("MSSQL adapter in production", () => {
    it("throws listing missing auth config when no URL and no authType", () => {
      const logger = makeMockLogger();
      const conn: ConnectionConfig = {
        host: "db.example.com",
        password: "secret",
      };
      try {
        validateProductionConfig(prodConfig, "mssql", conn, logger);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(SqunConfigError);
        expect((e as SqunConfigError).message).toContain("auth");
      }
    });
  });
});
