import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Dependency rule (ARCHITECTURE §5.1): engines are pure and never touch React,
// the browser, or apps/web. Package-level rules are added as packages appear.
const forbiddenInEngines = [
  {
    group: ["react", "react-dom", "react/*", "next", "next/*"],
    message: "Engines must not import UI frameworks.",
  },
  {
    group: ["**/apps/web/**", "@meridian/ui"],
    message: "Engines must not depend on apps/web or ui.",
  },
];

export default tseslint.config(
  { ignores: ["**/.next/**", "**/dist/**", "**/node_modules/**", "**/next-env.d.ts", ".turbo/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Intentionally unused names start with an underscore (e.g. omitting a key with rest destructuring).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: [
      "packages/games/**/*.{ts,tsx}",
      "packages/game-kit/**/*.{ts,tsx}",
      "packages/name-matcher/**/*.{ts,tsx}",
      "packages/geo/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: forbiddenInEngines }],
      "no-restricted-globals": ["error", "window", "document", "localStorage", "indexedDB"],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded Rng." },
        { object: "Date", property: "now", message: "Pass a monotonic `now` argument." },
      ],
    },
  },
);
