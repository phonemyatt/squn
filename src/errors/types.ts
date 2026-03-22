import { SqunError } from "./base.ts";

export class ConnectionError extends SqunError {}
export class QueryError extends SqunError {}
export class MappingError extends SqunError {}
export class ValidationError extends SqunError {}
export class TransactionError extends SqunError {}
export class TimeoutError extends SqunError {}
export class AdapterError extends SqunError {}
export class ReadonlyViolationError extends SqunError {}
export class SecurityError extends SqunError {}
export class SqunConfigError extends SqunError {}
export class AuthError extends SqunError {}
