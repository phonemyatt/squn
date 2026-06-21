import type { IDbAdapter } from "../adapters/base.ts";
import { ErrorCode } from "../errors/codes.ts";
import { QueryError, TransactionError } from "../errors/types.ts";
import { EventCode } from "../logging/logger.ts";
import type { Migration, MigrationOptions, MigrationRecord, MigrationResult } from "./types.ts";

const DEFAULT_TABLE = "_squn_migrations";

function logInfo(
  options: MigrationOptions | undefined,
  message: string,
  migrationId?: string,
): void {
  const logger = options?.logger;
  if (logger === undefined) return;
  const context =
    migrationId !== undefined
      ? { operation: "runMigrations", table: migrationId }
      : { operation: "runMigrations" };
  logger.info({
    level: "info",
    timestamp: new Date().toISOString(),
    traceId: crypto.randomUUID(),
    code: EventCode.QUERY_START,
    message,
    context,
  });
}

function logError(
  options: MigrationOptions | undefined,
  message: string,
  migrationId?: string,
): void {
  const logger = options?.logger;
  if (logger === undefined) return;
  const context =
    migrationId !== undefined
      ? { operation: "runMigrations", table: migrationId }
      : { operation: "runMigrations" };
  logger.error({
    level: "error",
    timestamp: new Date().toISOString(),
    traceId: crypto.randomUUID(),
    code: EventCode.QUERY_END,
    message,
    context,
  });
}

/**
 * Applies all pending migrations in the provided list order.
 *
 * - Creates the tracking table on first run (`CREATE TABLE IF NOT EXISTS`).
 * - Skips migrations whose IDs are already recorded in the tracking table.
 * - Runs each pending migration's `up` SQL inside a transaction.
 * - Records each applied migration with an ISO timestamp.
 *
 * @public
 */
export async function runMigrations(
  adapter: IDbAdapter,
  migrations: readonly Migration[],
  options?: MigrationOptions,
): Promise<MigrationResult> {
  const tableName = options?.tableName ?? DEFAULT_TABLE;

  // Ensure tracking table exists
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS "${tableName}" (id TEXT NOT NULL PRIMARY KEY, applied_at TEXT NOT NULL)`,
    [],
  );

  // Fetch already-applied IDs
  const rows = await adapter.query(`SELECT id, applied_at FROM "${tableName}"`, []);
  const applied = new Set<string>();
  for (const row of rows) {
    const record = row as unknown as MigrationRecord;
    const id = record.id;
    if (typeof id === "string") {
      applied.add(id);
    }
  }

  const result = { applied: [] as string[], skipped: [] as string[] };

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      result.skipped.push(migration.id);
      logInfo(options, `Skipping already-applied migration: ${migration.id}`, migration.id);
      continue;
    }

    logInfo(options, `Applying migration: ${migration.id}`, migration.id);

    const tx = await adapter.beginTransaction();
    try {
      await tx.execute(migration.up, []);
      await tx.execute(`INSERT INTO "${tableName}" (id, applied_at) VALUES ($1, $2)`, [
        migration.id,
        new Date().toISOString(),
      ]);
      await tx.commit();
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // Rollback failure is swallowed — original error is more important
      }
      logError(options, `Migration failed: ${migration.id}`, migration.id);
      throw new TransactionError(
        ErrorCode.TX_COMMIT_FAILED,
        `Migration "${migration.id}" failed`,
        { operation: "runMigrations", table: migration.id },
        err,
      );
    }

    result.applied.push(migration.id);
    logInfo(options, `Applied migration: ${migration.id}`, migration.id);
  }

  return result satisfies MigrationResult;
}

/**
 * Rolls back a single migration by ID.
 *
 * - Runs the migration's `down` SQL inside a transaction.
 * - Removes the record from the tracking table.
 * - Throws `QueryError` if the migration has no `down` SQL or is not recorded as applied.
 *
 * @public
 */
export async function rollbackMigration(
  adapter: IDbAdapter,
  migrationId: string,
  migrations: readonly Migration[],
  options?: MigrationOptions,
): Promise<void> {
  const tableName = options?.tableName ?? DEFAULT_TABLE;

  const migration = migrations.find((m) => m.id === migrationId);
  if (migration === undefined) {
    throw new QueryError(
      ErrorCode.NO_ROWS_FOUND,
      `Migration "${migrationId}" not found in the provided migrations list`,
      { operation: "rollbackMigration" },
    );
  }

  if (migration.down === undefined) {
    throw new QueryError(
      ErrorCode.NO_ROWS_FOUND,
      `Migration "${migrationId}" has no down SQL — cannot roll back`,
      { operation: "rollbackMigration" },
    );
  }

  // Verify it has been applied
  const rows = await adapter.query(`SELECT id, applied_at FROM "${tableName}" WHERE id = $1`, [
    migrationId,
  ]);
  if (rows.length === 0) {
    throw new QueryError(
      ErrorCode.NO_ROWS_FOUND,
      `Migration "${migrationId}" is not recorded as applied`,
      { operation: "rollbackMigration" },
    );
  }

  logInfo(options, `Rolling back migration: ${migrationId}`, migrationId);

  const downSql = migration.down;
  const tx = await adapter.beginTransaction();
  try {
    await tx.execute(downSql, []);
    await tx.execute(`DELETE FROM "${tableName}" WHERE id = $1`, [migrationId]);
    await tx.commit();
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      // Rollback failure is swallowed — original error is more important
    }
    logError(options, `Rollback failed: ${migrationId}`, migrationId);
    throw new TransactionError(
      ErrorCode.TX_ROLLBACK_FAILED,
      `Rollback of migration "${migrationId}" failed`,
      { operation: "rollbackMigration", table: migrationId },
      err,
    );
  }

  logInfo(options, `Rolled back migration: ${migrationId}`, migrationId);
}
