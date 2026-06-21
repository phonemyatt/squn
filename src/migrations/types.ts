import type { SqunLogger } from "../logging/logger.ts";

/**
 * A row in the migrations tracking table.
 * @internal
 */
export interface MigrationRecord {
  readonly id: string;
  readonly applied_at: string;
}

/**
 * A single migration definition — `up` applies the change, `down` reverts it.
 * @public
 */
export interface Migration {
  readonly id: string;
  readonly up: string;
  readonly down?: string;
}

/**
 * Options for the migration runner.
 * @public
 */
export interface MigrationOptions {
  /** Name of the table used to track applied migrations. Defaults to `_squn_migrations`. */
  readonly tableName?: string;
  /** Optional logger for migration lifecycle events. */
  readonly logger?: SqunLogger;
}

/**
 * Summary returned after running migrations.
 * @public
 */
export interface MigrationResult {
  /** IDs of migrations that were applied in this run. */
  readonly applied: string[];
  /** IDs of migrations that were already recorded and skipped. */
  readonly skipped: string[];
}
