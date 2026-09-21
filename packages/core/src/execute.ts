import { compactToolResult, type CompactResult } from "./compactor.js";
import { optimizeToolCall } from "./optimizer.js";
import type { OptimizeInput, OptimizationResult } from "./types.js";

export interface ExecuteWithCutdexResult<T> {
  optimization: OptimizationResult;
  response: T;
  compaction: CompactResult;
}

/**
 * Adapter helper for developers who own the tool executor. It adds no model
 * round-trip: optimize the source request, execute it, then compact the
 * structured result before returning it to the agent.
 */
export async function executeWithCutdex<T>(input: OptimizeInput, execute: (request: OptimizeInput["request"]) => Promise<T>): Promise<ExecuteWithCutdexResult<T>> {
  const optimization = optimizeToolCall(input);
  const response = await execute(optimization.optimizedRequest);
  const compaction = compactToolResult({ task: input.task, result: response, mode: input.mode });
  return { optimization, response: compaction.compactedResult as T, compaction };
}
