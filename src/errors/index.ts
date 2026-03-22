export { ErrorCode } from "./codes.ts";
export type { ErrorContext } from "./context.ts";
export { SqunError } from "./base.ts";
export {
  ConnectionError,
  QueryError,
  MappingError,
  ValidationError,
  TransactionError,
  TimeoutError,
  AdapterError,
  ReadonlyViolationError,
  SecurityError,
  SqunConfigError,
  AuthError,
} from "./types.ts";
export { wrapError } from "./wrap.ts";
