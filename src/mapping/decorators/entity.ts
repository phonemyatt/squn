import { globalMapperRegistry } from "../mapper-registry.ts";
import { propertyInjectionMapper } from "../class-mapper.ts";

interface SchemaLike {
  readonly columnNames: readonly string[];
}

type Constructor<T> = new (...args: unknown[]) => T;

/**
 * @Entity(schema) decorator — registers the class with propertyInjection strategy.
 * Equivalent to defineMapper(cls, schema) with strategy: "property".
 * Requires TC39 stage 3 decorators (TypeScript 5.0+ with target: "ESNext").
 */
export function Entity(schema: SchemaLike) {
  return function <T extends Constructor<unknown>>(target: T, _context: ClassDecoratorContext): T {
    const mapper = propertyInjectionMapper(target, schema.columnNames);
    globalMapperRegistry.register(target, mapper);
    return target;
  };
}
