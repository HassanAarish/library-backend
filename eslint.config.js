import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules",
      "config/logs",
      "function.js", // throwaway scratch script
    ],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Express middleware keeps unused signature args (req/res/next); only flag
      // unused locals, and allow intentional `_`-prefixed throwaways.
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-console": "off",
    },
  },
];
