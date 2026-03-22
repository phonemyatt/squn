/**
 * @Readonly() class decorator — freezes instances after construction.
 * The returned instance is a Readonly<T> at the TypeScript level and
 * Object.freeze()'d at runtime.
 *
 * Requires TC39 stage 3 decorators (TypeScript 5.0+ with target: "ESNext").
 */
export function Readonly() {
  return function <T extends new (...args: unknown[]) => object>(
    target: T,
    _context: ClassDecoratorContext,
  ): T {
    return class extends target {
      constructor(...args: unknown[]) {
        super(...args);
        Object.freeze(this);
      }
    } as T;
  };
}
