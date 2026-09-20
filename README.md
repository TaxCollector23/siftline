# Cutdex

A hosted request optimizer for read-only agent tools.

```bash
npx cutdex@latest login
cutdex connect codex
```

Cutdex sits between an agent and a read-only database/API tool. It rewrites broad SQL and GraphQL-style requests before execution so the source returns fewer rows and fields to the model. It is not prompt compression, context summarization, model routing, or a magic wrapper around every tool already installed in a coding agent.

For custom agents, call `POST /api/v1/optimize` immediately before executing the tool request. For Codex, `cutdex connect codex` registers an MCP tool that the agent can call before a broad read. See [the API contract](docs/api.md) and [the Codex setup](docs/codex.md).

## Before / after

```sql
SELECT * FROM orders;

SELECT id, status, created_at
FROM orders
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 5;
```

## Current benchmark

Run `pnpm benchmark` to regenerate [`benchmarks/results/latest.json`](benchmarks/results/latest.json) and [`benchmarks/results/latest.md`](benchmarks/results/latest.md). The landing page loads the generated JSON; it does not contain hand-entered marketing numbers.

The deterministic run uses 120 synthetic tasks and reports estimated fixture cost, returned bytes, approximate model-facing tokens, task-success delta, optimized calls, and unchanged controls. The current 65.6% result is not measured provider billing and does not promise more ChatGPT/Codex subscription usage.

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

`pnpm dev` runs the Vite site. `cutdex start` remains available for local development; the intended user path is the hosted API plus the CLI credential and MCP connection.

## CLI

```text
cutdex login
cutdex logout
cutdex status
cutdex connect codex
cutdex mcp
cutdex start
cutdex bench
cutdex analyze <traces.jsonl>
cutdex optimize <trace.json>
cutdex report
cutdex doctor
```

```ts
import { optimizeToolCall } from "@cutdex/core";
const result = optimizeToolCall({ task: "Find the five most recent failed orders", tool: { name: "database.query", kind: "READ", readOnly: true }, request: { query: "SELECT * FROM orders" } });
```

Writes and unknown tools pass through unchanged. SQL is parsed into a small AST and printed from the AST; raw string replacement is not used for rewrites. Unsupported or ambiguous requests remain intact. `cutdex mcp` works locally without an API key and returns a compact response so the optimizer's own explanation does not become new context overhead.

## Project map

```text
apps/web             landing page, playground, benchmark methodology
api                  Vercel API routes for auth, keys, quotas, optimization
packages/api         API-key security and rate-limit primitives
packages/core        types, SQL AST, optimization passes, accounting
packages/cli         local proxy, dashboard server, CLI commands
benchmarks/results   generated JSON + Markdown artifacts
scripts               deterministic benchmark runner
docs                  product and integration notes
```

## License

MIT. See [LICENSE](LICENSE).
