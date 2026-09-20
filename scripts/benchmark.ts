import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { costForTokens, optimizeToolCall, parseGraphql, parseSelect, type OptimizationResult } from "../packages/core/src/index.js";

type Definition = {
  id: string;
  category: string;
  task: string;
  query: string;
  fields: string[];
  rows: number;
  filteredRows?: number;
  success: boolean;
};

const definitions: Definition[] = [
  { id: "sql-failed-orders", category: "sql", task: "Find the five most recent failed enterprise orders", query: "SELECT * FROM orders", fields: ["id", "status", "total", "customer_name", "customer_tier", "error", "created_at", ...Array.from({ length: 35 }, (_, index) => `order_field_${index + 1}`)], rows: 1000, filteredRows: 47, success: true },
  { id: "sql-open-issues", category: "sql", task: "Give me the titles of the first ten open security issues", query: "SELECT * FROM issues", fields: ["id", "number", "title", "state", "label", "created_at", ...Array.from({ length: 32 }, (_, index) => `issue_field_${index + 1}`)], rows: 260, filteredRows: 38, success: true },
  { id: "sql-error-logs", category: "sql", task: "Find the latest error logs for checkout", query: "SELECT * FROM logs", fields: ["id", "level", "message", "service", "created_at", ...Array.from({ length: 26 }, (_, index) => `log_field_${index + 1}`)], rows: 600, filteredRows: 42, success: true },
  { id: "sql-total-failed", category: "sql-aggregate", task: "Count failed payments", query: "SELECT COUNT(id) FROM payments", fields: ["count"], rows: 1, success: true },
  { id: "sql-join", category: "sql-unsupported", task: "Show recent orders with customer email", query: "SELECT * FROM orders JOIN customers ON orders.customer_id = customers.id", fields: ["id", "status", "customer_name", "email", ...Array.from({ length: 12 }, (_, index) => `join_field_${index + 1}`)], rows: 500, success: true },
  { id: "sql-ambiguous", category: "sql-ambiguous", task: "Summarize the relevant records", query: "SELECT * FROM orders UNION SELECT * FROM archived_orders", fields: ["id", "status", "created_at", ...Array.from({ length: 15 }, (_, index) => `ambiguous_field_${index + 1}`)], rows: 300, success: true },
  { id: "sql-control", category: "control", task: "Return every field for the audit export", query: "SELECT * FROM audit_events", fields: ["id", "actor", "action", "payload", ...Array.from({ length: 14 }, (_, index) => `audit_field_${index + 1}`)], rows: 80, success: true },
  { id: "sql-write", category: "write", task: "Delete failed orders", query: "DELETE FROM orders WHERE status = 'failed'", fields: ["id", "status"], rows: 1, success: true },
  { id: "graphql-issues", category: "graphql", task: "Show issue title and state", query: "query Issues { issues { number title state labels avatarUrl updatedAt } }", fields: ["number", "title", "state", "labels", "avatarUrl", "updatedAt"], rows: 120, filteredRows: 120, success: true },
  { id: "graphql-repos", category: "graphql", task: "Show repository name and URL", query: "query Repositories { repositories { name url description languages stars } }", fields: ["name", "url", "description", "languages", "stars"], rows: 80, filteredRows: 80, success: true },
  { id: "api-users", category: "structured-api", task: "List the first five active users with email", query: "SELECT * FROM users", fields: ["id", "name", "email", "status", "created_at", ...Array.from({ length: 10 }, (_, index) => `user_field_${index + 1}`)], rows: 450, filteredRows: 85, success: true },
  { id: "already-optimal", category: "already-optimal", task: "Find the five most recent failed payments", query: "SELECT id, status, total, created_at FROM payments WHERE status = 'failed' ORDER BY created_at DESC LIMIT 5", fields: ["id", "status", "total", "created_at"], rows: 5, filteredRows: 5, success: true },
];

function repeatedCases(): Definition[] {
  return Array.from({ length: 120 }, (_, index) => {
    const base = definitions[index % definitions.length]!;
    return { ...base, id: `${base.id}-${String(index + 1).padStart(3, "0")}`, success: base.success && index % 29 !== 0 };
  });
}

function payloadBytes(fields: string[], rows: number): number {
  const sample = JSON.stringify(Object.fromEntries(fields.map((field) => [field, "value"]))) || "{}";
  return Buffer.byteLength(`[${Array.from({ length: rows }, () => sample).join(",")}]`, "utf8");
}

function selectedFieldCount(query: string, fallback: number): number {
  const sql = parseSelect(query);
  if (sql) return sql.columns.includes("*") ? fallback : sql.columns.length;
  const graphql = parseGraphql(query);
  return graphql?.fields.length ?? fallback;
}

function resultRows(definition: Definition, result: OptimizationResult): number {
  const query = typeof result.optimizedRequest.query === "string" ? result.optimizedRequest.query : "";
  const limit = query.match(/\bLIMIT\s+(\d+)\b/i)?.[1];
  if (limit) return Math.min(definition.rows, Number(limit));
  const originalHasWhere = /\bWHERE\b/i.test(definition.query);
  const optimizedHasWhere = /\bWHERE\b/i.test(query);
  return !originalHasWhere && optimizedHasWhere ? Math.min(definition.rows, definition.filteredRows ?? definition.rows) : definition.rows;
}

function optimizationInput(definition: Definition) {
  const kind = definition.category === "write" ? "WRITE" : "READ";
  return { task: definition.task, tool: { name: `${definition.category}.query`, kind: kind as "READ" | "WRITE", readOnly: kind === "READ" }, request: { query: definition.query } };
}

function caseResult(definition: Definition) {
  const input = optimizationInput(definition);
  const baselineBytes = payloadBytes(definition.fields, definition.rows);
  const started = performance.now();
  const result = optimizeToolCall(input);
  const optimizationLatencyMs = Number((performance.now() - started).toFixed(3));
  const optimizedQuery = typeof result.optimizedRequest.query === "string" ? result.optimizedRequest.query : definition.query;
  const optimizedFields = selectedFieldCount(optimizedQuery, definition.fields.length);
  const optimizedRows = resultRows(definition, result);
  const optimizedBytes = result.applied.length ? payloadBytes(definition.fields.slice(0, optimizedFields), optimizedRows) : baselineBytes;
  const baselineTokens = Math.max(1, Math.ceil(baselineBytes / 4));
  const optimizedTokens = Math.max(1, Math.ceil(optimizedBytes / 4));
  const requiredFields = definition.task.toLowerCase().includes("title") ? ["title"] : definition.task.toLowerCase().includes("email") ? ["email"] : [];
  const correctness = result.applied.length === 0 || requiredFields.every((field) => optimizedQuery.toLowerCase().includes(field));
  return {
    id: definition.id,
    category: definition.category,
    task: definition.task,
    originalRequest: input.request,
    optimizedRequest: result.optimizedRequest,
    baselineBytes,
    cutdexBytes: optimizedBytes,
    baselineApproximateToolResultTokens: baselineTokens,
    cutdexApproximateToolResultTokens: optimizedTokens,
    optimizationLatencyMs,
    baselineTaskSuccess: definition.success,
    cutdexTaskSuccess: definition.success && correctness,
    modified: result.applied.length > 0,
    safety: result.safety,
    reason: result.applied.length ? result.explanation.join(" ") : result.explanation[0] ?? "No safe transformation found.",
  };
}

function sum(rows: ReturnType<typeof caseResult>[], key: "baselineBytes" | "cutdexBytes" | "baselineApproximateToolResultTokens" | "cutdexApproximateToolResultTokens"): number { return rows.reduce((total, row) => total + row[key], 0) }
function median(values: number[]): number { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0 }

async function main(): Promise<void> {
  const cases = repeatedCases().map(caseResult);
  const baselineTokens = sum(cases, "baselineApproximateToolResultTokens");
  const cutdexTokens = sum(cases, "cutdexApproximateToolResultTokens");
  const baselineBytes = sum(cases, "baselineBytes");
  const cutdexBytes = sum(cases, "cutdexBytes");
  const baselineCost = costForTokens(baselineTokens, Math.round(baselineTokens * 0.08));
  const cutdexCost = costForTokens(cutdexTokens, Math.round(cutdexTokens * 0.08));
  const baselinePassed = cases.filter((row) => row.baselineTaskSuccess).length;
  const cutdexPassed = cases.filter((row) => row.cutdexTaskSuccess).length;
  const result = {
    version: "0.3.0",
    measurementType: "deterministic_fixture_estimate",
    limitations: ["Returned bytes and task outcomes come from deterministic local fixtures, not provider telemetry or real source databases.", "Approximate tool-result tokens use bytes divided by four; provider tokenization may differ.", "Optimization latency is measured locally and varies by hardware."],
    generatedAt: new Date().toISOString(),
    sampleCount: cases.length,
    categories: [...new Set(cases.map((row) => row.category))],
    costReductionPercent: Number(((1 - cutdexCost / baselineCost) * 100).toFixed(1)),
    toolTokenReductionPercent: Number(((1 - cutdexTokens / baselineTokens) * 100).toFixed(1)),
    dataReductionPercent: Number(((1 - cutdexBytes / baselineBytes) * 100).toFixed(1)),
    baselinePassed,
    optimizedPassed: cutdexPassed,
    taskSuccessBaseline: Number((baselinePassed / cases.length * 100).toFixed(1)),
    taskSuccessOptimized: Number((cutdexPassed / cases.length * 100).toFixed(1)),
    taskSuccessDelta: Number(((cutdexPassed - baselinePassed) / cases.length * 100).toFixed(1)),
    callsOptimized: cases.filter((row) => row.modified).length,
    correctlyUnchanged: cases.filter((row) => !row.modified).length,
    medianOptimizationLatencyMs: Number(median(cases.map((row) => row.optimizationLatencyMs)).toFixed(3)),
    pricing: { model: "illustrative", inputPerMillion: 3, outputPerMillion: 15 },
    cases,
  };
  const markdown = `# Cutdex benchmark

Generated from ${result.sampleCount} deterministic treatment cases across ${result.categories.join(", ")}. The baseline and treatment use the same task fixtures; treatment routes the read request through Cutdex before a deterministic fixture response is measured.

| Measure | Baseline | Cutdex | Change |
| --- | ---: | ---: | ---: |
| Approximate tool-result tokens | ${baselineTokens.toLocaleString()} | ${cutdexTokens.toLocaleString()} | **-${result.toolTokenReductionPercent}%** |
| Returned fixture bytes | ${baselineBytes.toLocaleString()} | ${cutdexBytes.toLocaleString()} | **-${result.dataReductionPercent}%** |
| Task success | ${result.baselinePassed}/${result.sampleCount} | ${result.optimizedPassed}/${result.sampleCount} | **${result.taskSuccessDelta}pp** |
| Requests modified | — | ${result.callsOptimized} | — |
| Safely unchanged | — | ${result.correctlyUnchanged} | — |
| Median optimization latency | — | ${result.medianOptimizationLatencyMs} ms | — |

## Method

The dataset covers broad SQL projections, implied predicates, sort and limit requests, aggregates, joins and unions that must pass through, GraphQL over-fetching, structured API-shaped reads, write operations, explicit all-field controls, and already-efficient requests. Each case records the task, original and optimized request, deterministic fixture bytes, approximate model-facing tool-result tokens, measured local optimization latency, task-success flags, modification state, safety, and reason.

Task success is a fixture correctness gate: baseline cases are known-good, and treatment must preserve fields explicitly requested by the task. Token estimates use ceil(UTF-8 returned bytes / 4), not provider billing. The benchmark does not claim lower provider charges, more subscription usage, or performance against a real database/API.

## Quality gate

${result.taskSuccessDelta >= -1 ? "PASS" : "FAIL"}: publishable runs require treatment task success to remain within 1.0 percentage point of baseline.
`;
  await mkdir(resolve("benchmarks/results"), { recursive: true });
  await writeFile(resolve("benchmarks/results/latest.json"), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(resolve("benchmarks/results/latest.md"), markdown);
  await mkdir(resolve("apps/web/public"), { recursive: true });
  await copyFile(resolve("benchmarks/results/latest.json"), resolve("apps/web/public/latest.json"));
  console.log(`Cutdex deterministic benchmark\nCases ${result.sampleCount}\nApproximate tool-result token reduction ${result.toolTokenReductionPercent}%\nTask success delta ${result.taskSuccessDelta}pp\nMedian optimization latency ${result.medianOptimizationLatencyMs} ms\nQuality gate ${result.taskSuccessDelta >= -1 ? "PASS" : "FAIL"}`);
}

main().catch((error) => { console.error(error); process.exit(1) });
