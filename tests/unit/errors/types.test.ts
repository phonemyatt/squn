import { describe, expect, it } from "bun:test";
import { SqunError } from "../../../src/errors/base.ts";
import { ErrorCode } from "../../../src/errors/codes.ts";
import type { ErrorContext } from "../../../src/errors/context.ts";
import {
  AdapterError,
  AuthError,
  ConnectionError,
  MappingError,
  QueryError,
  ReadonlyViolationError,
  SecurityError,
  SqunConfigError,
  TimeoutError,
  TransactionError,
  ValidationError,
} from "../../../src/errors/types.ts";

const ctx: ErrorContext = { operation: "test" };

const subclasses = [
  { Class: ConnectionError, code: ErrorCode.CONN_UNKNOWN, sibling: QueryError },
  { Class: QueryError, code: ErrorCode.QUERY_EXECUTION_FAILED, sibling: ConnectionError },
  { Class: MappingError, code: ErrorCode.NULL_VIOLATION, sibling: QueryError },
  { Class: ValidationError, code: ErrorCode.PARAM_MISSING, sibling: MappingError },
  { Class: TransactionError, code: ErrorCode.TX_COMMIT_FAILED, sibling: ValidationError },
  { Class: TimeoutError, code: ErrorCode.POOL_QUEUE_FULL, sibling: TransactionError },
  { Class: AdapterError, code: ErrorCode.ADAPTER_NOT_SUPPORTED, sibling: TimeoutError },
  { Class: ReadonlyViolationError, code: ErrorCode.READONLY_WRITE_BLOCKED, sibling: AdapterError },
  { Class: SecurityError, code: ErrorCode.INJECTION_DETECTED, sibling: ReadonlyViolationError },
  { Class: SqunConfigError, code: ErrorCode.CONFIG_MISSING, sibling: SecurityError },
  { Class: AuthError, code: ErrorCode.AUTH_MISSING, sibling: SqunConfigError },
] as const;

describe("errors/types — error subclasses", () => {
  for (const { Class, code, sibling } of subclasses) {
    describe(Class.name, () => {
      it("is an instance of SqunError", () => {
        const err = new Class(code, "msg", ctx);
        expect(err).toBeInstanceOf(SqunError);
      });

      it(`is an instance of ${Class.name}`, () => {
        const err = new Class(code, "msg", ctx);
        expect(err).toBeInstanceOf(Class);
      });

      it(`is not an instance of sibling class ${sibling.name}`, () => {
        const err = new Class(code, "msg", ctx);
        expect(err).not.toBeInstanceOf(sibling);
      });
    });
  }
});
