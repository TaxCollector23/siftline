# Safety model

Cutdex only rewrites tools explicitly classified as read-only. `WRITE` and `UNKNOWN` tools pass through unchanged. If the SQL parser cannot build a safe AST, the request is preserved. GraphQL rewrites are limited to a simple single-root selection set; aliases, arguments, fragments, directives, multiple roots, and deeper nesting pass through so the response shape cannot be silently flattened. Every applied pass includes a reason, before/after request, confidence, and expected benefit.

The optimizer does not know a source schema unless the adapter supplies one. Treat inferred SQL field names and predicates as an optimization candidate and keep a source-side error/fallback path. For the strongest boundary, use `executeWithCutdex` in the adapter that owns execution and only return the compacted result to the model.
