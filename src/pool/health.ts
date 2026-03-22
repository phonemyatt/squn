import type { IDbAdapter } from "../adapters/base.ts";
import { ErrorCode } from "../errors/codes.ts";
import { wrapError } from "../errors/wrap.ts";

/** Pings the adapter to check if the connection is alive. */
export async function healthCheck(adapter: IDbAdapter): Promise<void> {
  try {
    await adapter.ping();
  } catch (err) {
    throw wrapError(
      err,
      ErrorCode.ADAPTER_DRIVER_ERROR,
      { operation: "healthCheck", adapter: adapter.type },
      "Health check failed",
    );
  }
}
