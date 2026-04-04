import { ErrorCode } from "../errors/codes.ts";
import { SqunConfigError } from "../errors/types.ts";
import type { MultiDbConfig } from "./types.ts";

/**
 * Loads squn.config.ts if present. Validates the export shape.
 * If the file uses `: SqunConfig` instead of `satisfies SqunConfig`,
 * Names widens to string — throws a clear error explaining the fix.
 */
export async function loadConfigFile(
  path: string,
): Promise<MultiDbConfig | null> {
  try {
    const mod = await import(path);
    const config = mod.default ?? mod.config;

    if (config === undefined) {
      return null;
    }

    if (typeof config !== "object" || config === null) {
      throw new SqunConfigError(
        ErrorCode.CONFIG_INVALID_VALUE,
        "squn.config.ts must export a valid config object as default or named 'config'",
        { operation: "loadConfigFile" },
      );
    }

    if (config.connections === undefined) {
      throw new SqunConfigError(
        ErrorCode.CONFIG_INVALID_VALUE,
        "squn.config.ts must include a 'connections' map",
        { operation: "loadConfigFile" },
      );
    }

    return config as MultiDbConfig;
  } catch (err) {
    if (err instanceof SqunConfigError) throw err;

    // File not found is not an error — config file is optional
    if (err instanceof Error && err.message.includes("Cannot find module")) {
      return null;
    }

    throw new SqunConfigError(
      ErrorCode.CONFIG_INVALID_VALUE,
      `Failed to load squn.config.ts: ${err instanceof Error ? err.message : String(err)}`,
      { operation: "loadConfigFile" },
      err,
    );
  }
}
