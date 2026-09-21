import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import process from "node:process";
import { join } from "node:path";

if (process.stdout.isTTY) {
  const session = process.env.WT_SESSION ?? process.env.TERM_SESSION_ID ?? process.env.ConEmuPID ?? process.env.CUTDEX_TERMINAL_SESSION;
  if (session) {
    const key = createHash("sha256").update(session).digest("hex").slice(0, 20);
    const marker = join(tmpdir(), `cutdex-startup-${key}.shown`);
    if (!existsSync(marker)) {
      try {
        writeFileSync(marker, "CutDex\n", { encoding: "utf8", flag: "wx" });
        process.stdout.write("\n\u001b[38;2;236;100;61m╭──────────────────────────────────────────╮\n│  CutDex                                  │\n│  source-side request optimizer           │\n╰──────────────────────────────────────────╯\u001b[0m\n\n");
      } catch {
        // Installation should never fail because startup art could not be recorded.
      }
    }
  }
}
