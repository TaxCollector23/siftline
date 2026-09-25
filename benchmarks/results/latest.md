# Cutdex benchmark

Generated from 120 deterministic treatment cases across sql, sql-aggregate, sql-unsupported, sql-ambiguous, control, write, graphql, structured-api, already-optimal. The baseline and treatment use the same task fixtures; treatment routes the read request through Cutdex before a deterministic fixture response is measured.

| Measure | Baseline | Cutdex | Change |
| --- | ---: | ---: | ---: |
| Approximate tool-result tokens | 5,377,870 | 978,070 | **-81.8%** |
| Approximate request + result context | 5,383,330 | 984,190 | **-81.7%** |
| Approximate request tokens only | 5,460 | 6,120 | **+12.1%** |
| API-style input estimate at illustrative $3/M | $16.15 | $2.95 | **-$13.20** |
| Returned fixture bytes | 21,511,170 | 3,911,970 | **-81.8%** |
| Task success | 115/120 | 115/120 | **0pp** |
| Requests modified | — | 70 | — |
| Safely unchanged | — | 50 | — |
| Median optimization latency | — | 0.009 ms | — |

## Official API rate sensitivity

Rates below were manually verified on 2026-09-25 from [OpenAI's API pricing page](https://developers.openai.com/api/docs/pricing). They show input-only spend for this fixture at each model's standard short-context rate; output, cache hits, tool-call fees, and subscription allowances are excluded.

| Model | Input / 1M | Baseline | Cutdex | Modeled input saved |
| --- | ---: | ---: | ---: | ---: |
| GPT-6 Astra | $10 | $53.83 | $9.84 | **$43.99** |
| GPT-6 Sol | $2 | $10.77 | $1.97 | **$8.80** |
| GPT-6 Luna | $0.1 | $0.54 | $0.10 | **$0.44** |
| GPT-5.6 Sol | $4 | $21.53 | $3.94 | **$17.60** |
| GPT-5.3 Codex | $3.5 | $18.84 | $3.44 | **$15.40** |

## Method

The dataset covers broad SQL projections, implied predicates, sort and limit requests, aggregates, joins and unions that must pass through, GraphQL over-fetching, structured API-shaped reads, write operations, explicit all-field controls, and already-efficient requests. Each case records the task, original and optimized request, deterministic fixture bytes, approximate request and tool-result tokens, measured local optimization latency, task-success flags, modification state, safety, and reason.

Task success is a fixture correctness gate: baseline cases are known-good, and treatment must preserve fields explicitly requested by the task. Context estimates use ceil(UTF-8 JSON bytes / 4), not provider billing. The context figure includes only the task/tool/request envelope and returned fixture result; it excludes system prompts, conversation history, model reasoning, generated output, and provider tokenization. The benchmark does not claim lower provider charges, more subscription usage, or performance against a real database/API.

## Billing boundary

The API-style estimate is calculated as `5,383,330 / 1,000,000 × $3 = $16.15` before Cutdex and `984,190 / 1,000,000 × $3 = $2.95` after Cutdex. The modeled difference is **$13.20 (81.7%)**, using an illustrative input-only rate. The official model table above changes the dollar estimate without changing the measured token reduction. ChatGPT-authenticated Codex uses a plan allowance rather than this API price; subscription usage is intentionally **not measured** here.

## Quality gate

PASS: publishable runs require treatment task success to remain within 1.0 percentage point of baseline.
