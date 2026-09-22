import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentsPath, hasCutdexInstructions, installCutdexInstructions, removeCutdexInstructions } from "./codex.js";

const temporaryHomes: string[] = [];

afterEach(() => {
  for (const home of temporaryHomes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe("Cutdex Codex instructions", () => {
  it("preserves user instructions and installs one managed block", () => {
    const home = mkdtempSync(join(tmpdir(), "cutdex-codex-"));
    temporaryHomes.push(home);
    const path = agentsPath(home);
    writeFileSync(path, "# My instructions\n\nKeep responses concise.\n", "utf8");
    expect(installCutdexInstructions(path)).toMatchObject({ changed: true, created: false });
    const first = readFileSync(path, "utf8");
    expect(first).toContain("# My instructions");
    expect(first.match(/<!-- cutdex:start -->/g)).toHaveLength(1);
    expect(installCutdexInstructions(path)).toMatchObject({ changed: false, created: false });
    expect(readFileSync(path, "utf8")).toBe(first);
  });

  it("removes only the managed block and is idempotent", () => {
    const home = mkdtempSync(join(tmpdir(), "cutdex-codex-"));
    temporaryHomes.push(home);
    const path = agentsPath(home);
    writeFileSync(path, "# Before\n\n<!-- cutdex:start -->\nmanaged\n<!-- cutdex:end -->\n\n# After\n", "utf8");
    expect(hasCutdexInstructions(path)).toBe(true);
    expect(removeCutdexInstructions(path)).toMatchObject({ changed: true, present: true });
    expect(readFileSync(path, "utf8")).toBe("# Before\n\n\n# After\n");
    expect(removeCutdexInstructions(path)).toMatchObject({ changed: false, present: false });
  });

  it("creates a missing global instruction file under the selected home", () => {
    const home = mkdtempSync(join(tmpdir(), "cutdex-codex-"));
    temporaryHomes.push(home);
    const path = agentsPath(home);
    expect(installCutdexInstructions(path)).toMatchObject({ changed: true, created: true });
    expect(hasCutdexInstructions(path)).toBe(true);
  });
});
