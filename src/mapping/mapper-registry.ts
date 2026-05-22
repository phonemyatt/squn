import type { Row } from "../types/primitives.ts";

export type MapperFn<T> = (row: Row) => T;

// biome-ignore lint/suspicious/noExplicitAny: constructor args are heterogeneous
type Constructor<T> = new (...args: any[]) => T;

/** Class → mapper registry. Instantiate your own for isolated test environments. */
export class MapperRegistry {
  private readonly mappers = new Map<Constructor<unknown>, MapperFn<unknown>>();

  register<T>(cls: Constructor<T>, mapper: MapperFn<T>): void {
    this.mappers.set(cls as Constructor<unknown>, mapper as MapperFn<unknown>);
  }

  get<T>(cls: Constructor<T>): MapperFn<T> | undefined {
    return this.mappers.get(cls as Constructor<unknown>) as MapperFn<T> | undefined;
  }

  has(cls: Constructor<unknown>): boolean {
    return this.mappers.has(cls);
  }

  clear(): void {
    this.mappers.clear();
  }
}

/**
 * Process-wide default registry used by `defineMapper()` and `@Entity`.
 * @internal — prefer injecting a `MapperRegistry` instance into `createConnection` for testability.
 */
export const globalMapperRegistry = new MapperRegistry();
