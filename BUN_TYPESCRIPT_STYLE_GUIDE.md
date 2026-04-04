# Bun TypeScript — Coding Style, Conventions, and Framework

**Edition:** 1.1.1  
**Runtime:** Bun ≥ 1.2  
**Language:** TypeScript ≥ 5.9 (strict mode, always)  
**Status:** Canonical — all projects under this guide must conform

---

## Table of contents

1. [Philosophy](#1-philosophy)
2. [SOLID principles applied to TypeScript](#2-solid-principles-applied-to-typescript)
3. [Naming conventions](#3-naming-conventions)
4. [File and folder structure](#4-file-and-folder-structure)
5. [Compiler configuration](#5-compiler-configuration)
6. [Type system patterns](#6-type-system-patterns)
7. [Async patterns](#7-async-patterns)
8. [Error handling strategy](#8-error-handling-strategy)
9. [Module design](#9-module-design)
10. [Testing conventions](#10-testing-conventions)
11. [Bun-specific patterns](#11-bun-specific-patterns)
12. [Security rules](#12-security-rules)
13. [Performance rules](#13-performance-rules)
14. [Documentation conventions](#14-documentation-conventions)
15. [Project templates](#15-project-templates)
16. [Tooling and configuration](#16-tooling-and-configuration)
17. [Git conventions](#17-git-conventions)
18. [Anti-patterns and forbidden patterns](#18-anti-patterns-and-forbidden-patterns)

---

## 1. Philosophy

Every decision in this guide flows from four beliefs about what good code is. Understanding these beliefs makes the rules easier to remember, because the rules stop feeling arbitrary and start feeling inevitable.

**Code is read far more than it is written.** The primary audience for any line of code is the next developer who reads it — including the author six months later. Optimise for readability first, cleverness never. A slightly longer but self-explanatory function is always preferred over a compact one that requires a comment to explain it. If you need a comment to explain what the code does, the code should be rewritten. Comments explain why, not what.

**Explicit is better than implicit.** Types, error handling, and control flow should be visible on the page. Hidden magic — through decorators that silently mutate behaviour at a distance, global singletons with unclear ownership, or `any` types that hide the shape of data — makes code dangerous to change. Every important decision should be traceable from the call site to its implementation without IDE assistance.

The warning about decorators applies specifically to the legacy `experimentalDecorators` pattern where a decorator can silently intercept property access, wrap methods, or inject dependencies without any visible evidence at the call site. TC39 stage 3 decorators (supported natively in TypeScript 5.0+ with `target: "ESNext"`, no additional flags needed) are more constrained and explicit — they are permitted in this codebase for well-defined, auditable registration patterns such as `@Entity(schema)` for class-to-table mapping. Even then, every project that uses decorators must also provide an explicit non-decorator alternative so decorators are opt-in, not required.

**Boundaries are everything.** The most important architectural decisions are about what modules are allowed to know about each other. A well-drawn boundary means that changing one module does not ripple unpredictably through the system. Every module in this guide has one clearly stated responsibility, one clearly stated set of dependencies, and no hidden dependencies.

**Errors are first-class citizens.** An unhandled error is not a missing feature — it is a lie. Every function that can fail must make that failure visible in its return type or throw a typed error. Error paths are tested with the same rigour as success paths. Logging an error without rethrowing it is forbidden unless the decision to swallow the error is explicit and documented.

---

## 2. SOLID principles applied to TypeScript

SOLID is often taught in Java with class diagrams and abstract factories. In TypeScript, the same principles apply but the idiomatic expression is different — favouring interfaces, function composition, and module boundaries over deep class hierarchies.

### 2.1 Single responsibility principle

A module, class, or function should have exactly one reason to change. In practice this means: if you can describe what a function does using the word "and", it should be split.

```typescript
// WRONG — two responsibilities in one function
// Reason to change: (1) how we fetch users, (2) how we format them
async function fetchAndFormatUsers(): Promise<string[]> {
  const rows = await db.query<User>(sql`SELECT * FROM users`);
  return rows.map((u) => `${u.name} <${u.email}>`);
}

// RIGHT — one responsibility each
async function fetchUsers(): Promise<User[]> {
  return db.query<User>(sql`SELECT * FROM users`);
}

function formatUser(user: User): string {
  return `${user.name} <${user.email}>`;
}

// Composition at the call site is explicit and testable
const labels = (await fetchUsers()).map(formatUser);
```

The same principle applied to modules: a module named `user-utils.ts` is a code smell. Utils is not a responsibility. Name modules after what they do: `user-formatter.ts`, `user-repository.ts`, `user-validator.ts`.

### 2.2 Open/closed principle

A module should be open for extension but closed for modification. In TypeScript, this is most naturally expressed through interfaces and the strategy pattern, not through inheritance.

```typescript
// WRONG — adding a new adapter requires modifying this function
function buildConnectionString(adapter: string, config: Config): string {
  if (adapter === "postgres") return `postgresql://${config.host}`;
  if (adapter === "mysql") return `mysql://${config.host}`;
  // Adding MSSQL means editing this function → violates OCP
}

// RIGHT — each adapter is responsible for its own connection string
// Adding a new adapter = adding a new file, not editing existing ones
interface IDbAdapter {
  buildConnectionString(config: Config): string;
}

class PostgresAdapter implements IDbAdapter {
  buildConnectionString(config: Config): string {
    return `postgresql://${config.host}`;
  }
}

class MssqlAdapter implements IDbAdapter {
  buildConnectionString(config: Config): string {
    return `mssql://${config.host}`;
  }
}
```

### 2.3 Liskov substitution principle

Any place that accepts an interface must work correctly with any implementation of that interface — no `if (instance instanceof ConcreteClass)` checks. TypeScript's structural typing makes this principle especially important: just because a type compiles does not mean it is substitutable. Write tests against the interface, not against a specific implementation.

```typescript
// WRONG — tests against a specific class break LSP
function processAdapter(adapter: PostgresAdapter) {
  // Only works for PostgreSQL — MySQLAdapter would fail here
  adapter.copyBulk(rows); // method that only PostgresAdapter has
}

// RIGHT — accept the interface, work with any conforming implementation
function processAdapter(adapter: IDbAdapter) {
  // Works for any adapter — the interface defines the contract
  await adapter.executeBatch(sql, rows);
}
```

### 2.4 Interface segregation principle

Prefer many small, focused interfaces over one large general-purpose interface. A consumer should never be forced to depend on methods it does not use.

```typescript
// WRONG — one large interface forces all implementors to provide everything
interface IDbAdapter {
  query(sql: string): Promise<Row[]>;
  execute(sql: string): Promise<void>;
  copyBulk(rows: Row[]): Promise<void>;     // only PostgreSQL supports this
  callStoredProc(name: string): Promise<Row[]>; // only MSSQL supports this
  beginTransaction(): Promise<IDbTransaction>;
}

// RIGHT — split by capability, compose as needed
interface IQueryable {
  query(sql: string, params: unknown[]): Promise<Row[]>;
}

interface IExecutable {
  execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }>;
}

interface ITransactional {
  beginTransaction(): Promise<IDbTransaction>;
}

interface IBulkCopyable {
  copyBulk(rows: Row[], table: string): Promise<void>;
}

// Adapters implement what they support
class PostgresAdapter implements IQueryable, IExecutable, ITransactional, IBulkCopyable { ... }
class SqliteAdapter  implements IQueryable, IExecutable, ITransactional { ... }

// Consumers only depend on what they use
function runQuery(adapter: IQueryable, sql: string) { ... }
function runBulk(adapter: IBulkCopyable, rows: Row[]) { ... }
```

### 2.5 Dependency inversion principle

High-level modules should not depend on low-level modules. Both should depend on abstractions. In Bun/TypeScript, this means high-level business logic receives its dependencies as constructor arguments or function parameters — never importing and instantiating them directly.

```typescript
// WRONG — high-level code directly depends on a concrete low-level module
import { PostgresAdapter } from "./adapters/postgres"; // hard dependency

class UserRepository {
  private adapter = new PostgresAdapter(config); // cannot be tested or swapped

  async findById(id: number): Promise<User> {
    return this.adapter.querySingle(sql`SELECT * FROM users WHERE id = ${id}`);
  }
}

// RIGHT — depends on abstraction, receives implementation from outside
class UserRepository {
  constructor(private readonly db: IQueryable) {}

  async findById(id: number): Promise<User> {
    return this.db.querySingle<User>(sql`SELECT * FROM users WHERE id = ${id}`);
  }
}

// The concrete implementation is provided at the composition root
const repo = new UserRepository(new PostgresAdapter(config));

// In tests, a mock is provided instead — UserRepository never changes
const repo = new UserRepository(new MockAdapter().willReturn([testUser]));
```

---

## 3. Naming conventions

Naming is not cosmetic. A well-named identifier makes the code read like a description of intent rather than a description of mechanics. Every naming rule below has a reason behind it.

### 3.1 Casing rules

TypeScript files use `kebab-case` for filenames. Everything inside a file follows these rules without exception:

```
PascalCase     → classes, interfaces, type aliases, enums, decorators, React components
camelCase      → variables, function parameters, object keys, method names, module-level constants
SCREAMING_SNAKE_CASE → true constants — values that never change and are used across modules
kebab-case     → file names, directory names, npm package names, CSS class names
```

```typescript
// Filename: user-repository.ts

// PascalCase — class, interface, type alias, enum
class UserRepository { ... }
interface IUserRepository { ... }
type UserInsert = InferInsert<typeof Users>;
enum ConnectionState { IDLE = "IDLE", ACQUIRED = "ACQUIRED" }

// camelCase — variable, function, method, param
const userRepository = new UserRepository(db);
async function findUserById(id: number): Promise<User> { ... }

// SCREAMING_SNAKE_CASE — true constants that never change
const MAX_POOL_SIZE = 100;
const DEFAULT_QUERY_TIMEOUT_MS = 30_000;
export const SQUN_ENV_VARS = { PG_URL: "SQUN_PG_URL" } as const;
```

### 3.2 Interface naming

Interfaces that define a contract for a dependency (i.e. something that will be injected and mocked in tests) are prefixed with `I`. Interfaces that describe data shapes are not.

```typescript
// I-prefix — this is a dependency contract, will be injected + mocked
interface IDbAdapter { ... }
interface ILogger { ... }
interface IConnectionPool { ... }

// No prefix — this is a data shape, not a dependency
interface User { id: number; name: string; }
interface ConnectionConfig { host: string; port: number; }
interface LogEntry { level: string; message: string; }
```

### 3.3 Function naming

Function names must include a verb that describes what the function does. Functions returning booleans start with `is`, `has`, `can`, or `should`. Functions that throw on failure end with no qualifier. Functions that return a nullable result use `find` or `try` prefix.

```typescript
// Action verbs
function buildConnectionString(): string { ... }
function validateConfig(config: Config): void { ... }    // throws on invalid
function resolveTimeout(...): number | null { ... }
function compileMapper<T>(schema: TableSchema): RowMapper<T> { ... }

// Boolean predicates
function isLocalhost(host: string): boolean { ... }
function hasIdleConnections(): boolean { ... }
function canRetry(err: SqunError): boolean { ... }
function shouldRecycle(conn: PooledConnection): boolean { ... }

// Nullable returns — "find" implies may return null
function findIdleConnection(): PooledConnection | null { ... }

// Throwing variants — no qualifier, throws on not-found
function getRequiredEnvVar(name: string): string { ... }   // throws if missing
```

### 3.4 Variable naming

Variables should communicate what they contain, not their type. Avoid type suffixes like `userArray`, `configObject`, or `resultData`. A variable named `users` is obviously an array. A variable named `config` is obviously an object.

```typescript
// WRONG — type information in the name
const userArray = await db.query<User>(sql`SELECT * FROM users`);
const configObject = resolveConfig(env);
const resultData = await runQuery(adapter, sql);

// RIGHT — descriptive name, type is in the type annotation
const users = await db.query<User>(sql`SELECT * FROM users`);
const config = resolveConfig(env);
const result = await runQuery(adapter, sql);
```

Loop variables follow the same rule — avoid `i`, `j`, `k` except in tight numeric loops where the index is the only relevant thing. When iterating over domain objects, use a meaningful name.

```typescript
// WRONG — i tells us nothing about what we're iterating
for (let i = 0; i < users.length; i++) {
  console.log(users[i].name);
}

// RIGHT — meaningful name
for (const user of users) {
  console.log(user.name);
}

// Acceptable — pure index arithmetic where i is the value
for (let i = 0; i < buffer.length; i++) {
  buffer[i] = 0;
}
```

### 3.5 Type naming

Generic type parameters are named with meaningful single words, not single letters. The only exception is well-established conventions like `T` in utility types from the TypeScript standard library.

```typescript
// WRONG — T, K, V tell us nothing about intent
function mapRows<T, K>(rows: T[], key: (row: T) => K): Map<K, T> { ... }

// RIGHT — names convey the relationship between generics
function mapRows<Row, Key>(rows: Row[], key: (row: Row) => Key): Map<Key, Row> { ... }

// Acceptable — single letters in pure utility types (following TS conventions)
type Nullable<Value> = Value | null;
type Optional<Value> = Value | undefined;
type Awaited<Value> = Value extends Promise<infer Inner> ? Inner : Value;
```

---

## 4. File and folder structure

Every project under this guide uses the same top-level structure. Consistency means that anyone familiar with one project can immediately navigate any other.

### 4.1 Top-level layout

```
project-root/
├── src/               # All source code — nothing else lives here
├── tests/             # All tests — mirrors src/ structure
├── scripts/           # Build scripts, codegen, utilities — not imported by src/
├── .env.example       # Documented template — every env var with a comment
├── biome.json         # Linter + formatter config (replaces ESLint + Prettier)
├── bunfig.toml        # Bun runtime configuration
├── package.json
├── tsconfig.json
└── README.md
```

### 4.2 `src/` layout rules

The `src/` directory is divided into layers. Lower layers never import from higher layers. This is not enforced by tooling but is enforced by code review.

```
src/
├── index.ts           # Public exports only — the library's surface area
├── types/             # Pure TypeScript — no runtime code. Zero imports from other layers.
├── errors/            # Error classes and codes — imported by every other layer
├── config/            # Configuration resolution — imports types + errors only
├── core/              # Business logic — imports types, errors, config
├── adapters/          # Database drivers — imports core, types, errors
├── api/               # Public-facing entry points — imports everything below
└── lib/               # Shared pure functions — no domain knowledge, no imports from other layers
```

> **Note on naming.** This guide flags `user-utils.ts` as a code smell in §2 because "utils" is not a responsibility. The `lib/` directory is the equivalent at the folder level — it exists by exception, for truly domain-free helper functions (string manipulation, number formatting, date arithmetic), and the exception only holds as long as nothing inside it imports from `core/` or `errors/`. If a function in `lib/` needs domain knowledge, it does not belong here — give it a properly named home in the layer that owns its domain.

### 4.3 File naming rules

Every file has exactly one primary export that matches the filename. A file named `query-runner.ts` exports one thing: `QueryRunner` or `runQuery`. Secondary exports are acceptable for closely related types that only make sense alongside the primary export.

```
query-runner.ts       → exports runQuery() as primary, QueryRunnerOptions as secondary
connection-pool.ts    → exports ConnectionPool as primary, PoolStats as secondary
user-repository.ts    → exports UserRepository as primary

// WRONG — one file, many unrelated things
utils.ts              → exports formatDate, validateEmail, hashPassword, generateId...
```

Every `index.ts` is a re-export barrel only. It contains no logic — only `export { ... } from "..."` statements. If logic is creeping into an `index.ts`, it needs its own file.

---

## 5. Compiler configuration

### 5.1 `tsconfig.json` — canonical configuration

Every project under this guide starts from this `tsconfig.json`. Settings are never relaxed — only additional `lib` or `paths` entries are added per project.

```json
// tsconfig.json — used for type-checking only (tsc --noEmit in CI)
// bun build handles actual compilation; see tsconfig.build.json for emit settings
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "rootDir": "./src",

    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true,

    "allowImportingTsExtensions": true,
    "noEmit": true,

    "isolatedModules": true,
    "verbatimModuleSyntax": true,

    "skipLibCheck": false
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist", "scripts"]
}
```

For library projects that publish type declarations, a separate `tsconfig.build.json` overrides the base config to emit output. `bun build` handles transpilation; `tsc -p tsconfig.build.json` emits the `.d.ts` and `.d.ts.map` files only.

```json
// tsconfig.build.json — extends base, adds emit settings for publishing
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "scripts", "tests"]
}
```

The most important settings and why they are non-negotiable:

`strict: true` enables all strict checks as a group. It is never disabled. Individual strict checks are never turned off in `// @ts-ignore` comments either.

`noUncheckedIndexedAccess: true` means `array[0]` has type `T | undefined` rather than `T`. This prevents the most common runtime crash pattern in TypeScript. Code that accesses array indices must handle the `undefined` case.

`exactOptionalPropertyTypes: true` means `{ value?: string }` does not accept `{ value: undefined }`. These are different things and should be treated differently.

`verbatimModuleSyntax: true` requires explicit `import type` for type-only imports. This makes it clear at a glance which imports are erased at compile time and which remain as runtime dependencies.

**TC39 stage 3 decorators** (`@Entity`, `@Readonly`, etc.) work with this tsconfig as-is — `target: "ESNext"` enables them natively in TypeScript 5.0+. No `experimentalDecorators` flag is needed or permitted. The legacy `experimentalDecorators` flag is explicitly banned — it enables a different, less constrained decorator system that violates the explicitness principle.

TC39 stage 3 decorators do **not** use `reflect-metadata`. `reflect-metadata` is a companion library for the legacy `experimentalDecorators` system and must not be added to projects under this guide.

---

## 6. Type system patterns

### 6.1 Type annotation rules

Types are always explicit on function signatures — return types are never inferred for exported functions. Types on local variables are inferred unless the inferred type is less precise than intended.

```typescript
// WRONG — return type inferred, implicit any risk
export async function findUser(id: number) {
  return db.querySingle(sql`SELECT * FROM users WHERE id = ${id}`);
}

// RIGHT — return type explicit on exported functions
export async function findUser(id: number): Promise<User | null> {
  return db.queryFirst<User>(sql`SELECT * FROM users WHERE id = ${id}`);
}

// Acceptable — local variable type inferred when type is obvious
const users = await db.query<User>(sql`SELECT * FROM users`); // User[]

// Required — explicit when inference would be too broad
const state: ConnectionState = ConnectionState.IDLE; // not just "string"
```

### 6.2 `type` vs `interface`

Use `interface` for object shapes that represent domain entities or dependency contracts. Use `type` for unions, intersections, mapped types, and type aliases that transform other types.

```typescript
// interface — domain entities and contracts
interface User { id: number; name: string; email: string; }
interface IDbAdapter { query(...): Promise<Row[]>; }
interface ConnectionConfig { host: string; port: number; }

// type — unions, intersections, mapped types, aliases
type AuthConfig = UserPasswordAuth | WindowsAuth | AzureAdAuth;
type Environment = "development" | "production" | "test";
type ReadonlyUser = Readonly<User>;
type UserInsert = Omit<User, "id" | "createdAt">;
```

### 6.3 Avoid `any` and `unknown` escape hatches

`any` is banned. No exceptions. `unknown` is the correct type for values of truly unknown shape — it forces explicit type narrowing before use. `as` casts are permitted only at module boundaries (e.g. when deserialising from a database driver that returns `unknown`) and must be accompanied by a runtime check.

```typescript
// WRONG — silences the type checker
const result = JSON.parse(response) as User;

// RIGHT — assert with runtime validation
const raw: unknown = JSON.parse(response);
if (!isUser(raw)) throw new MappingError("Expected User shape");
const result: User = raw;

// Type guard — validates at runtime, narrows at compile time
function isUser(value: unknown): value is User {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as Record<string, unknown>).id === "number" &&
    "name" in value &&
    typeof (value as Record<string, unknown>).name === "string" &&
    "email" in value &&
    typeof (value as Record<string, unknown>).email === "string"
  );
}
```

### 6.4 Discriminated unions for state

Discriminated unions are preferred over nullable fields and optional properties for modelling state that has mutually exclusive shapes.

```typescript
// WRONG — nullable fields make every consumer check every field
interface QueryResult {
  rows?: Row[];
  rowsAffected?: number;
  error?: Error;
}

// RIGHT — discriminated union, each variant is fully typed
type QueryResult =
  | { status: "success"; rows: Row[] }
  | { status: "mutated"; rowsAffected: number }
  | { status: "error"; error: SqunError };

// assertNever — place in src/lib/assert-never.ts and import wherever needed.
// Never and never are both intentional: the parameter type forces TypeScript to
// prove the switch is exhaustive at compile time. If a new variant is added to
// QueryResult and this switch is not updated, tsc reports an error here.
function assertNever(value: never): never {
  throw new Error(
    `Unhandled discriminated union case: ${JSON.stringify(value)}`,
  );
}

// TypeScript exhaustively narrows — tsc enforces that every case is handled
function handleResult(result: QueryResult): Row[] | number {
  switch (result.status) {
    case "success":
      return result.rows; // rows: Row[]
    case "mutated":
      return result.rowsAffected; // rowsAffected: number
    case "error":
      throw result.error; // error: SqunError
    default:
      return assertNever(result); // compile error if a case is missing
  }
}
```

---

## 7. Async patterns

Every function that performs I/O returns a `Promise`. There are no synchronous wrappers, no callback-style APIs, and no EventEmitter patterns for operations that have a single response. The async/await syntax is used exclusively — `.then()` chains are only used when chaining is the clearest way to express a transformation pipeline.

### 7.1 Async function rules

Every `async` function has an explicit `Promise<T>` return type. Floating promises (promises that are not awaited and not assigned to a variable) are forbidden — they silently swallow errors.

```typescript
// WRONG — floating promise swallows errors silently
function startServer(): void {
  Bun.serve({ fetch: handler }); // this returns a promise — it is floating
}

// WRONG — .then() with no error handler
loadConfig().then((config) => startApp(config));

// RIGHT — await, or explicitly handle the promise
async function startServer(): Promise<void> {
  const server = await Bun.serve({ fetch: handler });
  logger.info({ message: `Server started on port ${server.port}` });
}

// RIGHT — if a floating promise is intentional, attach an error handler
backgroundReaper
  .start()
  .catch((err) => logger.fatal({ message: "Background reaper failed", err }));
// The void keyword alone only discards the return value — it does not handle
// a rejection. An unhandled rejection from a fire-and-forget is still a
// swallowed error, which this guide forbids. Always attach .catch().
```

### 7.2 Concurrency patterns

`Promise.all` is used when multiple independent operations can run concurrently. `Promise.allSettled` is used when all results are needed regardless of partial failure. `Promise.any` is used for first-to-succeed patterns where only one result is needed and the others can be abandoned. `Promise.race` is used only for timeout patterns — never for first-to-succeed logic, because it rejects on the first rejection and does not give the other promises a chance to succeed.

```typescript
// Concurrent independent operations — Promise.all
const [users, roles, settings] = await Promise.all([
  db.query<User>(sql`SELECT * FROM users`),
  db.query<Role>(sql`SELECT * FROM roles`),
  db.query<Setting>(sql`SELECT * FROM settings`),
]);

// Collect all results even if some fail — Promise.allSettled
const results = await Promise.allSettled(
  items.map((item) => processItem(item)),
);
const succeeded = results.filter((r) => r.status === "fulfilled");
const failed = results.filter((r) => r.status === "rejected");

// First replica to respond wins — Promise.any
// Safe here because read replicas have no side effects; the others are abandoned.
const row = await Promise.any([
  replicaA.query<User>(sql`SELECT * FROM users WHERE id = ${id}`),
  replicaB.query<User>(sql`SELECT * FROM users WHERE id = ${id}`),
]);
// Promise.any rejects with AggregateError only when ALL promises reject —
// one success is enough. Use Promise.race only for timeout patterns (see below),
// not for first-success logic: race() rejects on the first rejection, which is
// almost never what you want when racing real operations.

// Timeout pattern using AbortController — preferred over Promise.race
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  return await doWork(controller.signal);
} finally {
  clearTimeout(timer);
}
```

### 7.3 Async generators for streaming

Large data sets are always streamed via async generators. Never load an unbounded result set into memory.

```typescript
// RIGHT — bounded memory regardless of result set size
async function* streamUsers(db: IQueryable): AsyncIterableIterator<User> {
  const cursor = await db.openCursor<User>(sql`SELECT * FROM users`);
  try {
    let batch = await cursor.fetch(100);
    while (batch.length > 0) {
      for (const user of batch) yield user;
      batch = await cursor.fetch(100);
    }
  } finally {
    await cursor.close(); // always runs — even if consumer breaks early
  }
}

// Consumer
for await (const user of streamUsers(db)) {
  await sendWelcomeEmail(user);
}
```

---

## 8. Error handling strategy

### 8.1 Typed error hierarchy

Every project defines its own error hierarchy. Errors are never plain `Error` objects — they always carry a typed `code`, structured `context`, and an auto-generated `traceId`.

```typescript
// src/errors/base.ts

export abstract class BaseError extends Error {
  readonly traceId: string;
  readonly timestamp: Date;

  constructor(
    readonly code: string,
    readonly context: Record<string, unknown>,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    this.traceId = generateTraceId();
    this.timestamp = new Date();

    // Maintains correct prototype chain in transpiled code
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      traceId: this.traceId,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
    };
  }
}
```

### 8.2 The three error rules

**Rule 1: Never swallow errors silently.** If you catch an error and do not rethrow it, you must log it. If you log it and do not rethrow, the decision must be documented with a comment explaining why the error is safe to suppress.

**Rule 2: Always wrap third-party errors.** Database drivers, HTTP clients, and file system errors are caught at the boundary and re-thrown as domain errors. The raw error is attached as `cause` so it is not lost, but it never propagates beyond the adapter layer.

**Rule 3: Fail at the boundary of uncertainty.** If a function receives an argument it cannot handle, it throws immediately rather than trying to recover. Defensive programming that silently returns defaults hides bugs.

```typescript
// WRONG — swallowing an error
try {
  await db.execute(sql`UPDATE users SET active = false WHERE id = ${id}`);
} catch {
  // nothing — the error disappears
}

// WRONG — returning a default instead of failing
function getPort(config: Config): number {
  return config.port ?? 5432; // silent fallback hides missing config
}

// RIGHT — fail explicitly, let the caller decide
function getPort(config: Config): number {
  if (config.port === undefined) {
    throw new ConfigError(
      "PORT_MISSING",
      {},
      "config.port is required but was not provided",
    );
  }
  return config.port;
}

// RIGHT — wrapping a third-party error
try {
  await pgClient.query(sql, params);
} catch (raw) {
  throw new AdapterError(
    "QUERY_FAILED",
    { sql: sanitize(sql), adapter: "postgres" },
    "PostgreSQL query failed",
    raw, // original error attached as cause
  );
}
```

### 8.3 Result type for expected failures

For operations where failure is a normal, expected outcome (not an exceptional condition), a `Result<T, E>` type is preferred over throwing. This makes the success/failure nature of the operation visible at the call site.

```typescript
// src/types/result.ts
export type Result<Value, Err = BaseError> =
  | { ok: true; value: Value }
  | { ok: false; error: Err };

export function ok<Value>(value: Value): Result<Value, never> {
  return { ok: true, value };
}

export function err<Err>(error: Err): Result<never, Err> {
  return { ok: false, error };
}

// Usage — the return type makes the contract explicit
async function validateConnection(
  config: ConnectionConfig,
): Promise<Result<void, ConfigError>> {
  if (!config.host)
    return err(new ConfigError("HOST_MISSING", {}, "host is required"));
  if (!config.port)
    return err(new ConfigError("PORT_MISSING", {}, "port is required"));
  return ok(undefined);
}

// Call site — forced to handle both cases.
// In library/business-logic code, propagate the error by throwing.
// Only the composition root (main.ts) may call process.exit().
const result = await validateConnection(config);
if (!result.ok) {
  throw result.error; // propagates to the entry point — never call process.exit() here
}

// In main.ts (the composition root), catching and exiting is acceptable:
// const result = await validateConnection(config);
// if (!result.ok) {
//   logger.error(result.error.toJSON());
//   process.exit(1);
// }
```

---

## 9. Module design

### 9.1 One module, one contract

Every module exports exactly one primary thing. The module's `index.ts` defines its public surface. Anything not re-exported from `index.ts` is private to the module.

```
src/connection-pool/
├── index.ts            ← public: exports ConnectionPool, PoolConfig, PoolStats
├── pool.ts             ← private: ConnectionPool implementation
├── connection.ts       ← private: PooledConnection + state machine
├── reaper.ts           ← private: background idle connection cleanup
├── health.ts           ← private: ping + health check logic
└── stats.ts            ← private: rolling average calculations
```

Consumers import from `connection-pool/`, never from `connection-pool/pool.ts` directly. This means internal refactoring never breaks consumers.

### 9.2 Dependency injection at the module boundary

Every module that has external dependencies (database, logger, config) receives them as constructor arguments or function parameters. Modules never import and instantiate their dependencies directly. This is the practical expression of the dependency inversion principle.

```typescript
// WRONG — hidden dependency, impossible to test in isolation
import { logger } from "../logging/json-logger";
import { config } from "../config/resolve";

export class UserRepository {
  async findById(id: number): Promise<User | null> {
    logger.debug({ message: `Finding user ${id}` }); // hard dependency
    return db.queryFirst<User>(sql`SELECT * FROM users WHERE id = ${id}`);
  }
}

// RIGHT — dependencies are explicit, injected from outside
export class UserRepository {
  constructor(
    private readonly db: IQueryable,
    private readonly logger: ILogger,
  ) {}

  async findById(id: number): Promise<User | null> {
    this.logger.debug({ message: `Finding user ${id}` });
    return this.db.queryFirst<User>(sql`SELECT * FROM users WHERE id = ${id}`);
  }
}
```

### 9.3 Composition root

The composition root is the single place in the application where all dependencies are wired together. It is always in the entry point (`src/index.ts` or `src/main.ts`) and never inside business logic modules.

```typescript
// src/main.ts — the composition root

import { createDb } from "./db";
import { PostgresAdapter } from "./adapters/postgres";
import { jsonLogger } from "./logging/json-logger";
import { resolveConfig } from "./config/resolve";
import { UserRepository } from "./repositories/user-repository";
import { OrderService } from "./services/order-service";

// Wire everything together in one place
const config = resolveConfig(process.env);
const db = createDb(new PostgresAdapter(config.db), { logger: jsonLogger });
const userRepo = new UserRepository(db, jsonLogger);
const orderSvc = new OrderService(db, userRepo, jsonLogger);

// Start the application
await orderSvc.start();
```

---

## 10. Testing conventions

### 10.1 The test file rule

Every source file has a corresponding test file. The test file lives in `tests/unit/` at the same relative path as the source file. A source file at `src/core/param-builder.ts` has a test at `tests/unit/core/param-builder.test.ts`.

### 10.2 `describe` and `it` structure

`describe` blocks name the module and function under test. `it` blocks name the exact condition and expected outcome. The full path of `describe` + `it` labels forms a specification sentence.

```typescript
// tests/unit/core/param-builder.test.ts

import { describe, it, expect } from "bun:test";
import { buildParams } from "../../src/core/param-builder";
import { ValidationError } from "../../src/errors/types";
import { ErrorCode } from "../../src/errors/codes";

describe("core/param-builder — buildParams()", () => {
  describe("when translating named params for the PostgreSQL adapter", () => {
    it("replaces @id with $1 and places the value as the first element of the params array", () => {
      const { text, params } = buildParams(
        "SELECT * FROM users WHERE id = @id",
        { id: 42 },
        "postgres",
      );

      expect(text).toBe("SELECT * FROM users WHERE id = $1");
      expect(params).toEqual([42]);
    });

    it("assigns the same $N index to a param name that appears twice in the query", () => {
      const { text, params } = buildParams(
        "SELECT * FROM users WHERE id = @id OR manager_id = @id",
        { id: 5 },
        "postgres",
      );

      expect(text).toBe("SELECT * FROM users WHERE id = $1 OR manager_id = $1");
      expect(params).toEqual([5]);
    });
  });

  describe("when a named param in the query has no matching key in the params object", () => {
    it("throws a ValidationError with code PARAM_MISSING and names the missing param in context", () => {
      expect(() =>
        buildParams("SELECT * FROM users WHERE id = @id", {}, "postgres"),
      ).toThrow(
        expect.objectContaining({
          code: ErrorCode.PARAM_MISSING,
          context: expect.objectContaining({ missingParam: "@id" }),
        }),
      );
    });
  });
});
```

### 10.3 Assertion completeness

Every assertion must be as specific as the behaviour being tested. No `toBeTruthy()` for values that can be checked precisely. No `toThrow()` without specifying the error type and code.

```typescript
// WRONG — too vague, will pass even if the wrong error is thrown
expect(() => doThing()).toThrow();

// WRONG — only checks one field
expect(result.text).toContain("$1");

// RIGHT — error is fully specified
expect(() => doThing()).toThrow(
  expect.objectContaining({
    constructor: ValidationError,
    code: ErrorCode.PARAM_MISSING,
    context: expect.objectContaining({ missingParam: "@userId" }),
  }),
);

// RIGHT — full output is asserted
expect(result).toEqual({
  text: "SELECT * FROM users WHERE id = $1",
  params: [42],
});
```

### 10.4 Test isolation

Every test creates all the state it needs and cleans up after itself. `beforeAll` and `afterAll` hooks are used only for expensive one-time setup (e.g. spinning up an in-memory SQLite database). Shared mutable state between tests is forbidden.

```typescript
// WRONG — shared mutable adapter pollutes tests
const adapter = new MockAdapter();

it("queries users", async () => {
  adapter.willReturn([testUser]); // mutates shared state
  const users = await repo.findAll();
  expect(users).toHaveLength(1);
});

it("finds a user by id", async () => {
  // adapter may still have state from the previous test
  adapter.willReturn([testUser]);
  const user = await repo.findById(1);
  expect(user?.id).toBe(1);
});

// RIGHT — fresh adapter per test
it("queries users", async () => {
  const adapter = new MockAdapter().willReturn([testUser]); // fresh, local
  const repo = new UserRepository(adapter);
  const users = await repo.findAll();
  expect(users).toHaveLength(1);
});
```

---

## 11. Bun-specific patterns

### 11.1 Always use `bun:*` native modules first

Before reaching for an npm package, check if Bun provides a native equivalent. Bun's native APIs are always faster and have zero installation overhead.

```typescript
// File I/O
const file = Bun.file("./data.json");
const content = await file.text();
const json = await file.json();
await Bun.write("./output.json", JSON.stringify(data, null, 2));

// Hashing — for cache keys, ETags, deduplication
const key = Bun.hash(sqlText).toString(36); // much faster than crypto.createHash

// Sleeping in tests and retry loops — cleaner than setTimeout
await Bun.sleep(retryDelay); // returns a Promise, awaitable

// SQLite — always bun:sqlite, never better-sqlite3
import { Database } from "bun:sqlite";
const db = new Database(":memory:");
const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
const result = stmt.get(1);

// Environment variables — always available, no dotenv needed in Bun
// Bun loads .env, .env.local, .env.{NODE_ENV} automatically
const dbUrl = process.env.DATABASE_URL ?? throwMissing("DATABASE_URL");

// Test runner — always bun:test, never jest
import { describe, it, expect, mock, spyOn } from "bun:test";
```

### 11.2 Process lifecycle

Bun exposes clean lifecycle hooks. Use them for graceful shutdown instead of bare `process.on`.

```typescript
// src/main.ts

const server = Bun.serve({ port: 3000, fetch: handler });
const db = createDb(adapter);

// Graceful shutdown — runs on SIGTERM and SIGINT
process.on("SIGTERM", async () => {
  logger.info({ message: "SIGTERM received — shutting down gracefully" });
  server.stop(true); // stop accepting new connections
  await db.pool.drain(); // wait for in-flight queries
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info({ message: "SIGINT received — shutting down" });
  server.stop(true);
  await db.pool.drain();
  process.exit(0);
});
```

### 11.3 Bun shell for scripts

Use `Bun.$` for shell scripting in build scripts and utilities. It is typed, cross-platform, and avoids `child_process`.

```typescript
// scripts/generate-types.ts
import { $ } from "bun";

await $`bunx drizzle-kit generate:pg --out ./src/generated`;
await $`bun run build`;

const { stdout } = await $`git status --porcelain`.quiet();
if (stdout.trim()) {
  console.error(
    "Working tree is dirty — commit generated files before releasing",
  );
  process.exit(1);
}
```

---

## 12. Security rules

### 12.1 No `any` at trust boundaries

Every value entering the application from an external source — HTTP requests, database results, file reads, environment variables — must be validated before use. The type `unknown` is required at the boundary. The validated type is only assigned after the check passes.

```typescript
// src/api/handlers/create-user.ts

export async function handleCreateUser(req: Request): Promise<Response> {
  const body: unknown = await req.json(); // unknown at the boundary

  // Validate before trusting
  if (!isCreateUserBody(body)) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // body is now typed as CreateUserBody — safe to use
  const user = await userService.create(body);
  return Response.json(user, { status: 201 });
}
```

### 12.2 Environment variable access

Environment variables are never accessed with `process.env.X` scattered throughout the codebase. They are accessed in one place — the config module — and exported as typed, validated values.

```typescript
// WRONG — direct process.env access in business logic
async function connectToDatabase() {
  const url = process.env.DATABASE_URL; // undefined risk, type is string | undefined
  await pg.connect(url);
}

// RIGHT — validated in one place, typed everywhere else
// src/config/env.ts
export function loadEnv(): AppEnv {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new ConfigError("ENV_MISSING", {}, "DATABASE_URL is required");
  return { databaseUrl: url };
}

// Business logic receives the validated config object
async function connectToDatabase(config: AppEnv): Promise<void> {
  await pg.connect(config.databaseUrl); // always a string — never undefined
}
```

### 12.3 SQL parameterization

All SQL is written with the `sql` tagged template. Raw string concatenation into SQL is a hard ban — it will not pass code review. The `sqlRaw()` escape hatch exists for dynamic identifiers only and every use must be reviewed.

```typescript
// BANNED — will be rejected in code review
const query = `SELECT * FROM users WHERE name = '${userName}'`;

// BANNED — same risk with template strings
const query = sql`SELECT * FROM users WHERE name = '${userName}'`;
//                                                   ^^ wrong — this is still concatenation

// RIGHT — parameterized
const users = await db.query<User>(sql`
  SELECT * FROM users WHERE name = ${userName}
`);
```

---

## 13. Performance rules

### 13.1 Measure before optimising

No performance optimisation is made without a benchmark proving the problem exists. Premature optimisation introduces complexity and rarely targets the actual bottleneck. Profile first, optimise second.

### 13.2 Pre-allocate hot-path allocations

In code that runs on every request or every row — query parsing, param binding, row mapping — avoid `new Array()`, `{}` literal creation, and `.map()` chains inside the hot path. Pre-allocate at startup.

```typescript
// WRONG — allocates a new array on every query call
function bindParams(sql: string, params: Record<string, unknown>): unknown[] {
  return Object.entries(params).map(([, v]) => v); // new array every time
}

// RIGHT — pre-allocated buffer, filled in-place
class ParamBuffer {
  private readonly buf = new Array<unknown>(64);

  fill(params: Record<string, unknown>, order: string[]): unknown[] {
    for (let i = 0; i < order.length; i++) {
      this.buf[i] = params[order[i]];
    }
    return this.buf;
  }
}
```

### 13.3 Bun.hash for cache keys

Use `Bun.hash()` for all in-process cache key generation. It is significantly faster than `crypto.createHash()` for string hashing and does not require the `crypto` module.

```typescript
// Cache key for compiled query
const cacheKey = Bun.hash(normalizedSql).toString(36);
const cached = queryCache.get(cacheKey);
if (cached) return cached;
```

---

## 14. Documentation conventions

### 14.1 What gets a JSDoc comment

Public-facing functions, classes, and types always get a JSDoc comment. Internal functions get a comment only when the why is not obvious from the code. What a function does should be evident from its name and type signature — the comment explains constraints, edge cases, and non-obvious decisions.

```typescript
/**
 * Resolves the effective timeout for a single database operation by walking the
 * precedence chain: call-site option → transaction budget → operation global → null.
 *
 * The transaction budget acts as a hard ceiling — even if the call-site requests
 * a longer timeout, it is capped to whatever budget the enclosing transaction has
 * remaining. This prevents individual queries from outliving their transaction.
 *
 * Returns null when no timeout constraint applies at any level.
 */
export function resolveTimeout(
  callTimeout:   number | null | undefined,
  txClock:       TransactionClock | undefined,
  globalConfig:  TimeoutConfig,
  operation:     keyof TimeoutConfig,
): number | null { ... }
```

### 14.2 Inline comments

Inline comments explain why, never what. If a comment restates what the code clearly shows, delete it.

```typescript
// WRONG — comment restates the code
const retryDelay = baseDelay * attempt; // multiply base delay by attempt number

// WRONG — comment explains what the code does instead of the code doing it
// Get the remaining connections
const remaining = this.max - this.acquired.size;

// RIGHT — comment explains a non-obvious decision
// We intentionally skip validation in test environments because the config
// is always provided programmatically and the validation error messages are
// designed for developers reading production logs, not test output.
if (env !== "production") return;

// RIGHT — explains a performance decision
// Bun.hash is ~8x faster than MD5 for strings under 4KB.
// We use base-36 encoding to keep the key short for WeakMap lookups.
const cacheKey = Bun.hash(sql).toString(36);
```

---

## 15. Project templates

### 15.1 Template 1 — Library (e.g. Squn itself)

Use for publishable npm packages with no HTTP server. The focus is on a clean public API, strong typing, and high test coverage.

```
my-library/
├── src/
│   ├── index.ts                 # Public exports — the entire surface area
│   ├── types/
│   │   ├── index.ts
│   │   └── core.ts              # Shared types used across modules
│   ├── errors/
│   │   ├── index.ts
│   │   ├── codes.ts             # Error code enum
│   │   ├── base.ts              # BaseError class
│   │   └── types.ts             # Domain-specific error subclasses
│   ├── config/
│   │   ├── index.ts
│   │   ├── defaults.ts          # Sensible defaults per environment
│   │   ├── resolve.ts           # Config resolution + deep merge
│   │   └── validate.ts          # Config validation, production guard
│   └── core/
│       ├── index.ts
│       └── [modules].ts
├── tests/
│   ├── unit/                    # Mirrors src/ — one test file per source file
│   ├── integration/             # Tests against real external dependencies
│   └── fixtures/
│       ├── mock-adapter.ts
│       ├── mock-logger.ts
│       └── builders.ts
├── scripts/
│   └── build.ts                 # Bun build script
├── .env.example
├── biome.json
├── bunfig.toml
├── package.json
└── tsconfig.json
```

**`package.json` template:**

```json
{
  "name": "my-library",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "bun run scripts/build.ts",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:cov": "bun test --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "biome ci src tests",
    "lint:fix": "biome check --write src tests",
    "ci": "bun run typecheck && bun run lint && bun run test:cov"
  },
  "devDependencies": {
    "@biomejs/biome": "2.4.8",
    "typescript": "^5.9.0",
    "bun-types": "latest"
  }
}
```

**`bunfig.toml` template:**

```toml
[test]
timeout     = 5000          # 5s per test — fail fast
coverage    = true
root        = "./tests"
preload     = ["./tests/setup.ts"]

[test.coverageThreshold]
line   = 90
branch = 85

[install]
exact = true                # pin all versions in package.json
```

**`biome.json` template:**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.8/schema.json",
  "assist": {
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "error",
        "useExhaustiveDependencies": "warn"
      },
      "suspicious": {
        "noExplicitAny": "error",
        "noConsole": "warn"
      },
      "style": {
        "useConst": "error",
        "noVar": "error",
        "useTemplate": "error",
        "noNonNullAssertion": "warn"
      },
      "complexity": {
        "noForEach": "warn",
        "useLiteralKeys": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "trailingCommas": "all",
      "semicolons": "always"
    }
  }
}
```

> **Biome v1 → v2 migration notes.** If you are upgrading an existing project: run `npx @biomejs/biome migrate --write` and it will handle configuration changes automatically. Key differences from v1: `organizeImports` moved from its own top-level field into `assist.actions.source.organizeImports`; the `style` rule group no longer emits errors by default unless explicitly configured (the template above sets them back to `"error"`); `noConsoleLog` was renamed `noConsole`; glob patterns for `files.includes` use `**` prefix syntax.

---

### 15.2 Template 2 — HTTP API server

Use for REST or RPC API servers built with Bun.serve. Layers are separated by responsibility — handlers, services, repositories — with dependency injection at the composition root.

```
my-api/
├── src/
│   ├── main.ts                  # Entry point — composition root, server setup
│   ├── router.ts                # Route definitions — maps paths to handlers
│   ├── types/
│   │   └── index.ts             # Shared types: AppEnv, RequestContext, etc.
│   ├── errors/
│   │   ├── base.ts
│   │   ├── codes.ts
│   │   └── http-error.ts        # HttpError with status code
│   ├── config/
│   │   ├── env.ts               # Load + validate environment variables
│   │   └── app-config.ts        # Typed application config
│   ├── middleware/
│   │   ├── auth.ts              # JWT / session verification
│   │   ├── request-id.ts        # Attach traceId to every request
│   │   └── error-handler.ts     # Global error → HTTP response mapping
│   ├── handlers/
│   │   ├── users/
│   │   │   ├── list-users.ts
│   │   │   ├── get-user.ts
│   │   │   └── create-user.ts
│   │   └── orders/
│   │       └── create-order.ts
│   ├── services/
│   │   ├── user-service.ts      # Business logic — no HTTP, no DB
│   │   └── order-service.ts
│   ├── repositories/
│   │   ├── user-repository.ts   # DB queries for users
│   │   └── order-repository.ts
│   └── db/
│       ├── index.ts             # createDb() wiring
│       └── schemas/
│           ├── users.ts         # defineTable(Users, ...)
│           └── orders.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── .env.example
├── biome.json
├── bunfig.toml
├── package.json
└── tsconfig.json
```

**`src/main.ts` template:**

```typescript
import { jsonLogger } from "./logging/json-logger";
import { loadEnv } from "./config/env";
import { createDb } from "./db";
import { PostgresAdapter } from "./db/adapters/postgres";
import { UserRepository } from "./repositories/user-repository";
import { UserService } from "./services/user-service";
import { createRouter } from "./router";
import { requestIdMiddleware } from "./middleware/request-id";
import { errorHandler } from "./middleware/error-handler";

// ── Composition root ────────────────────────────────────────────────────────

const env = loadEnv();
const logger = jsonLogger;
const db = createDb(new PostgresAdapter(env.databaseUrl), { logger });

// Repositories — know about the database
const userRepo = new UserRepository(db, logger);

// Services — know about business logic, not about the database
const userService = new UserService(userRepo, logger);

// Router — knows about HTTP, not about business logic
const router = createRouter({ userService });

// ── Server ─────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: env.port,

  async fetch(req: Request): Promise<Response> {
    const ctx = requestIdMiddleware(req);
    try {
      return await router.handle(req, ctx);
    } catch (err) {
      return errorHandler(err, ctx, logger);
    }
  },
});

logger.info({ message: `Server running on port ${server.port}` });

// ── Graceful shutdown ───────────────────────────────────────────────────────

process.on("SIGTERM", async () => {
  logger.info({ message: "Shutting down gracefully" });
  server.stop(true);
  await db.pool.drain();
  process.exit(0);
});
```

---

### 15.3 Template 3 — CLI tool

Use for command-line scripts, automation tools, and developer utilities.

```
my-cli/
├── src/
│   ├── index.ts             # Entry — parse args, dispatch to command
│   ├── commands/
│   │   ├── generate.ts
│   │   ├── migrate.ts
│   │   └── validate.ts
│   ├── output/
│   │   ├── printer.ts       # Formatted terminal output
│   │   └── spinner.ts       # Progress indicators
│   ├── config/
│   │   └── cli-config.ts    # Parse flags + config file
│   └── errors/
│       └── cli-error.ts     # Exit code + user-facing error message
├── tests/
│   └── unit/
├── biome.json
├── bunfig.toml
└── package.json
```

**`package.json` template (CLI):**

```json
{
  "name": "my-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "my-cli": "./dist/index.js"
  },
  "scripts": {
    "start": "bun run src/index.ts",
    "build": "bun build src/index.ts --outfile dist/index.js --target bun",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "lint": "biome ci src",
    "ci": "bun run typecheck && bun run lint && bun run test"
  }
}
```

**`src/index.ts` template (CLI):**

```typescript
#!/usr/bin/env bun

import { parseArgs } from "util";
import { generate } from "./commands/generate";
import { migrate } from "./commands/migrate";
import { CliError } from "./errors/cli-error";
import { printer } from "./output/printer";

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    help: { type: "boolean", short: "h" },
    verbose: { type: "boolean", short: "v" },
    config: { type: "string", short: "c" },
  },
});

const [command, ...args] = positionals;

if (values.help || !command) {
  printer.usage();
  process.exit(0);
}

try {
  switch (command) {
    case "generate":
      await generate(args, values);
      break;
    case "migrate":
      await migrate(args, values);
      break;
    default:
      throw new CliError(`Unknown command: ${command}`, 1);
  }
} catch (err) {
  if (err instanceof CliError) {
    printer.error(err.message);
    process.exit(err.exitCode);
  }
  printer.error("Unexpected error — run with --verbose for details");
  if (values.verbose) console.error(err);
  process.exit(1);
}
```

---

### 15.4 Template 4 — Background worker / queue processor

Use for long-running background processes, job queues, and scheduled tasks.

```
my-worker/
├── src/
│   ├── main.ts              # Entry — start workers, connect, handle signals
│   ├── workers/
│   │   ├── email-worker.ts
│   │   └── report-worker.ts
│   ├── queue/
│   │   ├── queue.ts         # Queue abstraction (Redis, BullMQ, etc.)
│   │   └── job-types.ts     # Typed job payloads
│   ├── handlers/
│   │   ├── send-email.ts    # Handler for each job type
│   │   └── build-report.ts
│   ├── config/
│   │   └── worker-config.ts
│   └── errors/
│       └── job-error.ts     # Retryable vs non-retryable error classification
├── tests/
│   └── unit/
├── .env.example
├── biome.json
├── bunfig.toml
└── package.json
```

---

## 16. Tooling and configuration

### 16.1 Biome — linter and formatter

Biome replaces both ESLint and Prettier. It is a single tool that lints and formats TypeScript with a Rust-based parser — substantially faster than the JS ecosystem alternatives. The current version in use is **v2.x** (`@biomejs/biome: 2.4.8`).

Every project runs `biome check` in CI and `biome check --write` as a pre-commit hook. The config is defined in `biome.json` at the project root. No per-file `// biome-ignore` comments are permitted except for genuine one-off exceptions that cannot be expressed as a global rule. If a rule is generating false positives, it is disabled globally in `biome.json` with a comment explaining why.

When upgrading Biome between major versions, always run `npx @biomejs/biome migrate --write` first — it rewrites the config file automatically to handle breaking changes.

### 16.2 TypeScript checking

`tsc --noEmit` runs in CI to verify the project compiles with zero errors. `bun build` is used for actual compilation — it does not type-check, it just transpiles. Both must pass in CI.

### 16.3 Scripts

All build and automation scripts are written in TypeScript and run directly with `bun run scripts/name.ts`. No shell scripts, no Makefiles, no Grunt, no Gulp. Bun's `$` shell operator is used for the small number of operations that require spawning subprocesses.

### 16.4 CI pipeline — minimum required steps

Every project must run these steps in CI in this order. All must pass for a merge to be allowed.

```yaml
# .github/workflows/ci.yml (GitHub Actions example)
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: latest }

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Type check
        run: bun run typecheck

      - name: Lint
        run: bun run lint

      - name: Test with coverage
        run: bun run test:cov

      - name: Build
        run: bun run build
```

---

## 17. Git conventions

### 17.1 Commit message format

Every commit message follows the Conventional Commits specification. The type and scope are always lowercase. The subject is sentence case with no trailing period.

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

Valid types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `ci`, `build`, `revert`.

```
feat(param-builder): add IN clause array expansion for PostgreSQL
fix(pool): prevent acquire queue from leaking timers on drain
refactor(transaction): extract savepoint naming into dedicated module
perf(type-mapper): pre-compile row mapper function at schema definition time
test(injection-detector): add coverage for MySQL hex encoding obfuscation
docs(readme): document atomically() vs transaction() decision rule
chore(deps): upgrade bun-types to 1.1.8
```

### 17.2 Branch naming

```
feature/short-description
fix/short-description
refactor/short-description
chore/short-description
```

Feature branches are always branched from `main`. Branches are short-lived — a branch that has been open for more than a week is a red flag that the change is too large and should be split.

### 17.3 Pull request rules

Every pull request has a description that explains what changed and why. "What" can be inferred from the diff — the description must explain the motivation and any non-obvious decisions. Every pull request has at least one reviewer who did not write the code.

---

## 18. Anti-patterns and forbidden patterns

These patterns are banned across all projects under this guide. Code review will reject them without exception.

**`any` type.** There is no valid use of `any` in application code. Use `unknown` at boundaries and narrow with type guards.

**Non-null assertion operator `!` outside test fixtures.** `user!.name` silences a type error that the runtime will expose as a crash. Either check for null or restructure the code so the null cannot occur.

**Barrel files with logic.** `index.ts` files are re-export barrels only. No functions, no classes, no side effects.

**`console.log` in production code.** All output goes through the structured logger. `console.log` is only acceptable in scripts and CLI tools.

**Implicit `any` from untyped third-party packages.** If a package has no types, write a minimal `.d.ts` declaration for the parts you use. Do not let `any` propagate from missing type definitions.

**Mutable shared state between modules.** Module-level mutable variables are forbidden. State is always owned by a class instance or passed explicitly.

**Magic numbers and strings.** Numeric and string literals that have semantic meaning are named constants. `3_600_000` becomes `ONE_HOUR_MS`. `"READ COMMITTED"` becomes `IsolationLevel.READ_COMMITTED`.

**Deeply nested callbacks.** Maximum nesting depth is three levels. If you reach four, extract a named function.

**`try/catch` without rethrowing or logging.** An empty `catch` block or one that only assigns to a variable without logging or rethrowing is a bug waiting to happen.

**Importing from a module's internal files.** Always import from the module's `index.ts`, never from internal implementation files. `import { runQuery } from "./core/query-runner"` is only valid inside the `core/` module itself.

**Synchronous file I/O in the request path.** `fs.readFileSync` in a request handler blocks the entire event loop. All file I/O uses `Bun.file()` or the async `fs/promises` API.

**`process.exit()` outside the composition root.** Only the entry point (`main.ts`) may call `process.exit()`. Library code throws errors. CLI code propagates errors to `main.ts` which decides the exit code.

---

_End of document — Bun TypeScript Style Guide v1.1.1_
