import type { Row } from "../types/primitives.ts";
import type { MapperFn } from "./mapper-registry.ts";
import { globalMapperRegistry } from "./mapper-registry.ts";
import { propertyInjectionMapper, constructorMapper, staticFromDbMapper } from "./class-mapper.ts";
import type { ConstructionStrategy } from "./class-mapper.ts";

type Constructor<T> = new (...args: unknown[]) => T;

interface SchemaLike {
  readonly columnNames: readonly string[];
}

export interface DefineMapperOptions {
  readonly strategy?: ConstructionStrategy;
}

/**
 * Registers a class mapper globally. Any subsequent queryAs(cls, ...) resolves it.
 *
 * - No factory argument + strategy "property" (default): property injection
 * - No factory argument + strategy "constructor": constructor args in column order
 * - No factory argument + strategy "static": calls cls.fromDb(row)
 * - Factory function provided: uses it directly
 */
export function defineMapper<T>(
  cls: Constructor<T>,
  schema: SchemaLike,
  factoryOrOptions?: ((row: Row) => T) | DefineMapperOptions,
): MapperFn<T> {
  let mapper: MapperFn<T>;

  if (typeof factoryOrOptions === "function") {
    mapper = factoryOrOptions;
  } else {
    const strategy = factoryOrOptions?.strategy ?? "property";
    switch (strategy) {
      case "property":
        mapper = propertyInjectionMapper(cls, schema.columnNames);
        break;
      case "constructor":
        mapper = constructorMapper(cls, schema.columnNames);
        break;
      case "static":
        mapper = staticFromDbMapper(cls as unknown as { fromDb(row: Row): T });
        break;
      default:
        mapper = propertyInjectionMapper(cls, schema.columnNames);
    }
  }

  globalMapperRegistry.register(cls, mapper);
  return mapper;
}
