/**
 * Column definition builder.
 *
 * Captures column metadata as a plain object. Generic parameters encode
 * the column's TypeScript type, nullability, and readonly status so that
 * InferModel / InferInsert can read them at the type level.
 */

export interface ColumnDef<
  T = unknown,
  Nullable extends boolean = boolean,
  Readonly extends boolean = boolean,
> {
  readonly __brand: "ColumnDef";
  readonly dbType: string;
  readonly dbMaxLength: number | "MAX" | null;
  readonly isNullable: Nullable;
  readonly isReadonly: Readonly;
  readonly isPrimaryKey: boolean;
  readonly isComputed: boolean;
  readonly computedExpr: string | null;
  readonly isUnique: boolean;
  /** Phantom — carries the resolved TS type for inference. */
  readonly _type: Nullable extends true ? T | null : T;
}

interface ColumnBuilder<
  T,
  Nullable extends boolean,
  Readonly extends boolean,
> {
  nullable(): ColumnBuilder<T, true, Readonly> & ColumnDef<T, true, Readonly>;
  notNull(): ColumnBuilder<T, false, Readonly> & ColumnDef<T, false, Readonly>;
  readonly(): ColumnBuilder<T, Nullable, true> & ColumnDef<T, Nullable, true>;
  primaryKey(): ColumnBuilder<T, Nullable, true> & ColumnDef<T, Nullable, true>;
  computed(expr: string): ColumnBuilder<T, Nullable, true> & ColumnDef<T, Nullable, true>;
  unique(): ColumnBuilder<T, Nullable, Readonly> & ColumnDef<T, Nullable, Readonly>;
}

type AnyCol = ColumnBuilder<unknown, boolean, boolean> & ColumnDef<unknown, boolean, boolean>;

function makeBuilder(base: Record<string, unknown>): AnyCol {
  const obj = { ...base } as Record<string, unknown>;

  obj.nullable = () => makeBuilder({ ...obj, isNullable: true });
  obj.notNull = () => makeBuilder({ ...obj, isNullable: false });
  obj.readonly = () => makeBuilder({ ...obj, isReadonly: true });
  obj.primaryKey = () => makeBuilder({ ...obj, isPrimaryKey: true, isReadonly: true });
  obj.computed = (expr: string) =>
    makeBuilder({ ...obj, isComputed: true, isReadonly: true, computedExpr: expr });
  obj.unique = () => makeBuilder({ ...obj, isUnique: true });

  return obj as unknown as AnyCol;
}

function createColumnDef<T>(
  dbType: string,
  dbMaxLength: number | "MAX" | null,
): ColumnBuilder<T, false, false> & ColumnDef<T, false, false> {
  return makeBuilder({
    __brand: "ColumnDef" as const,
    dbType,
    dbMaxLength,
    isNullable: false,
    isReadonly: false,
    isPrimaryKey: false,
    isComputed: false,
    computedExpr: null,
    isUnique: false,
  }) as ColumnBuilder<T, false, false> & ColumnDef<T, false, false>;
}

/** Column builder entry points — one per database type. */
export const col = {
  int:      ()                       => createColumnDef<number>("int", null),
  bigint:   ()                       => createColumnDef<number>("bigint", null),
  smallint: ()                       => createColumnDef<number>("smallint", null),
  float:    ()                       => createColumnDef<number>("float", null),
  decimal:  (p?: number, _s?: number) => createColumnDef<number>("decimal", p ?? null),
  boolean:  ()                       => createColumnDef<boolean>("boolean", null),
  text:     ()                       => createColumnDef<string>("text", null),
  nvarchar: (len: number | "MAX")    => createColumnDef<string>("nvarchar", len),
  varchar:  (len: number | "MAX")    => createColumnDef<string>("varchar", len),
  char:     (len: number)            => createColumnDef<string>("char", len),
  datetime: ()                       => createColumnDef<Date>("datetime", null),
  date:     ()                       => createColumnDef<Date>("date", null),
  time:     ()                       => createColumnDef<string>("time", null),
  uuid:     ()                       => createColumnDef<string>("uuid", null),
  blob:     ()                       => createColumnDef<Buffer>("blob", null),
  json:     <T = unknown>()          => createColumnDef<T>("json", null),
  array:    <T = unknown>()          => createColumnDef<T[]>("array", null),
} as const;
