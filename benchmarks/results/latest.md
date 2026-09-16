# Siftline benchmark

Generated from 120 deterministic tasks across sql, issues, logs, control, already-optimal.

| Measure | Baseline | Siftline | Change |
| --- | ---: | ---: | ---: |
| Estimated cost | $0.5032 | $0.1720 | **-65.8%** |
| Tool-result tokens | 119,806 | 40,944 | **-65.8%** |
| Returned bytes | 443,277 | 151,479 | **-65.8%** |
| Task success | 115/120 | 115/120 | **0pp** |

## Quality gate

PASS: the headline is publishable only when task-success delta is at least -1.0pp.

## Method

Baseline uses the broad fixture request. Siftline applies conservative source-side narrowing. Costs are estimated using the configurable illustrative pricing table (3/M input tokens, 15/M output tokens). The suite includes controls where optimization should not apply.
