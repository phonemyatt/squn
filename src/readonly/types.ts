export type { InferReadonlyModel, ReadonlyKeys } from "../types/infer.ts";

export type ReadonlyStrategy = "strict" | "warn";

export interface ReadonlyConfig {
  readonly readonly: boolean;
  readonly readonlyStrategy?: ReadonlyStrategy;
}
