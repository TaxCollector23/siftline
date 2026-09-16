# Connect Codex

Official Codex clients support local STDIO MCP servers. Siftline uses that connection as an explicit request optimizer.

```bash
npx siftline@latest login
siftline connect codex
```

The second command registers:

```bash
codex mcp add siftline -- npx -y siftline@latest mcp
```

Restart Codex and run `/mcp` to verify the server. Before a broad read-only SQL or GraphQL-style call, Codex can call `siftline_optimize`, then execute the returned `optimizedRequest` with the original source tool.

Important boundary: MCP adds a tool. It does not silently intercept Codex's built-in shell, browser, filesystem, or other MCP servers. Automatic interception requires an application-level middleware adapter around the actual tool executor.
