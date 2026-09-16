# Safety model

Siftline only rewrites tools explicitly classified as read-only. `WRITE` and `UNKNOWN` tools pass through unchanged. If the SQL parser cannot build a safe AST, the request is preserved. Every applied pass includes a reason, before/after request, confidence, and expected benefit.
