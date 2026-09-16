import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { optimizeToolCall, type OptimizeInput, type OptimizationResult } from "@siftline/core";

const version = "0.2.0";
const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dashboardPort = 4317;
const proxyPort = 4318;
const defaultApiUrl = "https://siftline-omega.vercel.app";
let bannerPrinted = false;

interface Config { apiUrl: string; apiKey?: string; keyName?: string; keyLastFour?: string }

function configPath(): string {
  return join(process.env.SIFTLINE_CONFIG_DIR ?? join(homedir(), ".config", "siftline"), "config.json");
}

function readConfig(): Config {
  const path = configPath();
  if (!existsSync(path)) return { apiUrl: process.env.SIFTLINE_API_URL ?? defaultApiUrl };
  try { const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<Config>; return { ...parsed, apiUrl: parsed.apiUrl ?? defaultApiUrl } }
  catch { return { apiUrl: process.env.SIFTLINE_API_URL ?? defaultApiUrl } }
}

function writeConfig(config: Config): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function printBanner(): void {
  if (bannerPrinted || !process.stdout.isTTY) return;
  bannerPrinted = true;
  console.log("\u001b[38;2;236;100;61m╭──────────────────────────────────────────╮\n│  Siftline                                │\n│  source-side request optimizer           │\n╰──────────────────────────────────────────╯\u001b[0m\n");
}

function json(res: ServerResponse, value: unknown, status = 200): void {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(value));
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => { let value = ""; req.on("data", (chunk) => { value += chunk; if (value.length > 64_000) req.destroy(new Error("request too large")) }); req.on("end", () => resolveBody(value)); req.on("error", reject) });
}

async function hostedOptimize(input: OptimizeInput, config = readConfig()): Promise<OptimizationResult> {
  if (!config.apiKey) throw new Error("Not logged in. Run `siftline login` first.");
  const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/api/v1/optimize`, { method: "POST", headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify(input) });
  const result = await response.json() as OptimizationResult & { message?: string };
  if (!response.ok) throw new Error(result.message ?? `Siftline API returned ${response.status}`);
  return result;
}

function proxy(): ReturnType<typeof createServer> {
  return createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") return json(res, { ok: true, service: "siftline-proxy", mode: readConfig().apiKey ? "hosted" : "local-development" });
    if (req.method === "POST" && req.url === "/optimize") {
      try { const input = JSON.parse(await body(req)) as OptimizeInput; const config = readConfig(); return json(res, config.apiKey ? await hostedOptimize(input, config) : optimizeToolCall(input)) }
      catch (error) { return json(res, { error: "optimization_failed", message: error instanceof Error ? error.message : "Invalid request" }, 400) }
    }
    return json(res, { error: "not_found" }, 404);
  });
}

function dashboard(): ReturnType<typeof createServer> {
  const dist = join(root, "apps/web/dist");
  return createServer((req, res) => {
    if (req.url === "/api/status") return json(res, { service: "siftline", proxy: `http://localhost:${proxyPort}`, dashboard: `http://localhost:${dashboardPort}`, hosted: Boolean(readConfig().apiKey) });
    const file = req.url === "/" ? "/index.html" : req.url ?? "/index.html";
    const path = join(dist, file.replace(/\.\.+/g, "").replace(/^\//, ""));
    if (existsSync(path)) { res.writeHead(200, { "content-type": path.endsWith(".html") ? "text/html" : "text/plain" }); res.end(readFileSync(path)); return }
    if (existsSync(join(dist, "index.html"))) { res.writeHead(200, { "content-type": "text/html" }); res.end(readFileSync(join(dist, "index.html"))); return }
    res.writeHead(200, { "content-type": "text/plain" }); res.end("Build the dashboard with pnpm --dir apps/web build, then run siftline start.");
  });
}

async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) { process.stdout.write(prompt); return await new Promise((resolveInput) => { process.stdin.once("data", (data) => resolveInput(String(data).trim())) }) }
  process.stdout.write(prompt); process.stdin.setRawMode(true); process.stdin.resume();
  return await new Promise((resolveInput, reject) => {
    let value = "";
    const onData = (data: Buffer) => {
      const input = data.toString("utf8");
      if (input === "\u0003") { process.stdin.setRawMode(false); process.stdin.pause(); reject(new Error("Login cancelled.")); return }
      if (input === "\r" || input === "\n") { process.stdin.off("data", onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n"); resolveInput(value.trim()); return }
      if (input === "\u007f") { value = value.slice(0, -1); return }
      value += input;
    };
    process.stdin.on("data", onData);
  });
}

async function login(passedKey?: string): Promise<void> {
  const apiKey = passedKey?.trim() || await readSecret("Paste your Siftline API key: ");
  if (!apiKey) throw new Error("No API key provided.");
  const current = readConfig();
  const response = await fetch(`${current.apiUrl.replace(/\/$/, "")}/api/v1/auth/verify`, { headers: { authorization: `Bearer ${apiKey}` } });
  const result = await response.json() as { message?: string; key?: { name: string; lastFour: string } };
  if (!response.ok || !result.key) throw new Error(result.message ?? "The API key could not be verified.");
  writeConfig({ ...current, apiKey, keyName: result.key.name, keyLastFour: result.key.lastFour });
  console.log(`Logged in with ${result.key.name} (…${result.key.lastFour}).\nNext: siftline connect codex`);
}

async function status(): Promise<void> {
  const config = readConfig();
  if (!config.apiKey) { console.log("Not logged in. Run `siftline login`."); return }
  const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/api/v1/auth/verify`, { headers: { authorization: `Bearer ${config.apiKey}` } });
  const result = await response.json() as { message?: string; key?: { name: string; lastFour: string }; limits?: { remainingMinute: number; remainingMonth: number } };
  if (!response.ok || !result.key) throw new Error(result.message ?? "Could not reach Siftline.");
  console.log(`API         ${config.apiUrl}\nCredential  ${result.key.name} (…${result.key.lastFour})\nMinute left ${result.limits?.remainingMinute ?? "unknown"}\nMonth left  ${result.limits?.remainingMonth ?? "unknown"}`);
}

function connect(agent: string | undefined): void {
  if (agent !== "codex") throw new Error("v0.2 supports `siftline connect codex`. More adapters will follow the stable proxy contract.");
  if (!readConfig().apiKey) throw new Error("Run `siftline login` before connecting an agent.");
  const command = "codex mcp add siftline -- npx -y siftline@latest mcp";
  if (process.env.SIFTLINE_CONNECT_DRY_RUN === "1") { console.log(command); return }
  const result = spawnSync("codex", ["mcp", "add", "siftline", "--", "npx", "-y", "siftline@latest", "mcp"], { stdio: "inherit" });
  if (result.error || result.status !== 0) { console.log(`Run this command manually:\n${command}`); throw new Error("Codex MCP registration did not complete.") }
  console.log("Siftline is registered with Codex. Restart Codex, then run `/mcp` to verify it.");
}

function sendMcp(message: unknown): void { process.stdout.write(`${JSON.stringify(message)}\n`) }

async function mcp(): Promise<void> {
  process.stdin.setEncoding("utf8"); let buffer = "";
  process.stdin.on("data", async (chunk: string) => {
    buffer += chunk; const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const request = JSON.parse(line) as { jsonrpc: string; id?: string | number; method: string; params?: { name?: string; arguments?: OptimizeInput } };
        if (request.method === "notifications/initialized") continue;
        if (request.method === "initialize") { sendMcp({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "siftline", version }, instructions: "Before broad read-only SQL or GraphQL-style tool calls, call siftline_optimize, then execute optimizedRequest with the original source tool. Never use this for writes or unknown operations. Siftline does not intercept built-in tools automatically." } }); continue }
        if (request.method === "tools/list") { sendMcp({ jsonrpc: "2.0", id: request.id, result: { tools: [{ name: "siftline_optimize", description: "Narrow a read-only SQL or GraphQL-style tool request before it is sent to the source.", inputSchema: { type: "object", required: ["task", "tool", "request"], properties: { task: { type: "string" }, tool: { type: "object", required: ["name", "readOnly"], properties: { name: { type: "string" }, kind: { enum: ["READ", "WRITE", "UNKNOWN"] }, readOnly: { type: "boolean" } } }, request: { type: "object", properties: { query: { type: "string" } }, additionalProperties: true }, mode: { enum: ["conservative", "aggressive"] } } } }] } }); continue }
        if (request.method === "tools/call" && request.params?.name === "siftline_optimize" && request.params.arguments) { const result = await hostedOptimize(request.params.arguments); sendMcp({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result } }); continue }
        if (request.method === "ping") { sendMcp({ jsonrpc: "2.0", id: request.id, result: {} }); continue }
        if (request.id !== undefined) sendMcp({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
      } catch (error) { sendMcp({ jsonrpc: "2.0", id: null, error: { code: -32603, message: error instanceof Error ? error.message : "Internal error" } }) }
    }
  });
}

function help(): void {
  console.log("Usage:\n  siftline login\n  siftline logout\n  siftline status\n  siftline connect codex\n  siftline mcp\n  siftline start\n  siftline bench\n  siftline analyze <traces.jsonl>\n  siftline explain <trace.json>\n  siftline report\n  siftline doctor");
}

function analyze(target: string): void {
  const traces = readFileSync(resolve(target), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as { tool?: { name?: string }; request?: { query?: string } });
  const byTool = new Map<string, number>(); let fields = 0;
  for (const trace of traces) { const name = trace.tool?.name ?? "unknown"; byTool.set(name, (byTool.get(name) ?? 0) + 1); fields += trace.request?.query?.split(/\s+/).filter((token) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(token)).length ?? 0 }
  console.log(`Calls analyzed: ${traces.length}\nAverage query identifiers: ${traces.length ? (fields / traces.length).toFixed(1) : "0.0"}\n\nTools:`);
  for (const [name, count] of byTool) console.log(`  ${name} · ${count} calls`);
  console.log("\nThese are candidates for validation, not proof of causality.");
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "--help";
  if (command === "mcp") { await mcp(); return }
  printBanner();
  if (command === "--help" || command === "help") { help(); return }
  if (command === "login") { await login(process.argv[3]); return }
  if (command === "logout") { const config = readConfig(); writeConfig({ apiUrl: config.apiUrl }); console.log("Logged out. Your local Siftline credential was removed."); return }
  if (command === "status") { await status(); return }
  if (command === "connect") { connect(process.argv[3]); return }
  if (command === "doctor") { const config = readConfig(); console.log(`Node        ${process.version}\nAPI         ${config.apiUrl}\nCredential  ${config.apiKey ? `configured (…${config.keyLastFour ?? "????"})` : "missing"}\nProxy port  ${proxyPort}\nDashboard   ${dashboardPort}`); return }
  if (command === "bench") { console.log("Run `pnpm benchmark` from the repository to regenerate benchmark artifacts."); return }
  if (command === "report") { const report = join(root, "benchmarks/results/latest.md"); console.log(existsSync(report) ? readFileSync(report, "utf8") : "No generated benchmark report found. Run pnpm benchmark."); return }
  if (command === "analyze") { const target = process.argv[3]; if (!target) throw new Error("Provide a JSONL trace path."); analyze(target); return }
  if (command === "explain") { const target = process.argv[3]; if (!target) throw new Error("Provide a trace JSON path."); const trace = JSON.parse(readFileSync(resolve(target), "utf8")) as OptimizeInput; console.log(JSON.stringify(optimizeToolCall(trace), null, 2)); return }
  if (command !== "start") { help(); return }
  const config = readConfig(); const proxyServer = proxy().listen(proxyPort); const dashboardServer = dashboard().listen(dashboardPort);
  console.log(`Proxy      http://localhost:${proxyPort}\nDashboard  http://localhost:${dashboardPort}\nMode       ${config.apiKey ? "hosted API" : "local development"}\n\nWaiting for agent traffic...`);
  const close = () => { proxyServer.close(); dashboardServer.close(); process.exit(0) };
  process.on("SIGINT", close); process.on("SIGTERM", close);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1) });
