import { describe, expect, it } from "bun:test";
import type {
  IDbAdapter,
  IDbTransaction,
  TvpMaterialised,
  TvpValue,
} from "../../../src/adapters/base.ts";
import { ConnectionRegistry } from "../../../src/connections/registry.ts";
import { resolveConnection } from "../../../src/connections/resolve-connection.ts";
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
    hasCursorSupport() { return false; },
    async ping() {},
    async close() {},
    async materializeTvp(_t: TvpValue, _i: number): Promise<TvpMaterialised> {
      throw new Error("not impl");
    },
  };
}

type Names = "primary" | "replica";

describe("connections/resolve-connection — resolveConnection()", () => {
  const primary = stub();
  const replica = stub();
  const registry = new ConnectionRegistry<Names>(
    { primary, replica },
    "primary",
  );

  it("uses options.connection when provided", () => {
    expect(resolveConnection(registry, "replica")).toBe(replica);
  });

  it("falls back to useScope when no options.connection", () => {
    expect(resolveConnection(registry, undefined, "replica")).toBe(replica);
  });

  it("falls back to builderConnection when no options or scope", () => {
    expect(resolveConnection(registry, undefined, undefined, "replica")).toBe(
      replica,
    );
  });

  it("falls back to default when nothing is specified", () => {
    expect(resolveConnection(registry)).toBe(primary);
  });

  it("options.connection wins over useScope", () => {
    expect(resolveConnection(registry, "primary", "replica")).toBe(primary);
  });

  it("useScope wins over builderConnection", () => {
    expect(resolveConnection(registry, undefined, "replica", "primary")).toBe(
      replica,
    );
  });

  it("throws CONN_UNKNOWN for an unregistered name", () => {
    expect(() => resolveConnection(registry, "typo" as Names)).toThrow(
      ConnectionError,
    );
  });
});
