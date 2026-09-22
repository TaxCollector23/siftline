# Cutdex

A local-first request optimizer for Codex tool calls.

```bash
npx cutdex@latest connect codex
```

Cutdex runs beside Codex. It rewrites broad SQL and GraphQL-style read requests before execution so the source returns fewer rows and fields to the Codex client. It makes no model request and does not use the OpenAI API. It is not prompt compression, context summarization, model routing, or a magic wrapper around every tool already installed in a coding agent.

For custom agents, call `executeWithCutdex` immediately before executing the tool request. For Codex, `cutdex connect codex` registers a local MCP tool that the agent can call before a broad read. The hosted API is optional and only enabled with `CUTDEX_USE_HOSTED_API=1`. See [the API contract](docs/api.md) and [the Codex setup](docs/codex.md).

## Billing boundary

The default path is local: Cutdex makes zero OpenAI API calls and does not need an OpenAI API key. Codex remains responsible for model execution, so its usage is governed by the account and client sign-in you use. In Codex, check `/status` to confirm the active plan or workspace allowance. ChatGPT subscription billing and API-platform billing are separate systems; no app can turn a normal API request into subscription-plan usage.

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

The deterministic run uses 120 synthetic tasks and reports estimated fixture reduction, returned bytes, approximate model-facing tokens, task-success delta, optimized calls, and unchanged controls. The current 65.6% result is not measured provider billing and does not promise more ChatGPT/Codex subscription usage.

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

`pnpm dev` runs the Vite site. `cutdex start` remains available for local development; the default user path is the local MCP connection.

## CLI

```text
npx cutdex@latest connect codex
cutdex logout
cutdex status
cutdex connect codex
cutdex mcp
cutdex start
cutdex bench
cutdex analyze <traces.jsonl>
cutdex explain <trace.json>
cutdex report
cutdex doctor
```

```ts
import { executeWithCutdex } from "@siftline/core";
const result = await executeWithCutdex(input, (request) => database.execute(request));
```

Writes and unknown tools pass through unchanged. SQL is parsed into a small AST and printed from the AST; raw string replacement is not used for rewrites. Unsupported or ambiguous requests remain intact.

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
