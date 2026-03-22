import { describe, it, expect } from "bun:test";
import { ErrorCode } from "../../../src/errors/codes.ts";
import { QueryError, ConnectionError } from "../../../src/errors/types.ts";
import { wrapError } from "../../../src/errors/wrap.ts";
import type { ErrorContext } from "../../../src/errors/context.ts";

const ctx: ErrorContext = { operation: "execute", adapter: "postgres" };

describe("errors/wrap — wrapError()", () => {
  it("wrapping a plain Error returns a QueryError with the plain Error as cause", () => {
    const raw = new TypeError("connection refused");
    const wrapped = wrapError(raw, ErrorCode.QUERY_EXECUTION_FAILED, ctx, "query failed");

    expect(wrapped).toBeInstanceOf(QueryError);
    expect(wrapped.cause).toBe(raw);
  });

  it("wrapping a SqunError returns the same instance unchanged", () => {
    const existing = new ConnectionError(
      ErrorCode.CONN_UNKNOWN,
      "not found",
      { operation: "connect" },
    );
    const result = wrapError(existing, ErrorCode.QUERY_EXECUTION_FAILED, ctx, "query failed");

    expect(result).toBe(existing);
    expect(result).toBeInstanceOf(ConnectionError);
    expect(result.code).toBe(ErrorCode.CONN_UNKNOWN);
  });

  it("the wrapped error has the correct code and context", () => {
    const raw = new Error("driver error");
    const wrapped = wrapError(raw, ErrorCode.ADAPTER_DRIVER_ERROR, ctx, "adapter failure");

    expect(wrapped.code).toBe(ErrorCode.ADAPTER_DRIVER_ERROR);
    expect(wrapped.context).toEqual(ctx);
    expect(wrapped.message).toBe("adapter failure");
  });

  it("wrapping a non-Error value preserves it as cause", () => {
    const wrapped = wrapError("string error", ErrorCode.QUERY_EXECUTION_FAILED, ctx, "failed");

    expect(wrapped).toBeInstanceOf(QueryError);
    expect(wrapped.cause).toBe("string error");
  });
});
