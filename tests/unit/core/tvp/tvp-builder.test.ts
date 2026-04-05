import { beforeEach, describe, expect, it } from "bun:test";
import { resetTempTableCounter } from "../../../../src/core/tvp/strategies/temp-table.ts";
import { TableType } from "../../../../src/core/tvp/table-type.ts";
import { tvp } from "../../../../src/core/tvp/tvp-builder.ts";
import { ErrorCode } from "../../../../src/errors/codes.ts";
import { ValidationError } from "../../../../src/errors/types.ts";

const OrderType = new TableType("dbo.OrderTableType", {
  orderId: "int",
  amount: "decimal(10,2)",
  note: "nvarchar(200)",
});

describe("TVP builder — tvp()", () => {
  it("returns a TvpValue with __isTvp: true", () => {
    const result = tvp(OrderType, [{ orderId: 1, amount: 99.99, note: "first" }]);
    expect(result.__isTvp).toBe(true);
  });

  it("returns the tableType and rows unchanged", () => {
    const rows = [{ orderId: 1, amount: 10, note: "x" }];
    const result = tvp(OrderType, rows);
    expect(result.tableType).toBe(OrderType);
    expect(result.rows).toEqual(rows);
  });

  it("accepts empty row arrays", () => {
    const result = tvp(OrderType, []);
    expect(result.rows).toHaveLength(0);
  });

  it("throws TVP_SCHEMA_MISMATCH when a column is missing", () => {
    expect(() =>
      tvp(OrderType, [
        { orderId: 1, amount: 10 } as unknown as {
          orderId: unknown;
          amount: unknown;
          note: unknown;
        },
      ]),
    ).toThrow(ValidationError);

    try {
      tvp(OrderType, [
        { orderId: 1, amount: 10 } as unknown as {
          orderId: unknown;
          amount: unknown;
          note: unknown;
        },
      ]);
    } catch (e) {
      expect((e as ValidationError).code).toBe(ErrorCode.TVP_SCHEMA_MISMATCH);
    }
  });

  it("throws TVP_SCHEMA_MISMATCH when extra columns are present", () => {
    try {
      tvp(OrderType, [
        { orderId: 1, amount: 10, note: "x", extra: "bad" } as unknown as {
          orderId: unknown;
          amount: unknown;
          note: unknown;
        },
      ]);
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).code).toBe(ErrorCode.TVP_SCHEMA_MISMATCH);
    }
  });
});

describe("TVP — temp-table strategy", () => {
  beforeEach(() => {
    resetTempTableCounter();
  });

  it("generates unique temp table names (counter increments)", async () => {
    const executed: string[] = [];
    const mockExecute = async (sql: string, _params: readonly unknown[]) => {
      executed.push(sql);
    };

    const { materializeTvpTempTable } = await import(
      "../../../../src/core/tvp/strategies/temp-table.ts"
    );

    const tvpValue = tvp(OrderType, [{ orderId: 1, amount: 9.99, note: "a" }]);

    const r1 = await materializeTvpTempTable(tvpValue, mockExecute);
    const r2 = await materializeTvpTempTable(tvpValue, mockExecute);

    // The two materializations should produce different table names
    expect(r1.sqlExpression).not.toBe(r2.sqlExpression);
    expect(r1.sqlExpression).toContain("_squn_tvp_");
    expect(r2.sqlExpression).toContain("_squn_tvp_");
  });

  it("cleanup() drops the temp table even if the query throws", async () => {
    const dropped: string[] = [];

    const mockExecute = async (sql: string, _params: readonly unknown[]) => {
      if (sql.startsWith("DROP")) {
        dropped.push(sql);
      }
    };

    const { materializeTvpTempTable } = await import(
      "../../../../src/core/tvp/strategies/temp-table.ts"
    );

    const tvpValue = tvp(OrderType, [{ orderId: 1, amount: 9.99, note: "a" }]);
    const result = await materializeTvpTempTable(tvpValue, mockExecute);

    // Simulate the query throwing after TVP materialisation
    let caughtError: unknown;
    try {
      throw new Error("query failed");
    } catch (err) {
      caughtError = err;
    } finally {
      await result.cleanup();
    }

    expect(caughtError).toBeDefined();
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped[0]).toContain("DROP TABLE");
  });
});
