import { describe, expect, it } from "bun:test";
import {
  constructorMapper,
  factoryMapper,
  propertyInjectionMapper,
  staticFromDbMapper,
} from "../../../src/mapping/class-mapper.ts";
import type { Row } from "../../../src/types/primitives.ts";

class UserModel {
  id = 0;
  name = "";
  getInitials(): string {
    return this.name
      .split(" ")
      .map((w) => w[0])
      .join("");
  }
}

class ConstructorUser {
  constructor(
    public id: number,
    public name: string,
  ) {}
}

class StaticUser {
  id = 0;
  name = "";
  static fromDb(row: Row): StaticUser {
    const u = new StaticUser();
    u.id = row.id as number;
    u.name = row.name as string;
    return u;
  }
}

describe("mapping/class-mapper — construction strategies", () => {
  const row: Row = { id: 1, name: "Alice Smith" };

  describe("property injection", () => {
    it("creates an instance of the class with fields assigned from the row", () => {
      const mapper = propertyInjectionMapper(UserModel, ["id", "name"]);
      const result = mapper(row);
      expect(result).toBeInstanceOf(UserModel);
      expect(result.id).toBe(1);
      expect(result.name).toBe("Alice Smith");
    });

    it("class methods are available on the mapped instance", () => {
      const mapper = propertyInjectionMapper(UserModel, ["id", "name"]);
      const result = mapper(row);
      expect(result.getInitials()).toBe("AS");
    });
  });

  describe("constructor", () => {
    it("creates an instance by passing row values as constructor args in column order", () => {
      const mapper = constructorMapper(ConstructorUser, ["id", "name"]);
      const result = mapper(row);
      expect(result).toBeInstanceOf(ConstructorUser);
      expect(result.id).toBe(1);
      expect(result.name).toBe("Alice Smith");
    });
  });

  describe("factory function", () => {
    it("uses the provided factory to create instances", () => {
      const mapper = factoryMapper((r: Row) => ({
        userId: r.id,
        displayName: r.name,
      }));
      const result = mapper(row);
      expect(result).toEqual({ userId: 1, displayName: "Alice Smith" });
    });
  });

  describe("static fromDb()", () => {
    it("calls the static fromDb method on the class", () => {
      const mapper = staticFromDbMapper(StaticUser);
      const result = mapper(row);
      expect(result).toBeInstanceOf(StaticUser);
      expect(result.id).toBe(1);
      expect(result.name).toBe("Alice Smith");
    });
  });
});
