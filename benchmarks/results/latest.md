# Cutdex benchmark

Generated from 120 deterministic tasks across sql, issues, logs, control, already-optimal. This is a synthetic estimate, not provider telemetry.

| Measure | Baseline | Cutdex | Change |
| --- | ---: | ---: | ---: |
| Estimated fixture cost | $0.5032 | $0.1730 | **-65.6%** |
| Approximate tool-result tokens | 119,806 | 41,188 | **-65.6%** |
| Simulated returned bytes | 443,277 | 152,397 | **-65.6%** |
| Deterministic fixture success | 115/120 | 115/120 | **0pp** |

## Quality gate

PASS: the benchmark is publishable only when fixture task-success delta is at least -1.0pp.

## Method and limits

Baseline uses the broad fixture request. Cutdex applies conservative source-side narrowing. Costs are estimated using an illustrative pricing table (3/M input tokens, 15/M output tokens). The suite includes controls where optimization should not apply. It does not prove lower provider billing or increased subscription usage; that requires instrumented production traffic and before/after provider usage.
