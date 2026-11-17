import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The engine and everything it builds on stay free of React and Next.js:
 * the world runs outside React (no renders per frame or pointer move) and
 * talks to the page only through lib/bridge. A React import here is a
 * design mistake, not a style issue. The two hooks that connect lib to
 * React (use-world-bridge.ts, perf/ui-work.ts) and the design system's
 * fonts are the only exceptions.
 */
const NO_UI_FRAMEWORK = {
  patterns: [
    { group: ["react", "react/*", "react-dom", "react-dom/*"], message: "lib/ stays free of React: the engine runs outside it. Talk to the page through lib/bridge." },
    { group: ["next", "next/*"], message: "lib/ stays free of Next.js." },
    { group: ["@/components/*"], message: "lib/ must not depend on components: components depend on lib." },
    { group: ["@react-three/*", "lucide-react"], message: "lib/ stays free of React libraries." },
  ],
  paths: [
    { name: "zustand", message: "zustand's main entry is its React binding; use zustand/vanilla." },
    { name: "@/lib/bridge/use-world-bridge", message: "A React hook: only components may use it." },
    { name: "@/lib/perf/ui-work", message: "A React hook: only components may use it." },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["lib/**/*.ts", "lib/**/*.tsx"],
    ignores: ["lib/bridge/use-world-bridge.ts", "lib/perf/ui-work.ts", "lib/design-system/**"],
    rules: { "no-restricted-imports": ["error", NO_UI_FRAMEWORK] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "temp/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
