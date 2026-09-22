import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { optimizeToolCall, type OptimizeInput, type OptimizationResult } from "@siftline/core";

const version = "0.3.0";
const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dashboardPort = 4317;
const proxyPort = 4318;
const defaultApiUrl = "https://siftline-omega.vercel.app";
let bannerPrinted = false;

interface Config { apiUrl: string; apiKey?: string; keyName?: string; keyLastFour?: string }

function configPath(): string {
  return join(process.env.CUTDEX_CONFIG_DIR ?? process.env.SIFTLINE_CONFIG_DIR ?? join(homedir(), ".config", "cutdex"), "config.json");
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
  console.log("\u001b[38;2;236;100;61m╭──────────────────────────────────────────╮\n│  Cutdex                                  │\n│  local Codex context optimizer            │\n╰──────────────────────────────────────────╯\u001b[0m\n");
}

function useHostedApi(): boolean { return process.env.CUTDEX_USE_HOSTED_API === "1" || process.env.SIFTLINE_USE_HOSTED_API === "1" }
function billingBoundary() { return { optimizer: "local", openaiApiCalls: 0, modelExecution: "delegated_to_codex_client", note: "Cutdex does not select a model or call the OpenAI API. Confirm the Codex client sign-in and allowance with /status." } }

function json(res: ServerResponse, value: unknown, status = 200): void {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(value));
}

function contentType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => { let value = ""; req.on("data", (chunk) => { value += chunk; if (value.length > 64_000) req.destroy(new Error("request too large")) }); req.on("end", () => resolveBody(value)); req.on("error", reject) });
}

async function hostedOptimize(input: OptimizeInput, config = readConfig()): Promise<OptimizationResult> {
  if (!config.apiKey) throw new Error("Hosted mode is enabled but no key is configured. Use local mode or run `cutdex login`.");
  const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/api/v1/optimize`, { method: "POST", headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify(input) });
  const result = await response.json() as OptimizationResult & { message?: string };
  if (!response.ok) throw new Error(result.message ?? `Siftline API returned ${response.status}`);
  return result;
}

function proxy(): ReturnType<typeof createServer> {
  return createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") return json(res, { ok: true, service: "cutdex-proxy", mode: useHostedApi() ? "hosted-opt-in" : "local", openaiApiCalls: 0 });
    if (req.method === "POST" && req.url === "/optimize") {
      try { const input = JSON.parse(await body(req)) as OptimizeInput; const config = readConfig(); return json(res, useHostedApi() ? await hostedOptimize(input, config) : optimizeToolCall(input)) }
      catch (error) { return json(res, { error: "optimization_failed", message: error instanceof Error ? error.message : "Invalid request" }, 400) }
    }
    return json(res, { error: "not_found" }, 404);
  });
}

function dashboard(): ReturnType<typeof createServer> {
  const dist = join(root, "apps/web/dist");
  return createServer((req, res) => {
    if (req.url === "/api/status") return json(res, { service: "cutdex", proxy: `http://localhost:${proxyPort}`, dashboard: `http://localhost:${dashboardPort}`, mode: useHostedApi() ? "hosted" : "local", billing: billingBoundary() });
    const file = req.url === "/" ? "/index.html" : req.url ?? "/index.html";
    const path = join(dist, file.replace(/\.\.+/g, "").replace(/^\//, ""));
    if (existsSync(path)) { res.writeHead(200, { "content-type": contentType(path) }); res.end(readFileSync(path)); return }
    if (existsSync(join(dist, "index.html"))) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(readFileSync(join(dist, "index.html"))); return }
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
  console.log(`Logged in with ${result.key.name} (…${result.key.lastFour}).\nHosted mode is optional; local mode remains the default. Next: cutdex connect codex`);
}

async function status(): Promise<void> {
  const config = readConfig();
  if (!config.apiKey) { console.log("Local mode\nOptimizer   local, no OpenAI API calls\nModel use   delegated to the Codex client\nNext        cutdex connect codex"); return }
  const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/api/v1/auth/verify`, { headers: { authorization: `Bearer ${config.apiKey}` } });
  const result = await response.json() as { message?: string; key?: { name: string; lastFour: string }; limits?: { remainingMinute: number; remainingMonth: number } };
  if (!response.ok || !result.key) throw new Error(result.message ?? "Could not reach Siftline.");
  console.log(`API         ${config.apiUrl}\nCredential  ${result.key.name} (…${result.key.lastFour})\nMinute left ${result.limits?.remainingMinute ?? "unknown"}\nMonth left  ${result.limits?.remainingMonth ?? "unknown"}\nMode        hosted only when CUTDEX_USE_HOSTED_API=1`);
}

function connect(agent: string | undefined): void {
  if (agent !== "codex") throw new Error("v0.3 supports `cutdex connect codex`. More adapters will follow the stable proxy contract.");
  const command = "codex mcp add cutdex -- npx -y cutdex@latest mcp";
  if (process.env.SIFTLINE_CONNECT_DRY_RUN === "1") { console.log(command); return }
  const result = spawnSync("codex", ["mcp", "add", "siftline", "--", "npx", "-y", "siftline@latest", "mcp"], { stdio: "inherit" });
  if (result.error || result.status !== 0) { console.log(`Run this command manually:\n${command}`); throw new Error("Codex MCP registration did not complete.") }
  console.log("Cutdex is registered with Codex. Restart Codex, then run `/mcp` to verify it. The optimizer runs locally and makes no OpenAI API calls.");
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
        if (request.method === "initialize") { sendMcp({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "cutdex", version }, instructions: "Before broad read-only SQL or GraphQL-style tool calls, call cutdex_optimize, then execute optimizedRequest with the original source tool. Cutdex runs locally, makes no OpenAI API calls, and cannot intercept built-in tools automatically." } }); continue }
        if (request.method === "tools/list") { sendMcp({ jsonrpc: "2.0", id: request.id, result: { tools: [{ name: "cutdex_optimize", description: "Locally narrow a read-only SQL or GraphQL-style tool request before it is sent to the source. No model or OpenAI API call is made.", inputSchema: { type: "object", required: ["task", "tool", "request"], properties: { task: { type: "string" }, tool: { type: "object", required: ["name", "readOnly"], properties: { name: { type: "string" }, kind: { enum: ["READ", "WRITE", "UNKNOWN"] }, readOnly: { type: "boolean" } } }, request: { type: "object", properties: { query: { type: "string" } }, additionalProperties: true }, mode: { enum: ["conservative", "aggressive"] } } } }] } }); continue }
        if (request.method === "tools/call" && request.params?.name === "cutdex_optimize" && request.params.arguments) { const result = useHostedApi() ? await hostedOptimize(request.params.arguments) : optimizeToolCall(request.params.arguments); const payload = { ...result, billingBoundary: billingBoundary() }; sendMcp({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload } }); continue }
        if (request.method === "ping") { sendMcp({ jsonrpc: "2.0", id: request.id, result: {} }); continue }
        if (request.id !== undefined) sendMcp({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
      } catch (error) { sendMcp({ jsonrpc: "2.0", id: null, error: { code: -32603, message: error instanceof Error ? error.message : "Internal error" } }) }
    }
  });
}

function help(): void {
  console.log("Usage:\n  cutdex login                 optional hosted quota credential\n  cutdex logout\n  cutdex status\n  cutdex connect codex         local-first MCP setup\n  cutdex mcp\n  cutdex start\n  cutdex bench\n  cutdex analyze <traces.jsonl>\n  cutdex explain <trace.json>\n  cutdex report\n  cutdex doctor");
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
  if (command === "logout") { const config = readConfig(); writeConfig({ apiUrl: config.apiUrl }); console.log("Logged out. Local Cutdex mode remains available."); return }
  if (command === "status") { await status(); return }
  if (command === "connect") { connect(process.argv[3]); return }
  if (command === "doctor") { const config = readConfig(); console.log(`Node        ${process.version}\nMode        ${useHostedApi() ? "hosted opt-in" : "local default"}\nOptimizer   local, no OpenAI API calls\nModel use   delegated to the Codex client\nCredential  ${config.apiKey ? `configured (…${config.keyLastFour ?? "????"})` : "not required"}\nProxy port  ${proxyPort}\nDashboard   ${dashboardPort}`); return }
  if (command === "bench") { console.log("Run `pnpm benchmark` from the repository to regenerate benchmark artifacts."); return }
  if (command === "report") { const report = join(root, "benchmarks/results/latest.md"); console.log(existsSync(report) ? readFileSync(report, "utf8") : "No generated benchmark report found. Run pnpm benchmark."); return }
  if (command === "analyze") { const target = process.argv[3]; if (!target) throw new Error("Provide a JSONL trace path."); analyze(target); return }
  if (command === "explain") { const target = process.argv[3]; if (!target) throw new Error("Provide a trace JSON path."); const trace = JSON.parse(readFileSync(resolve(target), "utf8")) as OptimizeInput; console.log(JSON.stringify(optimizeToolCall(trace), null, 2)); return }
  if (command !== "start") { help(); return }
  const proxyServer = proxy().listen(proxyPort); const dashboardServer = dashboard().listen(dashboardPort);
  console.log(`Proxy      http://localhost:${proxyPort}\nDashboard  http://localhost:${dashboardPort}\nMode       ${useHostedApi() ? "hosted opt-in" : "local default"}\nBilling    optimizer makes no OpenAI API calls\n\nWaiting for agent traffic...`);
  const close = () => { proxyServer.close(); dashboardServer.close(); process.exit(0) };
  process.on("SIGINT", close); process.on("SIGTERM", close);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1) });
