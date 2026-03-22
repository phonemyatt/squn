export { SqunError } from "./base.ts";
export { ErrorCode } from "./codes.ts";
export type { ErrorContext } from "./context.ts";
export {
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
} from "./types.ts";
export { wrapError } from "./wrap.ts";
