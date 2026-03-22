/**
 * @Readonly() class decorator — freezes instances after construction.
 * The returned instance is a Readonly<T> at the TypeScript level and
 * Object.freeze()'d at runtime.
 *
 * Requires TC39 stage 3 decorators (TypeScript 5.0+ with target: "ESNext").
 */
export function Readonly() {
  // biome-ignore lint/suspicious/noExplicitAny: must accept any constructor signature
  return <T extends new (...args: any[]) => object>(
    target: T,
    _context: ClassDecoratorContext,
  ): T => {
    // biome-ignore lint/suspicious/noExplicitAny: must match target constructor
    const Frozen = class extends (target as new (...args: any[]) => object) {
      // biome-ignore lint/suspicious/noExplicitAny: must match target constructor
      constructor(...args: any[]) {
        super(...args);
        Object.freeze(this);
      }
    };
    return Frozen as unknown as T;
  };
}
