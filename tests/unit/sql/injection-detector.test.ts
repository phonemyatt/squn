import { describe, expect, it } from "bun:test";
import { detectInjection } from "../../../src/sql/injection-detector.ts";

describe("sql/injection-detector — detectInjection()", () => {
  describe("null byte injection", () => {
    it("detects a null byte with severity 'critical'", () => {
      const r = detectInjection("abc\0def");
      expect(r.detected).toBe(true);
      expect(r.severity).toBe("critical");
      expect(r.pattern).toBe("NULL_BYTE");
    });
  });

  describe("stacked statement injection", () => {
    it("detects '; DROP TABLE' with severity 'critical'", () => {
      const r = detectInjection("; DROP TABLE users");
      expect(r.detected).toBe(true);
      expect(r.severity).toBe("critical");
    });

    it("detects '; SELECT 1' with severity 'critical'", () => {
      const r = detectInjection("; SELECT 1");
      expect(r.detected).toBe(true);
      expect(r.severity).toBe("critical");
    });
  });

  describe("UNION injection", () => {
    it("detects 'UNION SELECT' with severity 'high'", () => {
      const r = detectInjection("UNION SELECT 1,2,3");
      expect(r.detected).toBe(true);
      expect(r.severity).toBe("high");
      expect(r.pattern).toBe("UNION_INJECTION");
    });

    it("detects 'UNION ALL SELECT' with severity 'high'", () => {
      const r = detectInjection("UNION ALL SELECT 1");
      expect(r.detected).toBe(true);
      expect(r.severity).toBe("high");
    });
  });

  describe("tautology injection", () => {
    it("detects OR '1'='1' with severity 'high'", () => {
      const r = detectInjection("OR '1'='1'");
      expect(r.detected).toBe(true);
      expect(r.severity).toBe("high");
      expect(r.pattern).toBe("TAUTOLOGY");
    });
  });

  describe("time-based blind injection", () => {
    it("detects WAITFOR DELAY with severity 'high'", () => {
      const r = detectInjection("WAITFOR DELAY '00:00:05'");
      expect(r.detected).toBe(true);
      expect(r.severity).toBe("high");
    });

    it("detects SLEEP() with severity 'high'", () => {
      const r = detectInjection("SLEEP(5)");
      expect(r.detected).toBe(true);
      expect(r.severity).toBe("high");
    });
  });

  describe("obfuscation patterns", () => {
    it("detects CHAR() encoding with severity 'medium'", () => {
      const r = detectInjection("CHAR(65)");
      expect(r.detected).toBe(true);
      expect(r.severity).toBe("medium");
    });

    it("detects hex encoding with severity 'medium'", () => {
      const r = detectInjection("0x414243");
      expect(r.detected).toBe(true);
      expect(r.severity).toBe("medium");
    });
  });

  describe("comment injection", () => {
    it("detects line comments with severity 'low'", () => {
      const r = detectInjection("SELECT 1 -- rest hidden");
      expect(r.detected).toBe(true);
      expect(r.severity).toBe("low");
    });

    it("detects block comments with severity 'low'", () => {
      const r = detectInjection("SELECT /* hidden */ 1");
      expect(r.detected).toBe(true);
      expect(r.severity).toBe("low");
    });
  });

  describe("clean input", () => {
    it("returns detected: false for a normal SELECT", () => {
      const r = detectInjection("SELECT * FROM users WHERE id = $1");
      expect(r.detected).toBe(false);
      expect(r.severity).toBeNull();
      expect(r.pattern).toBeNull();
    });

    it("returns detected: false for an empty string", () => {
      const r = detectInjection("");
      expect(r.detected).toBe(false);
    });
  });
});
