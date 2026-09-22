import type { OptimizationMode } from "./types.js";

export interface CompactInput {
  task: string;
  result: unknown;
  mode?: OptimizationMode;
}

export interface CompactResult {
  originalResult: unknown;
  compactedResult: unknown;
  changed: boolean;
  removedFields: number;
  removedItems: number;
  originalBytes: number;
  compactedBytes: number;
  approximateTokensSaved: number;
  reductionPercent: number;
  measurement: "serialized_json";
  explanation: string[];
}

const fieldAliases: Array<[string, string[]]> = [
  ["id", ["id", "identifier"]],
  ["status", ["status", "state"]],
  ["total", ["total", "amount", "price", "cost"]],
  ["customer_name", ["customer name", "customer"]],
  ["error", ["error", "reason"]],
  ["title", ["title", "subject", "summary"]],
  ["number", ["number", "issue number", "ticket"]],
  ["label", ["label", "tag"]],
  ["url", ["url", "link"]],
  ["email", ["email"]],
  ["created_at", ["created at", "created", "updated", "recent", "newest", "latest"]],
];

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? "null").length;
}

function normalizeKey(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function hasWord(task: string, value: string): boolean {
  return new RegExp(`\\b${value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i").test(task);
}

function explicitFields(task: string): Set<string> {
  const fields = new Set<string>();
  for (const [field, aliases] of fieldAliases) if (aliases.some((alias) => hasWord(task, alias))) fields.add(field);
  return fields;
}

function requestedLimit(task: string): number | undefined {
  const number = task.match(/\b(?:first|top|last|latest|at most|up to)\s+(\d+)\b/i)?.[1];
  if (number) return Number(number);
  if (/\b(?:five|latest five)\b/i.test(task)) return 5;
  if (/\bten\b/i.test(task)) return 10;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactRows(rows: unknown[], task: string): { value: unknown[]; removedFields: number; removedItems: number; explanations: string[] } {
  if (!rows.length || !rows.every(isRecord)) return { value: rows, removedFields: 0, removedItems: 0, explanations: [] };
  const fields = explicitFields(task);
  const matchingKeys = new Set(rows.flatMap((row) => Object.keys(row)).filter((key) => fields.has(normalizeKey(key))));
  const canProject = fields.size > 0 && matchingKeys.size > 0;
  const limit = requestedLimit(task);
  const keptRows = limit && rows.length > limit ? rows.slice(0, limit) : rows;
  let removedFields = 0;
  const value = canProject ? keptRows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(row)) {
      if (matchingKeys.has(key)) next[key] = item;
      else removedFields += 1;
    }
    return next;
  }) : keptRows;
  const removedItems = rows.length - keptRows.length;
  const explanations: string[] = [];
  if (canProject) explanations.push(`Kept only fields explicitly requested by the task: ${[...matchingKeys].join(", ")}.`);
  if (removedItems) explanations.push(`Kept the first ${keptRows.length} requested rows.`);
  return { value, removedFields, removedItems, explanations };
}

function compactValue(result: unknown, task: string): { value: unknown; removedFields: number; removedItems: number; explanations: string[] } {
  if (Array.isArray(result)) return compactRows(result, task);
  if (!isRecord(result)) return { value: result, removedFields: 0, removedItems: 0, explanations: [] };
  for (const key of ["rows", "items", "results", "data"]) {
    if (Array.isArray(result[key])) {
      const compacted = compactRows(result[key], task);
      const { value, ...summary } = compacted;
      if (!summary.removedFields && !summary.removedItems) return { value: result, ...summary };
      return { value: { ...result, [key]: value }, ...summary };
    }
  }
  return { value: result, removedFields: 0, removedItems: 0, explanations: [] };
}

export function compactToolResult(input: CompactInput): CompactResult {
  const compacted = compactValue(input.result, input.task);
  const originalBytes = jsonBytes(input.result);
  const compactedBytes = jsonBytes(compacted.value);
  const savedBytes = Math.max(0, originalBytes - compactedBytes);
  return {
    originalResult: input.result,
    compactedResult: compacted.value,
    changed: savedBytes > 0,
    removedFields: compacted.removedFields,
    removedItems: compacted.removedItems,
    originalBytes,
    compactedBytes,
    approximateTokensSaved: Math.floor(savedBytes / 4),
    reductionPercent: originalBytes ? Number(((savedBytes / originalBytes) * 100).toFixed(1)) : 0,
    measurement: "serialized_json",
    explanation: compacted.explanations.length ? compacted.explanations : ["No high-confidence result compaction applied."]
  };
}
