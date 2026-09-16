# Siftline

Make agents fetch less.

```bash
npx siftline@latest start
```

Siftline is a conservative query optimizer for AI tool calls. It narrows read-only requests before they reach a database or API, so the source returns less data in the first place. It is not prompt compression, context summarization, or model routing.

## Before / after

```sql
SELECT * FROM orders;

SELECT id, status, total, customer_name, error, created_at
FROM orders
WHERE status = 'failed' AND customer_tier = 'enterprise'
ORDER BY created_at DESC
LIMIT 5;
```

## Current benchmark

Run `pnpm benchmark` to regenerate [`benchmarks/results/latest.json`](benchmarks/results/latest.json) and [`benchmarks/results/latest.md`](benchmarks/results/latest.md). The landing page loads the generated JSON; it does not contain hand-entered marketing numbers.

The deterministic run uses 120 synthetic tasks and reports estimated cost, returned bytes, model-facing tokens, task-success delta, p50/p90/p95 latency, unchanged controls, fallbacks, and unsafe rewrites.

## Develop

```bash
pnpm install
pnpm benchmark
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm dev
```

`pnpm dev` runs the Vite site. `npx siftline start` runs the local proxy on `4318` and the built dashboard on `4317`.

## CLI

```text
siftline start [--mode conservative|aggressive]
siftline bench
siftline analyze <traces.jsonl>
siftline explain <trace.json>
siftline report
siftline doctor
```

```ts
import { optimizeToolCall } from "@siftline/core";
const result = optimizeToolCall({ task: "Find the five most recent failed orders", tool: { name: "database.query", kind: "READ", readOnly: true }, request: { query: "SELECT * FROM orders" } });
```

Writes and unknown tools pass through unchanged. SQL is parsed into a small AST and printed from the AST; raw string replacement is not used for rewrites. Unsupported or ambiguous requests remain intact.

## Project map

```text
apps/web             landing page, playground, benchmark methodology
packages/core        types, SQL AST, optimization passes, accounting
packages/cli         local proxy, dashboard server, CLI commands
benchmarks/results   generated JSON + Markdown artifacts
scripts               deterministic benchmark runner
docs                  product and integration notes
```

## License

MIT. See [LICENSE](LICENSE).
