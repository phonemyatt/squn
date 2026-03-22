import { beforeEach, describe, expect, it } from "bun:test";
import { globalMapperRegistry } from "../../../src/mapping/mapper-registry.ts";
import type { Row } from "../../../src/types/primitives.ts";

class Foo {
  id = 0;
}
class Bar {
  id = 0;
}

describe("mapping/mapper-registry — globalMapperRegistry", () => {
  beforeEach(() => {
    globalMapperRegistry.clear();
  });

  it("register and get returns the registered mapper", () => {
    const mapper = (row: Row) => {
      const f = new Foo();
      f.id = row.id as number;
      return f;
    };
    globalMapperRegistry.register(Foo, mapper);
    expect(globalMapperRegistry.get(Foo)).toBe(mapper);
  });

  it("has() returns true for registered classes", () => {
    globalMapperRegistry.register(Foo, () => new Foo());
    expect(globalMapperRegistry.has(Foo)).toBe(true);
  });

  it("has() returns false for unregistered classes", () => {
    expect(globalMapperRegistry.has(Bar)).toBe(false);
  });

  it("get() returns undefined for unregistered classes", () => {
    expect(globalMapperRegistry.get(Bar)).toBeUndefined();
  });

  it("clear() removes all registrations", () => {
    globalMapperRegistry.register(Foo, () => new Foo());
    globalMapperRegistry.clear();
    expect(globalMapperRegistry.has(Foo)).toBe(false);
  });
});
