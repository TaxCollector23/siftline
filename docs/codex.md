# Connect Codex

Codex supports local STDIO MCP servers. Cutdex uses that connection as an explicit request optimizer.

```bash
node dist/cli/index.js login
node dist/cli/index.js connect codex
```

The second command registers the exact built CLI executable:

```bash
codex mcp add cutdex -- node /path/to/cutdex/dist/cli/index.js mcp
```

Restart Codex and run `/mcp` to verify the server. Before a broad read-only SQL or GraphQL-style call, Codex can call `cutdex_optimize`, then execute the returned `optimizedRequest` with the original source tool. The MCP response is intentionally compact: it omits the unchanged original request and returns only the optimized request plus the passes that justify it.

`cutdex connect codex` also installs a clearly marked, repeat-safe block in the global `AGENTS.md` inside `CODEX_HOME` (or `~/.codex`). To remove the integration later:

```bash
cutdex disconnect codex
```

Disconnect removes only Cutdex's MCP registration and managed instruction block; unrelated Codex configuration and instructions are preserved.

Important boundary: MCP adds a tool. It does not silently intercept Codex's built-in shell, browser, filesystem, or other MCP servers. Automatic interception requires an application-level middleware adapter around the actual tool executor. Without a hosted key, `cutdex mcp` runs the same optimizer locally, so the integration is useful in development without an account.
