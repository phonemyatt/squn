import { describe, expect, it } from "bun:test";
import type { AuthConfig } from "../../../src/auth/types.ts";
import { validateAuth } from "../../../src/auth/validate-auth.ts";
import { ErrorCode } from "../../../src/errors/codes.ts";
import { AuthError } from "../../../src/errors/types.ts";

describe("auth/validate-auth — validateAuth()", () => {
  describe("userpass auth type", () => {
    it("accepts a valid username and password", () => {
      const config: AuthConfig = { type: "userpass", username: "app_user", password: "s3cret" };
      expect(() => validateAuth(config)).not.toThrow();
    });

    it("accepts a username with dots, hyphens, underscores, backslash, and @", () => {
      const config: AuthConfig = {
        type: "userpass",
        username: "DOMAIN\\user.name-1@org",
        password: "pass",
      };
      expect(() => validateAuth(config)).not.toThrow();
    });

    it("throws AUTH_INVALID_CREDENTIALS when username contains a space", () => {
      const config: AuthConfig = { type: "userpass", username: "bad user", password: "pass" };
      try {
        validateAuth(config);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AuthError);
        expect((e as AuthError).code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
        expect((e as AuthError).message).toContain("username");
      }
    });

    it("throws AUTH_INVALID_CREDENTIALS when username contains a semicolon", () => {
      const config: AuthConfig = { type: "userpass", username: "user;drop", password: "pass" };
      expect(() => validateAuth(config)).toThrow(AuthError);
    });

    it("throws AUTH_INVALID_CREDENTIALS when password contains a semicolon", () => {
      const config: AuthConfig = { type: "userpass", username: "user", password: "pass;word" };
      try {
        validateAuth(config);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AuthError);
        expect((e as AuthError).code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
        expect((e as AuthError).message).toContain("password");
      }
    });

    it("throws AUTH_INVALID_CREDENTIALS when password contains curly braces", () => {
      const config: AuthConfig = { type: "userpass", username: "user", password: "pa{ss}" };
      expect(() => validateAuth(config)).toThrow(AuthError);
    });

    it("throws AUTH_INVALID_CREDENTIALS when password contains quotes", () => {
      const config: AuthConfig = { type: "userpass", username: "user", password: 'pa"ss' };
      expect(() => validateAuth(config)).toThrow(AuthError);
    });

    it("throws AUTH_INVALID_CREDENTIALS when password contains single quotes", () => {
      const config: AuthConfig = { type: "userpass", username: "user", password: "pa'ss" };
      expect(() => validateAuth(config)).toThrow(AuthError);
    });
  });

  describe("windows auth type", () => {
    it("accepts Integrated Security with no domain or username", () => {
      const config: AuthConfig = { type: "windows" };
      expect(() => validateAuth(config)).not.toThrow();
    });

    it("accepts a valid DOMAIN\\username", () => {
      const config: AuthConfig = { type: "windows", domain: "CORP", username: "admin" };
      expect(() => validateAuth(config)).not.toThrow();
    });

    it("accepts a domain with hyphens and dots", () => {
      const config: AuthConfig = { type: "windows", domain: "my-corp.local", username: "svc_user" };
      expect(() => validateAuth(config)).not.toThrow();
    });

    it("throws AUTH_INVALID_CREDENTIALS for invalid domain characters", () => {
      const config: AuthConfig = { type: "windows", domain: "BAD DOMAIN", username: "user" };
      expect(() => validateAuth(config)).toThrow(AuthError);
    });
  });

  describe("windows-upn auth type", () => {
    it("accepts a valid UPN and password", () => {
      const config: AuthConfig = { type: "windows-upn", upn: "user@domain.com", password: "pass" };
      expect(() => validateAuth(config)).not.toThrow();
    });

    it("accepts a UPN with subdomains", () => {
      const config: AuthConfig = {
        type: "windows-upn",
        upn: "admin@corp.example.com",
        password: "pass",
      };
      expect(() => validateAuth(config)).not.toThrow();
    });

    it("throws AUTH_INVALID_CREDENTIALS for a UPN without @", () => {
      const config: AuthConfig = { type: "windows-upn", upn: "not-an-email", password: "pass" };
      try {
        validateAuth(config);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AuthError);
        expect((e as AuthError).code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
        expect((e as AuthError).message).toContain("UPN");
      }
    });

    it("throws AUTH_INVALID_CREDENTIALS for a UPN with a single-char TLD", () => {
      const config: AuthConfig = { type: "windows-upn", upn: "user@domain.c", password: "pass" };
      expect(() => validateAuth(config)).toThrow(AuthError);
    });

    it("also validates the password for forbidden characters", () => {
      const config: AuthConfig = { type: "windows-upn", upn: "user@domain.com", password: "p;ss" };
      expect(() => validateAuth(config)).toThrow(AuthError);
    });
  });

  describe("connection-string auth type", () => {
    it("accepts a non-empty URL", () => {
      const config: AuthConfig = {
        type: "connection-string",
        url: "postgresql://user:pass@host/db",
      };
      expect(() => validateAuth(config)).not.toThrow();
    });

    it("throws AUTH_MISSING for an empty URL", () => {
      const config: AuthConfig = { type: "connection-string", url: "" };
      try {
        validateAuth(config);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AuthError);
        expect((e as AuthError).code).toBe(ErrorCode.AUTH_MISSING);
      }
    });
  });

  describe("azure-ad auth type", () => {
    const validTenant = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const validClient = "12345678-abcd-ef01-2345-6789abcdef01";

    it("accepts valid GUIDs with clientSecret", () => {
      const config: AuthConfig = {
        type: "azure-ad",
        tenantId: validTenant,
        clientId: validClient,
        clientSecret: "my-secret",
      };
      expect(() => validateAuth(config)).not.toThrow();
    });

    it("accepts valid GUIDs with managedIdentity: true", () => {
      const config: AuthConfig = {
        type: "azure-ad",
        tenantId: validTenant,
        clientId: validClient,
        managedIdentity: true,
      };
      expect(() => validateAuth(config)).not.toThrow();
    });

    it("throws AUTH_INVALID_CREDENTIALS when tenantId is not a valid GUID", () => {
      const config: AuthConfig = {
        type: "azure-ad",
        tenantId: "not-a-guid",
        clientId: validClient,
        clientSecret: "s",
      };
      try {
        validateAuth(config);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AuthError);
        expect((e as AuthError).code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
        expect((e as AuthError).message).toContain("tenantId");
      }
    });

    it("throws AUTH_INVALID_CREDENTIALS when clientId is not a valid GUID", () => {
      const config: AuthConfig = {
        type: "azure-ad",
        tenantId: validTenant,
        clientId: "not-a-guid",
        clientSecret: "s",
      };
      try {
        validateAuth(config);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AuthError);
        expect((e as AuthError).message).toContain("clientId");
      }
    });

    it("throws AUTH_MISSING when neither clientSecret nor managedIdentity is provided", () => {
      const config: AuthConfig = {
        type: "azure-ad",
        tenantId: validTenant,
        clientId: validClient,
      };
      try {
        validateAuth(config);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AuthError);
        expect((e as AuthError).code).toBe(ErrorCode.AUTH_MISSING);
        expect((e as AuthError).message).toContain("clientSecret");
      }
    });

    it("throws AUTH_MISSING when managedIdentity is false and no clientSecret", () => {
      const config: AuthConfig = {
        type: "azure-ad",
        tenantId: validTenant,
        clientId: validClient,
        managedIdentity: false,
      };
      expect(() => validateAuth(config)).toThrow(AuthError);
    });
  });
});
