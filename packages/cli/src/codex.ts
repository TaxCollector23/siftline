import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

export const cutdexMcpName = "cutdex";
const managedStart = "<!-- cutdex:start -->";
const managedEnd = "<!-- cutdex:end -->";
const managedBlock = new RegExp(`${managedStart}[\\s\\S]*?${managedEnd}\\r?\\n?`, "g");

export function codexHome(environment: NodeJS.ProcessEnv = process.env): string {
  return environment.CODEX_HOME?.trim() || join(homedir(), ".codex");
}

export function agentsPath(home = codexHome()): string { return join(home, "AGENTS.md"); }

export function cutdexInstructions(newline = "\n"): string {
  return [
    managedStart,
    "## Cutdex",
    "",
    "Before executing a potentially wasteful read-only structured-data tool call, call `cutdex_optimize` with the task, tool descriptor, and original request.",
    "",
    "Use the returned `optimizedRequest` with the original source tool. If Cutdex passes the request through, fails, or returns no safe change, execute the original request unchanged.",
    "",
    "Prefer one bounded read with explicit fields, filters, sort, and limit. Do not fetch an exploratory unbounded result and then repeat the same read; only paginate or retry when the task requires it or the source reports an incomplete result.",
    "",
    "Never use Cutdex for INSERT, UPDATE, DELETE, mutations, writes, or state-changing commands. Do not invent filters or fields that the task does not support.",
    managedEnd,
  ].join(newline);
}

export function hasCutdexInstructions(filePath = agentsPath()): boolean {
  return existsSync(filePath) && readFileSync(filePath, "utf8").includes(managedStart);
}

export function installCutdexInstructions(filePath = agentsPath()): { changed: boolean; created: boolean } {
  const existed = existsSync(filePath);
  const original = existed ? readFileSync(filePath, "utf8") : "";
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const withoutManaged = original.replace(managedBlock, "").replace(/[ \t]+$/gm, "").trim();
  const block = cutdexInstructions(newline);
  const next = withoutManaged ? `${withoutManaged}${newline}${newline}${block}${newline}` : `${block}${newline}`;
  if (next !== original) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, next, { encoding: "utf8", mode: 0o600 });
  }
  return { changed: next !== original, created: !existed };
}

export function removeCutdexInstructions(filePath = agentsPath()): { changed: boolean; present: boolean } {
  if (!existsSync(filePath)) return { changed: false, present: false };
  const original = readFileSync(filePath, "utf8");
  if (!original.includes(managedStart)) return { changed: false, present: false };
  const next = original.replace(managedBlock, "").replace(/^\s+|\s+$/g, "");
  writeFileSync(filePath, next ? `${next}\n` : "", { encoding: "utf8", mode: 0o600 });
  return { changed: next !== original, present: true };
}

export function runCodex(args: string[], home = codexHome()): SpawnSyncReturns<string> {
  return spawnSync("codex", args, { encoding: "utf8", env: { ...process.env, CODEX_HOME: home }, windowsHide: true, timeout: 3_000, killSignal: "SIGTERM" }) as SpawnSyncReturns<string>;
}

export function codexInstalled(home = codexHome()): boolean { return runCodex(["--version"], home).status === 0 }
export function cutdexMcpRegistered(home = codexHome()): boolean { return runCodex(["mcp", "get", cutdexMcpName], home).status === 0 }
