# Cutdex

A local-first request optimizer for Codex tool calls.

```bash
cutdex login
cutdex connect codex
```

Cutdex sits between an agent and a read-only database/API tool. It rewrites broad SQL and GraphQL-style requests before execution so the source returns fewer rows and fields to the model. It is not prompt compression, context summarization, model routing, or a magic wrapper around every tool already installed in a coding agent.

For custom agents, call `POST /api/v1/optimize` immediately before executing the tool request. If your application owns the executor, `executeWithCutdex` also compacts the returned structured result before it reaches the model, without an extra model round-trip. For Codex, `cutdex connect codex` registers an MCP tool that the agent can call before a broad read. See [the API contract](docs/api.md) and [the Codex setup](docs/codex.md).

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

The deterministic run uses 120 synthetic tasks and reports fixture bytes, approximate request-plus-result context, task-success delta, optimization latency, per-case requests, optimized calls, and unchanged controls. The current 81.8% tool-result and 81.7% request-plus-result context figures are local fixture measurements—not provider billing—and do not promise more ChatGPT/Codex subscription usage. The GraphQL fixture now checks that a rewrite preserves the nested response shape; unsupported nesting passes through.

The billing boundary is explicit: an API-style estimate at the illustrative $3/M input rate is $16.15 before Cutdex and $2.95 after it for this fixture, a modeled $13.20 difference. ChatGPT-signed-in Codex uses the account's Work/Codex allowance rather than API-token billing, so the repository does not claim an 81.7% subscription-usage reduction. To measure a real API run, record paired provider-reported usage and run `cutdex analyze traces.jsonl`.

The generated report and landing page also include an official API-rate sensitivity table for GPT-6 Astra, GPT-6 Sol, GPT-6 Luna, GPT-5.6 Sol, and GPT-5.3 Codex. It applies the published standard short-context input rates to the same fixture, with output, cache-hit, tool-call, and subscription charges excluded. Rates are manually verified against [OpenAI's API pricing page](https://developers.openai.com/api/docs/pricing) and should be re-checked before invoicing or publishing a new claim.

The public npm package is installable without npm authentication. Run `npx cutdex@latest connect codex` for local mode or install it globally with `npm install --global cutdex`. Hosted quota mode is optional: `cutdex login` opens the key page, then verifies the key you paste back into the terminal. The repository includes a tag-based GitHub Actions release using npm trusted publishing, so the maintainer does not need a local npm token after configuring the package's Trusted Publisher as `TaxCollector23/siftline`, workflow `publish.yml`.

To release a version after that one-time npm setup:

```bash
git tag v0.3.2
git push origin v0.3.2
```

Only publishing needs npm authorization. Public installs and `npx cutdex` do not.

Running bare `cutdex` shows the orange CutDex mark and only the essential connection commands. Subcommands stay quiet. The package post-install card still appears once after a successful download when the terminal exposes a session id. `cutdex start` binds to `127.0.0.1` by default; set `CUTDEX_HOST`, `CUTDEX_PROXY_PORT`, or `CUTDEX_DASHBOARD_PORT` only when you intentionally need a different local setup.

`pnpm benchmark:real` measures the configured HTTP optimizer path against a small live request set. It uses `CUTDEX_BENCHMARK_API_URL` (default `http://localhost:4318/optimize`) and optional `CUTDEX_API_KEY`, writes `benchmarks/results/real-latest.json`, and never calls a source database or fabricates provider billing.

## Develop

```bash
pnpm install
pnpm benchmark
pnpm benchmark:real
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm dev
```

`pnpm dev` runs the Vite site. `cutdex start` remains available for local development; the intended default user path is the local optimizer plus MCP connection. Hosted API credentials are optional.

The release gate is reproducible with `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm benchmark`, `pnpm audit --prod`, `pnpm build`, and `npm pack --dry-run`. GitHub CI also runs OSV dependency scanning and CodeQL.

## CLI

```text
cutdex login
cutdex logout
cutdex status
cutdex connect codex
cutdex disconnect codex
cutdex mcp
cutdex start
cutdex bench
cutdex analyze <traces.jsonl>
cutdex optimize <trace.json>
cutdex report
cutdex doctor
```

`cutdex connect codex` registers the MCP server and idempotently adds a marked Cutdex block to the global `AGENTS.md` under `CODEX_HOME` (or `~/.codex`). `cutdex disconnect codex` removes only that block and unregisters only the Cutdex MCP server.

`cutdex bench` runs a four-case local smoke test for safe reads, writes, unsupported shapes, and already-narrow requests. It never calls a provider and reports no billing or subscription savings.

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
