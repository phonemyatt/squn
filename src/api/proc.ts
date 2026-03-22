import type { IDbAdapter } from "../adapters/base.ts";

/** Stored procedure → T[]. */
export async function queryProc<T>(
  adapter: IDbAdapter,
  procName: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const paramEntries = params !== undefined ? Object.entries(params) : [];
  const placeholders = paramEntries.map(([key], i) => `@${key} = $${i + 1}`).join(", ");
  const values = paramEntries.map(([_, v]) => v);
  const sql = placeholders.length > 0 ? `EXEC ${procName} ${placeholders}` : `EXEC ${procName}`;
  const rows = await adapter.query(sql, values);
  return rows as T[];
}

/** Stored procedure with OUTPUT params. */
export async function execProc<T, OutputParams extends Record<string, unknown>>(
  adapter: IDbAdapter,
  procName: string,
  params?: Record<string, unknown>,
): Promise<{ rows: T[]; output: OutputParams }> {
  const paramEntries = params !== undefined ? Object.entries(params) : [];
  const placeholders = paramEntries.map(([key], i) => `@${key} = $${i + 1}`).join(", ");
  const values = paramEntries.map(([_, v]) => v);
  const sql = placeholders.length > 0 ? `EXEC ${procName} ${placeholders}` : `EXEC ${procName}`;
  const resultSets = await adapter.queryMultiple(sql, values);
  const rows = (resultSets[0] ?? []) as T[];
  return { rows, output: {} as OutputParams };
}
