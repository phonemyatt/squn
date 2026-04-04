import type { AdapterType, ConnectionConfig } from "../types.ts";

type ConnectionDefaults = Record<AdapterType, ConnectionConfig>;

/** Localhost defaults for development. */
export const DEV_CONNECTIONS: ConnectionDefaults = {
  postgres: {
    host: "localhost",
    port: 5432,
    database: "squn_dev",
    user: "postgres",
  },
  mysql: { host: "localhost", port: 3306, database: "squn_dev", user: "root" },
  mssql: { host: "localhost", port: 1433, database: "squn_dev", user: "sa" },
  sqlite: { url: "./squn_dev.db" },
} as const;

/** Localhost defaults for test — SQLite uses :memory:. */
export const TEST_CONNECTIONS: ConnectionDefaults = {
  postgres: {
    host: "localhost",
    port: 5432,
    database: "squn_test",
    user: "postgres",
  },
  mysql: { host: "localhost", port: 3306, database: "squn_test", user: "root" },
  mssql: { host: "localhost", port: 1433, database: "squn_test", user: "sa" },
  sqlite: { url: ":memory:" },
} as const;
