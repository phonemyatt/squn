import type { TvpMaterialised, TvpValue } from "../../../adapters/base.ts";
import { ErrorCode } from "../../../errors/codes.ts";
import { wrapError } from "../../../errors/wrap.ts";

/**
 * MSSQL native TVP stub.
 * Full implementation requires mssql.Table — deferred.
 */
export function materializeTvpNative(_tvp: TvpValue, _index: number): Promise<TvpMaterialised> {
  return Promise.reject(
    wrapError(
      new Error("Native TVP materialisation not yet implemented for MSSQL"),
      ErrorCode.ADAPTER_NOT_SUPPORTED,
      { operation: "materializeTvp", adapter: "mssql" },
      "Native TVP materialisation not yet implemented for MSSQL",
    ),
  );
}
