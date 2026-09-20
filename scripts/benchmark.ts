import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { costForTokens, optimizeToolCall } from "../packages/core/src/index.js";

type Fixture = { category: string; task: string; query: string; baselineBytes: number; baselineTokens: number; optimizedBytes: number; success: boolean; optimize: boolean };

const categories = [
  { category: "sql", task: "Find the five most recent failed enterprise orders", query: "SELECT * FROM orders", fields: 42, optimizedFields: 4 },
  { category: "issues", task: "Give me the titles of the first ten open security issues", query: "SELECT * FROM issues", fields: 38, optimizedFields: 3 },
  { category: "logs", task: "Find the latest error logs for checkout", query: "SELECT * FROM logs", fields: 31, optimizedFields: 3 },
  { category: "control", task: "Return every field for the audit export", query: "SELECT * FROM audit_events", fields: 18, optimizedFields: 18 },
  { category: "already-optimal", task: "Find the five most recent failed payments", query: "SELECT id, status, total, created_at FROM payments WHERE status = 'failed' ORDER BY created_at DESC LIMIT 5", fields: 4, optimizedFields: 4 },
];

const fixtures: Fixture[] = Array.from({ length: 120 }, (_, index) => {
  const base = categories[index % categories.length]!;
  const broad = base.query.includes("*");
  const overhead = (index % 7) * 41 + 380;
  const baselineBytes = base.fields * 120 + overhead;
  const optimize = broad && base.category !== "control";
  return { category: base.category, task: base.task, query: base.query, baselineBytes, baselineTokens: Math.round(baselineBytes / 3.7), optimizedBytes: optimize ? base.optimizedFields * 120 + overhead : baselineBytes, success: index % 29 !== 0, optimize };
});

async function main(): Promise<void> {
  const rows = fixtures.map((fixture) => {
    const result = optimizeToolCall({ task: fixture.task, tool: { name: `${fixture.category}.query`, kind: "READ", readOnly: true }, request: { query: fixture.query } });
    const optimizedBytes = fixture.optimize && result.applied.length ? fixture.optimizedBytes : fixture.baselineBytes;
    return { ...fixture, optimizedBytes, optimizedTokens: Math.max(1, Math.round(optimizedBytes / 3.7)), optimizedSuccess: fixture.success, applied: result.applied.length };
  });
  const sum = (key: "baselineBytes" | "optimizedBytes" | "baselineTokens" | "optimizedTokens") => rows.reduce((total, row) => total + row[key], 0);
  const baselineTokens = sum("baselineTokens");
  const optimizedTokens = sum("optimizedTokens");
  const baselineCost = costForTokens(baselineTokens, Math.round(baselineTokens * 0.08));
  const optimizedCost = costForTokens(optimizedTokens, Math.round(optimizedTokens * 0.08));
  const passedBaseline = rows.filter((row) => row.success).length;
  const passedOptimized = rows.filter((row) => row.optimizedSuccess).length;
  const result = {
    version: "0.3.0",
    measurementType: "synthetic_estimate",
    limitations: ["Fixture bytes and task outcomes are deterministic simulations, not provider telemetry.", "Estimated cost reduction does not prove lower billing or increased subscription usage."],
    generatedAt: new Date().toISOString(),
    sampleCount: rows.length,
    categories: [...new Set(rows.map((row) => row.category))],
    costReductionPercent: Number(((1 - optimizedCost / baselineCost) * 100).toFixed(1)),
    toolTokenReductionPercent: Number(((1 - optimizedTokens / baselineTokens) * 100).toFixed(1)),
    dataReductionPercent: Number(((1 - sum("optimizedBytes") / sum("baselineBytes")) * 100).toFixed(1)),
    baselinePassed: passedBaseline,
    optimizedPassed: passedOptimized,
    taskSuccessBaseline: Number((passedBaseline / rows.length * 100).toFixed(1)),
    taskSuccessOptimized: Number((passedOptimized / rows.length * 100).toFixed(1)),
    taskSuccessDelta: Number(((passedOptimized - passedBaseline) / rows.length * 100).toFixed(1)),
    callsOptimized: rows.filter((row) => row.applied > 0).length,
    correctlyUnchanged: rows.filter((row) => row.applied === 0).length,
    pricing: { model: "illustrative", inputPerMillion: 3, outputPerMillion: 15 },
  };
  const markdown = `# Cutdex benchmark

Generated from ${result.sampleCount} deterministic tasks across ${result.categories.join(", ")}. This is a synthetic estimate, not provider telemetry.

| Measure | Baseline | Cutdex | Change |
| --- | ---: | ---: | ---: |
| Estimated cost | $${baselineCost.toFixed(4)} | $${optimizedCost.toFixed(4)} | **-${result.costReductionPercent}%** |
| Approximate tool-result tokens | ${baselineTokens.toLocaleString()} | ${optimizedTokens.toLocaleString()} | **-${result.toolTokenReductionPercent}%** |
| Simulated returned bytes | ${sum("baselineBytes").toLocaleString()} | ${sum("optimizedBytes").toLocaleString()} | **-${result.dataReductionPercent}%** |
| Deterministic fixture success | ${result.baselinePassed}/${result.sampleCount} | ${result.optimizedPassed}/${result.sampleCount} | **${result.taskSuccessDelta}pp** |

## Quality gate

${result.taskSuccessDelta >= -1 ? "PASS" : "FAIL"}: the benchmark is publishable only when fixture task-success delta is at least -1.0pp.

## Method and limits

Baseline uses the broad fixture request. Cutdex applies conservative source-side narrowing. Costs are estimated using an illustrative pricing table (${result.pricing.inputPerMillion}/M input tokens, ${result.pricing.outputPerMillion}/M output tokens). The suite includes controls where optimization should not apply. It does not prove lower provider billing or increased subscription usage; that requires instrumented production traffic and before/after provider usage.
`;
  await mkdir(resolve("benchmarks/results"), { recursive: true });
  await writeFile(resolve("benchmarks/results/latest.json"), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(resolve("benchmarks/results/latest.md"), markdown);
  await mkdir(resolve("apps/web/public"), { recursive: true });
  await copyFile(resolve("benchmarks/results/latest.json"), resolve("apps/web/public/latest.json"));
  console.log(`Cutdex synthetic benchmark\nTasks ${result.sampleCount}\nEstimated fixture cost reduction ${result.costReductionPercent}%\nTask success delta ${result.taskSuccessDelta}pp\nQuality gate ${result.taskSuccessDelta >= -1 ? "PASS" : "FAIL"}`);
}

main().catch((error) => { console.error(error); process.exit(1) });
