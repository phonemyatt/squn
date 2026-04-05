import type { SqlFragment } from "../sql/fragment.ts";
import { createFragment } from "../sql/fragment.ts";

export interface PaginateOptions {
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Lazy, immutable, composable query builder.
 * Nothing executes until db.run(q) is called.
 * Each method returns a new builder — never mutates.
 */
export class QueryBuilder<Names extends string = never> {
  private readonly _tableName: string;
  private readonly _selectCols: readonly string[];
  private readonly _whereClauses: readonly SqlFragment[];
  private readonly _orderClauses: readonly string[];
  private readonly _limit: number | null;
  private readonly _offset: number | null;
  private readonly _connectionName: Names | null;
  private readonly _readonly: boolean;

  constructor(
    tableName: string,
    selectCols: readonly string[] = [],
    whereClauses: readonly SqlFragment[] = [],
    orderClauses: readonly string[] = [],
    limit: number | null = null,
    offset: number | null = null,
    connectionName: Names | null = null,
    isReadonly: boolean = false,
  ) {
    this._tableName = tableName;
    this._selectCols = selectCols;
    this._whereClauses = whereClauses;
    this._orderClauses = orderClauses;
    this._limit = limit;
    this._offset = offset;
    this._connectionName = connectionName;
    this._readonly = isReadonly;
  }

  select(...cols: string[]): QueryBuilder<Names> {
    return new QueryBuilder(
      this._tableName,
      cols,
      this._whereClauses,
      this._orderClauses,
      this._limit,
      this._offset,
      this._connectionName,
      this._readonly,
    );
  }

  where(clause: SqlFragment): QueryBuilder<Names> {
    return new QueryBuilder(
      this._tableName,
      this._selectCols,
      [...this._whereClauses, clause],
      this._orderClauses,
      this._limit,
      this._offset,
      this._connectionName,
      this._readonly,
    );
  }

  whereIf(condition: boolean, clause: SqlFragment): QueryBuilder<Names> {
    if (!condition) return this;
    return this.where(clause);
  }

  orderBy(column: string, direction: "ASC" | "DESC" = "ASC"): QueryBuilder<Names> {
    return new QueryBuilder(
      this._tableName,
      this._selectCols,
      this._whereClauses,
      [...this._orderClauses, `"${column}" ${direction}`],
      this._limit,
      this._offset,
      this._connectionName,
      this._readonly,
    );
  }

  paginate(options: PaginateOptions): QueryBuilder<Names> {
    const offset = (options.page - 1) * options.pageSize;
    return new QueryBuilder(
      this._tableName,
      this._selectCols,
      this._whereClauses,
      this._orderClauses,
      options.pageSize,
      offset,
      this._connectionName,
      this._readonly,
    );
  }

  connection<N extends string>(name: N): QueryBuilder<N> {
    return new QueryBuilder<N>(
      this._tableName,
      this._selectCols,
      this._whereClauses,
      this._orderClauses,
      this._limit,
      this._offset,
      name,
      this._readonly,
    );
  }

  readonly(): QueryBuilder<Names> {
    return new QueryBuilder(
      this._tableName,
      this._selectCols,
      this._whereClauses,
      this._orderClauses,
      this._limit,
      this._offset,
      this._connectionName,
      true,
    );
  }

  /** Builds the SqlFragment for execution. */
  build(): SqlFragment {
    const cols =
      this._selectCols.length > 0 ? this._selectCols.map((c) => `"${c}"`).join(", ") : "*";
    const parts: string[] = [`SELECT ${cols} FROM "${this._tableName}"`];
    const allParams: unknown[] = [];

    if (this._whereClauses.length > 0) {
      const conditions: string[] = [];
      let paramOffset = 0;
      for (const clause of this._whereClauses) {
        const renumbered = clause.text.replace(
          /\$(\d+)/g,
          (_, n: string) => `$${Number.parseInt(n, 10) + paramOffset}`,
        );
        conditions.push(renumbered);
        for (const p of clause.params) {
          allParams.push(p);
          paramOffset++;
        }
      }
      parts.push(`WHERE ${conditions.join(" AND ")}`);
    }

    if (this._orderClauses.length > 0) {
      parts.push(`ORDER BY ${this._orderClauses.join(", ")}`);
    }

    if (this._limit !== null) {
      parts.push(`LIMIT ${this._limit}`);
    }
    if (this._offset !== null) {
      parts.push(`OFFSET ${this._offset}`);
    }

    return createFragment(parts.join(" "), allParams);
  }

  get connectionName(): Names | null {
    return this._connectionName;
  }

  get isReadonly(): boolean {
    return this._readonly;
  }

  get tableName(): string {
    return this._tableName;
  }
}

/** Creates a query builder for a table. */
export function queryBuilder(tableName: string): QueryBuilder<never>;
export function queryBuilder(schema: { tableName: string }): QueryBuilder<never>;
export function queryBuilder(arg: string | { tableName: string }): QueryBuilder<never> {
  const name = typeof arg === "string" ? arg : arg.tableName;
  return new QueryBuilder<never>(name);
}
