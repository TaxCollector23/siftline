# Trace format

Traces are JSON or JSONL objects with `id`, `task`, `tool`, `request`, optional `response`, optional `usage`, and an ISO `timestamp`. The request can contain a `query` string or future structured adapter fields.

To measure real run savings, record two traces with the same `id`, one with `variant: "baseline"` and one with `variant: "cutdex"`. Each `usage` object should contain the provider-reported `inputTokens` and `outputTokens` (snake_case `input_tokens` and `output_tokens` are accepted too):

```jsonl
{"id":"run-001","variant":"baseline","task":"Find failed orders","tool":{"name":"database.query","kind":"READ","readOnly":true},"request":{"query":"SELECT * FROM orders"},"usage":{"inputTokens":120000,"outputTokens":1800},"timestamp":"2026-09-20T00:00:00Z"}
{"id":"run-001","variant":"cutdex","task":"Find failed orders","tool":{"name":"database.query","kind":"READ","readOnly":true},"request":{"query":"SELECT id,status FROM orders WHERE status='failed' LIMIT 5"},"usage":{"inputTokens":28000,"outputTokens":1800},"timestamp":"2026-09-20T00:00:03Z"}
```

Run `cutdex analyze traces.jsonl --input-price 3 --output-price 15` to see input, output, total-token, and estimated cost deltas. Without paired provider usage, Cutdex can only report candidates and fixture estimates; it cannot claim actual billing savings.
