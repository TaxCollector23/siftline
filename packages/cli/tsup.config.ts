import { defineConfig } from "tsup";
export default defineConfig({ entry: ["packages/cli/src/index.ts"], format: ["esm"], outDir: "dist/cli", dts: false, clean: true, noExternal: ["@cutdex/core"], banner: { js: "#!/usr/bin/env node" } });
