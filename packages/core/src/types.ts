export type ToolKind = "READ" | "WRITE" | "UNKNOWN";
export type OptimizationMode = "conservative" | "aggressive";
export interface ToolDescriptor { name: string; kind?: ToolKind; readOnly?: boolean }
export interface OptimizeInput { task: string; tool: ToolDescriptor; request: { query?: string; [key: string]: unknown }; mode?: OptimizationMode }
export interface PassResult { name: string; before: string; after: string; reason: string; confidence: "high" | "medium" | "low"; expectedBenefit: string }
export interface SavingsEstimate {
  bytes: number | null;
  inputTokens: number | null;
  percent: number | null;
  measurement: "no_change" | "not_measured";
  note: string;
}
export interface OptimizationResult { originalRequest: OptimizeInput["request"]; optimizedRequest: OptimizeInput["request"]; applied: PassResult[]; skipped: PassResult[]; estimatedSavings: SavingsEstimate; confidence: "high" | "medium" | "low"; safety: "safe" | "passed-through"; explanation: string[] }
export interface Trace { id: string; task: string; tool: ToolDescriptor; request: { query?: string; [key: string]: unknown }; response?: unknown; usage?: { inputTokens?: number; outputTokens?: number }; timestamp: string }
