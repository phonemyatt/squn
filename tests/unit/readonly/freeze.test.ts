import { describe, expect, it } from "bun:test";
import { Readonly } from "../../../src/readonly/freeze.ts";

describe("readonly/freeze — @Readonly() decorator", () => {
  it("freezes instances after construction", () => {
    @Readonly()
    class FrozenUser {
      name: string;
      constructor(name: string) {
        this.name = name;
      }
    }

    const user = new FrozenUser("Alice");
    expect(Object.isFrozen(user)).toBe(true);
    expect(user.name).toBe("Alice");
  });

  it("prevents property assignment on frozen instance", () => {
    @Readonly()
    class FrozenPoint {
      x: number;
      y: number;
      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
      }
    }

    const point = new FrozenPoint(1, 2);
    expect(() => {
      (point as unknown as Record<string, unknown>).x = 99;
    }).toThrow();
    expect(point.x).toBe(1);
  });

  it("the instance is still instanceof the original class", () => {
    @Readonly()
    class FrozenItem {
      id: number;
      constructor(id: number) {
        this.id = id;
      }
    }

    const item = new FrozenItem(42);
    expect(item).toBeInstanceOf(FrozenItem);
  });

  it("methods from the class prototype are still accessible", () => {
    @Readonly()
    class FrozenModel {
      value: number;
      constructor(value: number) {
        this.value = value;
      }
      doubled(): number {
        return this.value * 2;
      }
    }

    const m = new FrozenModel(5);
    expect(m.doubled()).toBe(10);
  });

  it("does not freeze the class itself, only instances", () => {
    @Readonly()
    class FrozenClass {
      static count = 0;
      constructor() {
        FrozenClass.count++;
      }
    }

    new FrozenClass();
    new FrozenClass();
    expect(FrozenClass.count).toBe(2);
    expect(Object.isFrozen(FrozenClass)).toBe(false);
  });
});
