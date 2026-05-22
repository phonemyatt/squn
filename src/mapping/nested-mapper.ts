import type { Row } from "../types/primitives.ts";
import type { MapperFn } from "./mapper-registry.ts";

/**
 * Splits JOIN result rows at splitOn column boundaries and maps into nested objects.
 * Deduplicates by the first column (primary key) of each segment.
 * Left join sides become null when the splitOn column value is null.
 */
export function splitAndMap(
  rows: Row[],
  splitOn: string[],
  mappers: MapperFn<unknown>[],
): unknown[] {
  if (rows.length === 0) return [];

  const allColumns = Object.keys(rows[0] as Row);
  const segments = buildSegments(allColumns, splitOn);

  const primaryKey = allColumns[0];
  const primarySegment = segments[0];
  const primaryMapper = mappers[0];
  if (primaryKey === undefined || primarySegment === undefined || primaryMapper === undefined) return [];

  const resultMap = new Map<unknown, Record<string, unknown>>();
  const resultOrder: unknown[] = [];

  for (const row of rows) {
    const pkValue = row[primaryKey];

    let parent = resultMap.get(pkValue);
    if (parent === undefined) {
      // Map the first segment (primary entity)
      const primaryRow = extractSegment(row, primarySegment);
      parent = primaryMapper(primaryRow) as Record<string, unknown>;
      resultMap.set(pkValue, parent);
      resultOrder.push(pkValue);
    }

    // Map remaining segments (joined entities)
    for (let i = 1; i < segments.length; i++) {
      const segCols = segments[i];
      const splitCol = splitOn[i - 1];
      if (segCols === undefined || splitCol === undefined) continue;
      const splitValue = row[splitCol];

      if (splitValue === null || splitValue === undefined) {
        parent[splitCol] = null;
      } else {
        const segRow = extractSegment(row, segCols);
        const mapper = mappers[i];
        parent[splitCol] = mapper !== undefined ? mapper(segRow) : null;
      }
    }
  }

  return resultOrder.map((pk) => resultMap.get(pk));
}

function buildSegments(columns: string[], splitOn: string[]): string[][] {
  const segments: string[][] = [];
  let current: string[] = [];

  for (const col of columns) {
    if (splitOn.includes(col) && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push(col);
  }
  if (current.length > 0) segments.push(current);

  return segments;
}

function extractSegment(row: Row, columns: string[]): Row {
  const result: Row = {};
  for (const col of columns) {
    result[col] = row[col];
  }
  return result;
}
