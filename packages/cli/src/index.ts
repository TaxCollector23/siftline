import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { optimizeToolCall, type OptimizeInput, type OptimizationResult } from "@cutdex/core";
import { agentsPath, codexHome, codexInstalled, cutdexMcpName, cutdexMcpRegistered, hasCutdexInstructions, installCutdexInstructions, removeCutdexInstructions } from "./codex.js";

const version = "0.3.0";
const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dashboardPort = 4317;
const proxyPort = 4318;
const defaultApiUrl = "https://siftline-omega.vercel.app";
let bannerPrinted = false;

interface Config { apiUrl: string; apiKey?: string; keyName?: string; keyLastFour?: string }

function configPath(): string {
  return join(process.env.CUTDEX_CONFIG_DIR ?? join(homedir(), ".config", "cutdex"), "config.json");
}

function readConfig(): Config {
  const path = configPath();
  if (!existsSync(path)) return { apiUrl: process.env.CUTDEX_API_URL ?? defaultApiUrl };
  try { const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<Config>; return { ...parsed, apiUrl: parsed.apiUrl ?? defaultApiUrl } }
  catch { return { apiUrl: process.env.CUTDEX_API_URL ?? defaultApiUrl } }
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
  console.log("\u001b[38;2;236;100;61m╭──────────────────────────────────────────╮\n│  Cutdex                                  │\n│  source-side request optimizer           │\n╰──────────────────────────────────────────╯\u001b[0m\n");
}

function json(res: ServerResponse, value: unknown, status = 200): void {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(value));
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => { let value = ""; req.on("data", (chunk) => { value += chunk; if (value.length > 64_000) req.destroy(new Error("request too large")) }); req.on("end", () => resolveBody(value)); req.on("error", reject) });
}

async function hostedOptimize(input: OptimizeInput, config = readConfig()): Promise<OptimizationResult> {
  if (!config.apiKey) throw new Error("Not logged in. Run `cutdex login` first.");
  const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/api/v1/optimize`, { method: "POST", headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify(input) });
  const result = await response.json() as OptimizationResult & { message?: string };
  if (!response.ok) throw new Error(result.message ?? `Cutdex API returned ${response.status}`);
  return result;
}

async function optimize(input: OptimizeInput): Promise<OptimizationResult> {
  const config = readConfig();
  return config.apiKey ? hostedOptimize(input, config) : optimizeToolCall(input);
}

function compactMcpResult(result: OptimizationResult): Record<string, unknown> {
  const passes = result.applied.map(({ name, reason }) => ({ name, reason }));
  return {
    optimizedRequest: result.optimizedRequest,
    changed: result.applied.length > 0,
    safety: result.safety,
    confidence: result.confidence,
    ...(passes.length ? { passes } : { reason: result.explanation[0] ?? "No safe transformation found." }),
  };
}

function proxy(): ReturnType<typeof createServer> {
  return createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") return json(res, { ok: true, service: "cutdex-proxy", mode: readConfig().apiKey ? "hosted" : "local-development" });
    if (req.method === "POST" && req.url === "/optimize") {
      try { const input = JSON.parse(await body(req)) as OptimizeInput; return json(res, await optimize(input)) }
      catch (error) { return json(res, { error: "optimization_failed", message: error instanceof Error ? error.message : "Invalid request" }, 400) }
    }
    return json(res, { error: "not_found" }, 404);
  });
}

function dashboard(): ReturnType<typeof createServer> {
  const dist = join(root, "apps/web/dist");
  return createServer((req, res) => {
    if (req.url === "/api/status") return json(res, { service: "cutdex", proxy: `http://localhost:${proxyPort}`, dashboard: `http://localhost:${dashboardPort}`, hosted: Boolean(readConfig().apiKey) });
    const file = req.url === "/" ? "/index.html" : req.url ?? "/index.html";
    const path = join(dist, file.replace(/\.\.+/g, "").replace(/^\//, ""));
    if (existsSync(path)) { res.writeHead(200, { "content-type": path.endsWith(".html") ? "text/html" : "text/plain" }); res.end(readFileSync(path)); return }
    if (existsSync(join(dist, "index.html"))) { res.writeHead(200, { "content-type": "text/html" }); res.end(readFileSync(join(dist, "index.html"))); return }
    res.writeHead(200, { "content-type": "text/plain" }); res.end("Build the dashboard with pnpm --dir apps/web build, then run cutdex start.");
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
  const apiKey = passedKey?.trim() || await readSecret("Paste your Cutdex API key: ");
  if (!apiKey) throw new Error("No API key provided.");
  const current = readConfig();
  const response = await fetch(`${current.apiUrl.replace(/\/$/, "")}/api/v1/auth/verify`, { headers: { authorization: `Bearer ${apiKey}` } });
  const result = await response.json() as { message?: string; key?: { name: string; lastFour: string } };
  if (!response.ok || !result.key) throw new Error(result.message ?? "The API key could not be verified.");
  writeConfig({ ...current, apiKey, keyName: result.key.name, keyLastFour: result.key.lastFour });
  console.log(`Logged in with ${result.key.name} (…${result.key.lastFour}).\nNext: cutdex connect codex`);
}

async function status(): Promise<void> {
  const config = readConfig();
  if (!config.apiKey) { console.log("Not logged in. Local MCP mode is available; run `cutdex login` to use the hosted API."); return }
  const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/api/v1/auth/verify`, { headers: { authorization: `Bearer ${config.apiKey}` } });
  const result = await response.json() as { message?: string; key?: { name: string; lastFour: string }; limits?: { remainingMinute: number; remainingMonth: number } };
  if (!response.ok || !result.key) throw new Error(result.message ?? "Could not reach Cutdex.");
  console.log(`API         ${config.apiUrl}\nCredential  ${result.key.name} (…${result.key.lastFour})\nMinute left ${result.limits?.remainingMinute ?? "unknown"}\nMonth left  ${result.limits?.remainingMonth ?? "unknown"}`);
}

function mcpLauncher(): { command: string; args: string[]; display: string } {
  const entry = resolve(fileURLToPath(import.meta.url));
  if (!entry.toLowerCase().endsWith(".js")) throw new Error("Build the CLI before connecting Codex: run `pnpm build:cli`, then retry with the built CLI.");
  const args = [entry, "mcp"];
  const quote = (value: string) => /\s/.test(value) ? `"${value}"` : value;
  return { command: process.execPath, args, display: [process.execPath, ...args].map(quote).join(" ") };
}

function connect(agent: string | undefined): void {
  if (agent !== "codex") throw new Error("v0.3 supports `cutdex connect codex`. More adapters will follow the stable proxy contract.");
  const mode = readConfig().apiKey ? "hosted API" : "local optimizer";
  const home = codexHome();
  const launcher = mcpLauncher();
  const command = `codex mcp add ${cutdexMcpName} -- ${launcher.display}`;
  if (process.env.CUTDEX_CONNECT_DRY_RUN === "1") { console.log(`${command}\nMode: ${mode}\nCODEX_HOME: ${home}\nAGENTS: ${agentsPath(home)}`); return }
  if (!codexInstalled(home)) throw new Error("Codex CLI was not found. Install Codex or put `codex` on PATH, then retry.");
  const result = spawnSync("codex", ["mcp", "add", cutdexMcpName, "--", launcher.command, ...launcher.args], { stdio: "inherit", env: { ...process.env, CODEX_HOME: home }, windowsHide: true });
  if (result.error || result.status !== 0) { console.log(`Run this command manually:\n${command}`); throw new Error("Codex MCP registration did not complete. Check that the Codex CLI is installed and that CODEX_HOME is writable.") }
  try { installCutdexInstructions(agentsPath(home)) }
  catch (error) {
    spawnSync("codex", ["mcp", "remove", cutdexMcpName], { stdio: "ignore", env: { ...process.env, CODEX_HOME: home }, windowsHide: true });
    throw new Error(`MCP registered, but Cutdex could not update ${agentsPath(home)}: ${error instanceof Error ? error.message : "permission denied"}`);
  }
  console.log(`✓ Logged in mode: ${mode}\n✓ MCP server registered\n✓ Automatic Codex instructions installed at ${agentsPath(home)}\n\nRestart Codex to load Cutdex.`);
}

function disconnect(agent: string | undefined): void {
  if (agent !== "codex") throw new Error("Use `cutdex disconnect codex`.");
  const home = codexHome();
  if (!codexInstalled(home)) throw new Error("Codex CLI was not found. Install Codex or set CODEX_HOME to the correct installation.");
  const result = spawnSync("codex", ["mcp", "remove", cutdexMcpName], { stdio: "ignore", env: { ...process.env, CODEX_HOME: home }, windowsHide: true });
  const instructionResult = removeCutdexInstructions(agentsPath(home));
  if (result.error) throw new Error(`Could not unregister Cutdex from Codex: ${result.error.message}`);
  console.log(`✓ MCP server ${result.status === 0 ? "unregistered" : "already absent"}\n✓ Cutdex instructions ${instructionResult.present ? "removed" : "already absent"}\n\nCutdex is disconnected from Codex.`);
}

async function doctor(): Promise<void> {
  const config = readConfig();
  const home = codexHome();
  const checks: Array<[string, boolean, string?]> = [];
  checks.push(["Cutdex CLI", true, version]);
  if (config.apiKey) {
    try {
      const started = Date.now();
      const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/api/v1/auth/verify`, { headers: { authorization: `Bearer ${config.apiKey}` } });
      checks.push(["Authentication", response.ok, response.ok ? undefined : "Run `cutdex login` to replace the credential."]);
      checks.push(["Hosted API", response.ok, `${Date.now() - started} ms`]);
    } catch { checks.push(["Authentication", false, "Run `cutdex login` to replace the credential."]); checks.push(["Hosted API", false, "Check CUTDEX_API_URL and network access."]) }
  } else {
    checks.push(["Authentication", true, "local mode"]);
    checks.push(["Hosted API", true, "local mode"]);
  }
  const codexOk = codexInstalled(home);
  checks.push(["Codex CLI", codexOk, codexOk ? undefined : "Install Codex or put it on PATH."]);
  const registered = codexOk && cutdexMcpRegistered(home);
  checks.push(["MCP registration", registered, registered ? undefined : "Run `cutdex connect codex`."]);
  const instructions = hasCutdexInstructions(agentsPath(home));
  checks.push(["Codex instructions", instructions, instructions ? undefined : "Run `cutdex connect codex`."]);
  const sample: OptimizeInput = { task: "Find the five most recent failed orders", tool: { name: "database.query", kind: "READ", readOnly: true }, request: { query: "SELECT * FROM orders" } };
  try { const result = await optimize(sample); checks.push(["Optimization request", result.applied.length > 0, result.applied.length ? "local check passed" : "No safe change returned."]) }
  catch { checks.push(["Optimization request", false, "Check authentication or run in local mode."]) }
  console.log("Cutdex Doctor\n");
  for (const [name, ok, detail] of checks) console.log(`${name.padEnd(24)} ${ok ? "✓" : "✗"}${detail ? `  ${detail}` : ""}`);
  if (checks.every(([, ok]) => ok)) console.log("\nCutdex is ready.");
  else console.log("\nFix the failed checks above, then run `cutdex doctor` again.");
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
        if (request.method === "initialize") { sendMcp({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "cutdex", version }, instructions: "Before broad read-only SQL or GraphQL-style tool calls, call cutdex_optimize, then execute optimizedRequest with the original source tool. The response is compact and omits the unchanged original request. Never use this for writes or unknown operations. Cutdex does not intercept built-in tools automatically." } }); continue }
        if (request.method === "tools/list") { sendMcp({ jsonrpc: "2.0", id: request.id, result: { tools: [{ name: "cutdex_optimize", description: "Narrow a read-only SQL or GraphQL-style tool request before it is sent to the source. Returns only the optimized request and concise reasons.", inputSchema: { type: "object", required: ["task", "tool", "request"], properties: { task: { type: "string" }, tool: { type: "object", required: ["name", "readOnly"], properties: { name: { type: "string" }, kind: { enum: ["READ", "WRITE", "UNKNOWN"] }, readOnly: { type: "boolean" } } }, request: { type: "object", properties: { query: { type: "string" } }, additionalProperties: true }, mode: { enum: ["conservative", "aggressive"] } } } }] } }); continue }
        if (request.method === "tools/call" && request.params?.name === "cutdex_optimize" && request.params.arguments) { const result = await optimize(request.params.arguments); const compact = compactMcpResult(result); sendMcp({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: JSON.stringify(compact) }] } }); continue }
        if (request.method === "ping") { sendMcp({ jsonrpc: "2.0", id: request.id, result: {} }); continue }
        if (request.id !== undefined) sendMcp({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
      } catch (error) { sendMcp({ jsonrpc: "2.0", id: null, error: { code: -32603, message: error instanceof Error ? error.message : "Internal error" } }) }
    }
  });
}

function help(): void {
  console.log("Usage:\n  cutdex login [api-key]\n  cutdex logout\n  cutdex status\n  cutdex connect codex\n  cutdex disconnect codex\n  cutdex mcp\n  cutdex start\n  cutdex bench\n  cutdex analyze <traces.jsonl>\n  cutdex optimize <trace.json>\n  cutdex report\n  cutdex doctor");
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
  if (command === "logout") { const config = readConfig(); writeConfig({ apiUrl: config.apiUrl }); console.log("Logged out. Your local Cutdex credential was removed."); return }
  if (command === "status") { await status(); return }
  if (command === "connect") { connect(process.argv[3]); return }
  if (command === "disconnect") { disconnect(process.argv[3]); return }
  if (command === "doctor") { await doctor(); return }
  if (command === "bench") { console.log("Run `pnpm benchmark` from the repository to regenerate benchmark artifacts."); return }
  if (command === "report") { const report = join(root, "benchmarks/results/latest.md"); console.log(existsSync(report) ? readFileSync(report, "utf8") : "No generated benchmark report found. Run pnpm benchmark."); return }
  if (command === "analyze") { const target = process.argv[3]; if (!target) throw new Error("Provide a JSONL trace path."); analyze(target); return }
  if (command === "optimize" || command === "explain") { const target = process.argv[3]; if (!target) throw new Error("Provide a trace JSON path."); const trace = JSON.parse(readFileSync(resolve(target), "utf8")) as OptimizeInput; console.log(JSON.stringify(await optimize(trace), null, 2)); return }
  if (command !== "start") { help(); return }
  const config = readConfig(); const proxyServer = proxy().listen(proxyPort); const dashboardServer = dashboard().listen(dashboardPort);
  console.log(`Proxy      http://localhost:${proxyPort}\nDashboard  http://localhost:${dashboardPort}\nMode       ${config.apiKey ? "hosted API" : "local development"}\n\nWaiting for agent traffic...`);
  const close = () => { proxyServer.close(); dashboardServer.close(); process.exit(0) };
  process.on("SIGINT", close); process.on("SIGTERM", close);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1) });
