# Cutdex benchmark

Generated from 120 deterministic treatment cases across sql, sql-aggregate, sql-unsupported, sql-ambiguous, control, write, graphql, structured-api, already-optimal. The baseline and treatment use the same task fixtures; treatment routes the read request through Cutdex before a deterministic fixture response is measured.

| Measure | Baseline | Cutdex | Change |
| --- | ---: | ---: | ---: |
| Approximate tool-result tokens | 5,377,870 | 978,070 | **-81.8%** |
| Approximate request + result context | 5,383,330 | 984,190 | **-81.7%** |
| Approximate request tokens only | 5,460 | 6,120 | **+12.1%** |
| Estimated input cost at $3/M | $16.15 | $2.95 | **-$13.20** |
| Returned fixture bytes | 21,511,170 | 3,911,970 | **-81.8%** |
| Task success | 115/120 | 115/120 | **0pp** |
| Requests modified | — | 70 | — |
| Safely unchanged | — | 50 | — |
| Median optimization latency | — | 0.008 ms | — |

## Method

The dataset covers broad SQL projections, implied predicates, sort and limit requests, aggregates, joins and unions that must pass through, GraphQL over-fetching, structured API-shaped reads, write operations, explicit all-field controls, and already-efficient requests. Each case records the task, original and optimized request, deterministic fixture bytes, approximate request and tool-result tokens, measured local optimization latency, task-success flags, modification state, safety, and reason.

Task success is a fixture correctness gate: baseline cases are known-good, and treatment must preserve fields explicitly requested by the task. Context estimates use ceil(UTF-8 JSON bytes / 4), not provider billing. The context figure includes only the task/tool/request envelope and returned fixture result; it excludes system prompts, conversation history, model reasoning, generated output, and provider tokenization. The benchmark does not claim lower provider charges, more subscription usage, or performance against a real database/API.

## Quality gate

PASS: publishable runs require treatment task success to remain within 1.0 percentage point of baseline.
