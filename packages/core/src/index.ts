export * from "./types.js";
export * from "./sql.js";
export * from "./graphql.js";
export * from "./optimizer.js";
export * from "./accounting.js";
import { optimizeToolCall } from "./optimizer.js";
import type { ExecutionResult, OptimizeInput } from "./types.js";

/** Optimize locally, then execute exactly one source request. */
export async function executeWithCutdex<T>(input: OptimizeInput, execute: (request: OptimizeInput["request"]) => Promise<T> | T): Promise<ExecutionResult<T>> {
  const optimization = optimizeToolCall(input);
  const response = await execute(optimization.optimizedRequest);
  return { optimization, response };
}
