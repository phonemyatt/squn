# Integration Tests

Live adapter tests that run against real database engines in Docker.

## Running

```sh
# Start containers, run tests, tear down (all-in-one)
bun run test:integration

# Unit tests only, then integration tests
bun run test:all
```

The runner (`scripts/test-integration.ts`) handles Docker lifecycle automatically:
1. `docker compose up -d`
2. Polls `docker compose ps --format json` until all three containers report `Health: healthy`
3. Runs `bun test tests/integration/` with DB connection URLs injected as env vars
4. `docker compose down` in a `finally` block regardless of test outcome

Maximum wait for containers: 5 minutes. MSSQL is the slowest to start (~30 s).

## Environment variables

| Variable | Default value |
|---|---|
| `SQUN_PG_URL` | `postgresql://postgres:password@localhost:5432/squn_test` |
| `SQUN_MYSQL_URL` | `mysql://root:password@localhost:3306/squn_test` |
| `SQUN_MSSQL_URL` | `mssql://sa:Password123!@localhost:1433/master` |

Each test suite calls `describe.skipIf(!url)(...)` so it silently skips when the
variable is absent — useful for running a single adapter manually:

```sh
SQUN_PG_URL=postgresql://... bun test tests/integration/postgres/
```

SQLite uses an in-memory database and needs no env var.

## Test matrix

Every adapter covers the same six scenarios:

| Scenario | What is asserted |
|---|---|
| `ping()` | No throw on healthy connection |
| Basic SELECT | Correct rows + types returned; empty array on no match |
| Parameterized INSERT | `rowsAffected = 1`; correct count for bulk UPDATE |
| Error wrapping | Raw driver error surfaced as `SqunError` with correct `context.adapter` + `context.operation` |
| Transactions | Committed row survives; rolled-back row does not |
| NULL handling | `null` round-trips through INSERT → SELECT |

## Adapter-specific notes

### SQLite (`sqlite/query.test.ts`)

Uses `":memory:"` — no Docker, no env var. Each test gets a fresh DB via
`beforeEach`/`afterEach`. No workarounds required; SQLite is synchronous under
the hood.

### PostgreSQL (`postgres/query.test.ts`)

Single shared adapter across all tests (created in `beforeAll`, closed in
`afterAll`). DDL and DML can share the same pool connection without issue;
Bun's Postgres driver does not exhibit the connection-state bug described below.

Parameter placeholders: `$1, $2, …` (PostgreSQL positional syntax).

### MySQL (`mysql/query.test.ts`)

**Bun.SQL MySQL connection-state bug.** The native `Bun.SQL` MySQL driver
leaves a pool connection in a mid-read state after any `unsafe()` call. If any
I/O-driven async operation (another `SQL` instance, `setTimeout`, etc.) occurs
before the next query on the *same* pool connection, the second query hangs
indefinitely.

Three workarounds are applied:

1. **Throw-away adapters for DDL.** `beforeAll` creates a dedicated
   `MysqlAdapter` solely for `DROP`/`CREATE`, closes it before the tests start,
   and never reuses it.

2. **Fresh adapter per test.** `beforeEach` constructs a new `MysqlAdapter`;
   `afterEach` closes it. Each test's adapter therefore makes at most a handful
   of sequential `unsafe()` calls with no interleaved I/O.

3. **DELETE moved inside transactions.** Transaction tests cannot run a `DELETE`
   on `adapter.sql` before calling `beginTransaction()`, because the resulting
   `txSql` I/O would corrupt the still-open pool connection. The workaround is
   to put the `DELETE` as the first statement *inside* the transaction so
   `adapter.sql` is never used for DML before `txSql` I/O begins.

`beginTransaction()` itself opens a dedicated `SQL({ max: 1 })` instance (not a
reserved pool slot) and closes it on commit or rollback, avoiding any pool
re-use after DML.

Parameter placeholders: `?` (MySQL positional syntax).

### MSSQL (`mssql/query.test.ts`)

Uses the `mssql` npm package (not Bun.SQL) — unaffected by the MySQL bug above.
Single shared adapter like Postgres.

The MSSQL adapter receives connection options parsed from the URL rather than the
URL string directly (the `mssql` package does not accept a connection URL).

Conditional DDL uses `IF OBJECT_ID('table', 'U') IS NOT NULL DROP TABLE …`
because MSSQL lacks `DROP TABLE IF EXISTS`.

Parameter placeholders: `@p0, @p1, …` (MSSQL named-parameter syntax, zero-indexed).

## Docker services

Defined in `docker-compose.yml` at the project root:

| Service | Image | Port | Healthcheck |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5432 | `pg_isready -U postgres` |
| `mysql` | `mysql:8-oracle` | 3306 | `mysqladmin ping -h localhost` |
| `mssql` | `mcr.microsoft.com/mssql/server:2022-latest` | 1433 | `sqlcmd SELECT 1` |

The MSSQL healthcheck uses the CMD exec form (not CMD-SHELL) to avoid shell
interpretation of the `!` in `Password123!`.
