import { beforeEach, describe, expect, it } from "bun:test";
import { defineMapper } from "../../../src/mapping/define-mapper.ts";
import { globalMapperRegistry } from "../../../src/mapping/mapper-registry.ts";
import type { Row } from "../../../src/types/primitives.ts";

class TestModel {
  id = 0;
  name = "";
}

const schema = { columnNames: ["id", "name"] as readonly string[] };

describe("mapping/define-mapper — defineMapper()", () => {
  beforeEach(() => {
    globalMapperRegistry.clear();
  });

  it("registers a mapper in the global registry", () => {
    defineMapper(TestModel, schema);
    expect(globalMapperRegistry.has(TestModel)).toBe(true);
  });

  it("default strategy is property injection", () => {
    defineMapper(TestModel, schema);
    const mapper = globalMapperRegistry.get(TestModel);
    const result = mapper?.({ id: 1, name: "A" } as Row) as TestModel;
    expect(result).toBeInstanceOf(TestModel);
    expect(result.id).toBe(1);
  });

  it("accepts a factory function directly", () => {
    defineMapper(TestModel, schema, (row) => {
      const m = new TestModel();
      m.id = (row.id as number) * 10;
      m.name = row.name as string;
      return m;
    });
    const mapper = globalMapperRegistry.get(TestModel);
    const result = mapper?.({ id: 5, name: "B" } as Row) as TestModel;
    expect(result.id).toBe(50);
  });

  it("strategy 'constructor' uses constructor args", () => {
    class CtorModel {
      constructor(
        public id: number,
        public name: string,
      ) {}
    }
    defineMapper(CtorModel, schema, { strategy: "constructor" });
    const mapper = globalMapperRegistry.get(CtorModel);
    const result = mapper?.({ id: 1, name: "C" } as Row) as CtorModel;
    expect(result).toBeInstanceOf(CtorModel);
    expect(result.id).toBe(1);
  });

  it("returns the mapper function", () => {
    const mapper = defineMapper(TestModel, schema);
    const result = mapper({ id: 1, name: "D" });
    expect(result).toBeInstanceOf(TestModel);
  });
});
