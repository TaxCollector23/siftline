# Architecture

The core receives a task, a tool descriptor, and a request. A safety gate classifies the operation, then independent passes operate on a parsed request AST. The result contains the original request, optimized request, applied/skipped passes, estimated savings, confidence, and explanation. The CLI wraps that core with a tiny local HTTP proxy and serves the static dashboard.
