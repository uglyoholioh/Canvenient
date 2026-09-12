import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unusedImports from "eslint-plugin-unused-imports";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // Built output, the Rust target dir (embeds minified codegen assets),
  // vendored pdfjs wasm files, and the archived legacy app are not linted.
  globalIgnores(["dist", "src-tauri", "public", "src/legacy"]),
  {
    files: ["**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "unused-imports": unusedImports },
    rules: {
      // Auto-fixable removal of unused imports/vars (covers no-unused-vars).
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Empty catch blocks are a deliberate ignore-the-error pattern here.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // The React Compiler-era hooks rules flag deliberate, careful patterns
      // throughout the app (ref access for Tiptap, prop-to-state hydration,
      // stable-setter dependency omissions). They are tracked debt: kept
      // visible as warnings, re-hardened site by site.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  // Keep prettier authoritative on formatting: disables eslint stylistic
  // rules that would fight it. Must be the last config.
  eslintConfigPrettier,
]);
