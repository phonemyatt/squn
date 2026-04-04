import type { Row } from "../types/primitives.ts";
import type { MapperFn } from "./mapper-registry.ts";

// biome-ignore lint/suspicious/noExplicitAny: constructor args are heterogeneous at runtime
type Constructor<T> = new (...args: any[]) => T;

export type ConstructionStrategy =
  | "property"
  | "constructor"
  | "factory"
  | "static";

/**
 * Property injection: Object.create() then assign fields from the row.
 */
export function propertyInjectionMapper<T>(
  cls: Constructor<T>,
  columnNames: readonly string[],
): MapperFn<T> {
  return (row: Row): T => {
    const instance = Object.create(cls.prototype) as Record<string, unknown>;
    for (const col of columnNames) {
      instance[col] = row[col];
    }
    return instance as T;
  };
}

/**
 * Constructor: new Model(...args) in declared column order.
 */
export function constructorMapper<T>(
  cls: Constructor<T>,
  columnNames: readonly string[],
): MapperFn<T> {
  return (row: Row): T => {
    const args = columnNames.map((col) => row[col]);
    return new cls(...args);
  };
}

/**
 * Factory function: full control over instance creation.
 */
export function factoryMapper<T>(factory: (row: Row) => T): MapperFn<T> {
  return factory;
}

/**
 * Static fromDb(): calls Model.fromDb(row) automatically.
 */
export function staticFromDbMapper<T>(cls: {
  fromDb(row: Row): T;
}): MapperFn<T> {
  return (row: Row): T => cls.fromDb(row);
}
