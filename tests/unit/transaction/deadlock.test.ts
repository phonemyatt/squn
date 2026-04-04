import { describe, expect, it } from "bun:test";
import { ErrorCode } from "../../../src/errors/codes.ts";
import { QueryError } from "../../../src/errors/types.ts";
import {
  isDeadlock,
  retryWithDeadlockBackoff,
} from "../../../src/transaction/deadlock.ts";

function makeErr(cause: unknown): QueryError {
  return new QueryError(
    ErrorCode.QUERY_EXECUTION_FAILED,
    "db error",
    { operation: "query" },
    cause,
  );
}

describe("transaction/deadlock — isDeadlock()", () => {
  it("detects MSSQL deadlock (error 1205)", () => {
    expect(isDeadlock(makeErr({ number: 1205 }), "mssql")).toBe(true);
  });

  it("does not detect non-deadlock MSSQL error", () => {
    expect(isDeadlock(makeErr({ number: 999 }), "mssql")).toBe(false);
  });

  it("detects PostgreSQL deadlock (code 40P01)", () => {
    expect(isDeadlock(makeErr({ code: "40P01" }), "postgres")).toBe(true);
  });

  it("does not detect non-deadlock PostgreSQL error", () => {
    expect(isDeadlock(makeErr({ code: "23505" }), "postgres")).toBe(false);
  });

  it("detects MySQL deadlock (errno 1213)", () => {
    expect(isDeadlock(makeErr({ errno: 1213 }), "mysql")).toBe(true);
  });

  it("detects SQLite busy (SQLITE_BUSY)", () => {
    expect(isDeadlock(makeErr({ code: "SQLITE_BUSY" }), "sqlite")).toBe(true);
  });

  it("detects SQLite busy in message", () => {
    expect(
      isDeadlock(
        makeErr({ message: "database is locked SQLITE_BUSY" }),
        "sqlite",
      ),
    ).toBe(true);
  });

  it("returns false when cause is null", () => {
    const err = new QueryError(ErrorCode.QUERY_EXECUTION_FAILED, "err", {
      operation: "q",
    });
    expect(isDeadlock(err, "mssql")).toBe(false);
  });
});

describe("transaction/deadlock — retryWithDeadlockBackoff()", () => {
  it("returns result on first success without retry", async () => {
    const result = await retryWithDeadlockBackoff(
      () => Promise.resolve(42),
      "postgres",
      {
        maxRetries: 3,
      },
    );
    expect(result).toBe(42);
  });

  it("retries on deadlock and succeeds on second attempt", async () => {
    let attempt = 0;
    const result = await retryWithDeadlockBackoff(
      async () => {
        attempt++;
        if (attempt === 1) throw makeErr({ code: "40P01" });
        return "ok";
      },
      "postgres",
      { maxRetries: 3, baseDelayMs: 1 },
    );
    expect(result).toBe("ok");
    expect(attempt).toBe(2);
  });

  it("throws after exhausting retries", async () => {
    await expect(
      retryWithDeadlockBackoff(
        () => Promise.reject(makeErr({ code: "40P01" })),
        "postgres",
        {
          maxRetries: 1,
          baseDelayMs: 1,
        },
      ),
    ).rejects.toThrow();
  });

  it("does not retry on non-deadlock errors", async () => {
    let attempt = 0;
    try {
      await retryWithDeadlockBackoff(
        async () => {
          attempt++;
          throw makeErr({ code: "23505" });
        },
        "postgres",
        { maxRetries: 3, baseDelayMs: 1 },
      );
    } catch {
      /* expected */
    }
    expect(attempt).toBe(1);
  });
});
