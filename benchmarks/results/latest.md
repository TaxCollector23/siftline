# Cutdex benchmark

Generated from 120 deterministic treatment cases across sql, sql-aggregate, sql-unsupported, sql-ambiguous, control, write, graphql, structured-api, already-optimal. The baseline and treatment use the same task fixtures; treatment routes the read request through Cutdex before a deterministic fixture response is measured.

| Measure | Baseline | Cutdex | Change |
| --- | ---: | ---: | ---: |
| Approximate tool-result tokens | 5,377,870 | 1,006,770 | **-81.3%** |
| Returned fixture bytes | 21,511,170 | 4,026,770 | **-81.3%** |
| Task success | 115/120 | 115/120 | **0pp** |
| Requests modified | — | 70 | — |
| Safely unchanged | — | 50 | — |
| Median optimization latency | — | 0.008 ms | — |

## Method

The dataset covers broad SQL projections, implied predicates, sort and limit requests, aggregates, joins and unions that must pass through, GraphQL over-fetching, structured API-shaped reads, write operations, explicit all-field controls, and already-efficient requests. Each case records the task, original and optimized request, deterministic fixture bytes, approximate model-facing tool-result tokens, measured local optimization latency, task-success flags, modification state, safety, and reason.

Task success is a fixture correctness gate: baseline cases are known-good, and treatment must preserve fields explicitly requested by the task. Token estimates use ceil(UTF-8 returned bytes / 4), not provider billing. The benchmark does not claim lower provider charges, more subscription usage, or performance against a real database/API.

## Quality gate

PASS: publishable runs require treatment task success to remain within 1.0 percentage point of baseline.
