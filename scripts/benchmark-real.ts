import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

type LiveCase = { id: string; task: string; request: { query: string } };
type LiveResult = LiveCase & { status: number; latencyMs: number; modified?: boolean; originalQuery?: string; optimizedQuery?: string; error?: string };

const cases: LiveCase[] = [
  { id: "failed-orders", task: "Find the five most recent failed orders", request: { query: "SELECT * FROM orders" } },
  { id: "open-issues", task: "Give me the titles of the first ten open issues", request: { query: "SELECT * FROM issues" } },
  { id: "already-narrow", task: "Find the five most recent failed payments", request: { query: "SELECT id, status, total, created_at FROM payments WHERE status = 'failed' ORDER BY created_at DESC LIMIT 5" } },
];

async function main(): Promise<void> {
  const endpoint = process.env.CUTDEX_BENCHMARK_API_URL ?? "http://localhost:4318/optimize";
  const apiKey = process.env.CUTDEX_API_KEY;
  const results: LiveResult[] = [];
  for (const fixture of cases) {
    const started = performance.now();
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) }, body: JSON.stringify({ ...fixture, tool: { name: "database.query", kind: "READ", readOnly: true } }) });
      const value = await response.json() as { originalRequest?: { query?: string }; optimizedRequest?: { query?: string }; applied?: unknown[]; message?: string };
      results.push({ ...fixture, status: response.status, latencyMs: Number((performance.now() - started).toFixed(3)), modified: Boolean(value.applied?.length), originalQuery: value.originalRequest?.query, optimizedQuery: value.optimizedRequest?.query, ...(value.message ? { error: value.message } : {}) });
    } catch (error) { results.push({ ...fixture, status: 0, latencyMs: Number((performance.now() - started).toFixed(3)), error: error instanceof Error ? error.message : "request failed" }) }
  }
  const output = { measurementType: "live_http_optimizer_check", endpoint, generatedAt: new Date().toISOString(), note: "This command measures the configured Cutdex HTTP path only. It does not execute a source database or claim provider billing savings.", cases: results };
  await writeFile(resolve("benchmarks/results/real-latest.json"), `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Cutdex live optimizer check\nEndpoint ${endpoint}\nCases ${results.length}\nHTTP success ${results.filter((result) => result.status >= 200 && result.status < 300).length}/${results.length}\nModified ${results.filter((result) => result.modified).length}\nResults benchmarks/results/real-latest.json`);
}

main().catch((error) => { console.error(error); process.exit(1) });
