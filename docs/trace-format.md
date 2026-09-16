# Trace format

Traces are JSON or JSONL objects with `id`, `task`, `tool`, `request`, optional `response`, optional `usage`, and an ISO `timestamp`. The request can contain a `query` string or future structured adapter fields.
