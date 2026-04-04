import { DEVELOPMENT_DEFAULTS } from "./defaults/development.ts";
import { PRODUCTION_DEFAULTS } from "./defaults/production.ts";
import { TEST_DEFAULTS } from "./defaults/test.ts";
import type { Environment, SqunConfig } from "./types.ts";

const PRESETS: Record<Environment, SqunConfig> = {
  development: DEVELOPMENT_DEFAULTS,
  production: PRODUCTION_DEFAULTS,
  test: TEST_DEFAULTS,
};

const VALID_ENVS = new Set<string>(["development", "production", "test"]);

/**
 * Detects the runtime environment following the precedence chain:
 * explicit arg → BUN_ENV → NODE_ENV → "development".
 */
function detectEnv(explicit?: string): Environment {
  const raw =
    explicit ?? process.env.BUN_ENV ?? process.env.NODE_ENV ?? "development";
  if (VALID_ENVS.has(raw)) {
    return raw as Environment;
  }
  return "development";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively deep-merges `override` on top of `base`.
 * Scalar values in override win. Nested objects are merged recursively.
 * `null` in override is preserved (used for "disable this setting").
 */
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const key of Object.keys(override)) {
    const overrideVal = override[key];
    const baseVal = result[key];

    if (overrideVal === undefined) {
      continue;
    }

    if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      result[key] = deepMerge(baseVal, overrideVal);
    } else {
      result[key] = overrideVal;
    }
  }

  return result;
}

/**
 * Resolves the final SqunConfig by detecting the environment and deep-merging
 * the user's partial config on top of the matching preset.
 */
export function resolveConfig(
  userConfig: Partial<SqunConfig>,
  env?: string,
): SqunConfig {
  const environment = detectEnv(env ?? userConfig.env);
  const preset = PRESETS[environment];

  const merged = deepMerge(
    preset as unknown as Record<string, unknown>,
    userConfig as unknown as Record<string, unknown>,
  ) as SqunConfig;

  return { ...merged, env: environment };
}
