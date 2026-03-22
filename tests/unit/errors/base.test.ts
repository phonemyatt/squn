import { describe, it, expect } from "bun:test";
import { ErrorCode } from "../../../src/errors/codes.ts";
import { QueryError } from "../../../src/errors/types.ts";
import { SqunError } from "../../../src/errors/base.ts";
import type { ErrorContext } from "../../../src/errors/context.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function makeError(cause?: unknown): QueryError {
  const ctx: ErrorContext = { operation: "query", adapter: "sqlite" };
  return new QueryError(ErrorCode.QUERY_EXECUTION_FAILED, "boom", ctx, cause);
}

describe("errors/base — SqunError", () => {
  it("traceId is a valid UUID v4 format", () => {
    const err = makeError();
    expect(err.traceId).toMatch(UUID_RE);
  });

  it("each instance gets a unique traceId", () => {
    const a = makeError();
    const b = makeError();
    expect(a.traceId).not.toBe(b.traceId);
  });

  it("timestamp is a Date instance", () => {
    const err = makeError();
    expect(err.timestamp).toBeInstanceOf(Date);
  });

  it("toJSON() includes code, message, traceId, timestamp as ISO string, context, and stack", () => {
    const err = makeError();
    const json = err.toJSON();

    expect(json.code).toBe(ErrorCode.QUERY_EXECUTION_FAILED);
    expect(json.message).toBe("boom");
    expect(json.traceId).toBe(err.traceId);
    expect(typeof json.timestamp).toBe("string");
    expect(json.timestamp).toBe(err.timestamp.toISOString());
    expect(json.context).toEqual({ operation: "query", adapter: "sqlite" });
    expect(typeof json.stack).toBe("string");
  });

  it("cause is preserved on the instance when provided", () => {
    const original = new TypeError("driver exploded");
    const err = makeError(original);
    expect(err.cause).toBe(original);
  });

  it("cause is undefined when not provided", () => {
    const err = makeError();
    expect(err.cause).toBeUndefined();
  });

  it("name matches the concrete subclass name, not 'SqunError'", () => {
    const err = makeError();
    expect(err.name).toBe("QueryError");
    expect(err.name).not.toBe("SqunError");
  });

  it("is an instance of both Error and SqunError", () => {
    const err = makeError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SqunError);
  });
});
