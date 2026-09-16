import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, { files: ["**/*.{ts,tsx}"], plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh }, rules: { "@typescript-eslint/no-explicit-any": "off", "react-refresh/only-export-components": "off" } }, { ignores: ["dist", "node_modules", "apps/web/dist"] });
