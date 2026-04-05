import { describe, expect, it } from "bun:test";
import type {
  IDbAdapter,
  IDbTransaction,
  TvpMaterialised,
  TvpValue,
} from "../../../src/adapters/base.ts";
import { ConnectionRegistry } from "../../../src/connections/registry.ts";
import { ErrorCode } from "../../../src/errors/codes.ts";
import { ConnectionError } from "../../../src/errors/types.ts";

function stub(): IDbAdapter {
  return {
    type: "sqlite",
    async execute() {
      return { rowsAffected: 0 };
    },
    async query() {
      return [];
    },
    async queryMultiple() {
      return [];
    },
    async beginTransaction(): Promise<IDbTransaction> {
      throw new Error("not impl");
    },
    async executeBatch(_s: string, _rows: readonly Record<string, unknown>[], _p: readonly string[]) { return { rowsAffected: 0 }; },
    hasCursorSupport() { return false; },
    async ping() {},
    async close() {},
    async materializeTvp(_t: TvpValue, _i: number): Promise<TvpMaterialised> {
      throw new Error("not impl");
    },
  };
}

describe("connections/registry — ConnectionRegistry", () => {
  it("get() returns the adapter for a registered name", () => {
    const registry = new ConnectionRegistry<"primary" | "replica">(
      { primary: stub(), replica: stub() },
      "primary",
    );
    expect(registry.get("primary")).toBeDefined();
    expect(registry.get("replica")).toBeDefined();
  });

  it("get() without a name returns the default connection", () => {
    const primary = stub();
    const registry = new ConnectionRegistry<"primary" | "replica">(
      { primary, replica: stub() },
      "primary",
    );
    expect(registry.get()).toBe(primary);
  });

  it("get() throws CONN_UNKNOWN for an unregistered name", () => {
    const registry = new ConnectionRegistry<"primary">(
      { primary: stub() },
      "primary",
    );
    try {
      registry.get("typo" as "primary");
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ConnectionError);
      expect((e as ConnectionError).code).toBe(ErrorCode.CONN_UNKNOWN);
      expect((e as ConnectionError).context.requestedName).toBe("typo");
      expect((e as ConnectionError).context.registeredNames).toContain(
        "primary",
      );
    }
  });

  it("names() returns all registered connection names", () => {
    const registry = new ConnectionRegistry<"a" | "b" | "c">(
      { a: stub(), b: stub(), c: stub() },
      "a",
    );
    expect(registry.names().sort()).toEqual(["a", "b", "c"]);
  });

  it("has() returns true for registered and false for unregistered", () => {
    const registry = new ConnectionRegistry<"primary">(
      { primary: stub() },
      "primary",
    );
    expect(registry.has("primary")).toBe(true);
    expect(registry.has("missing")).toBe(false);
  });

  it("constructor throws if default name is not in the map", () => {
    expect(
      () => new ConnectionRegistry<"a">({ a: stub() }, "missing" as "a"),
    ).toThrow(ConnectionError);
  });
});
