import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "reference/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/next-env.d.ts",
      "artifacts/**",
      ".agents/**",
      ".codex/**",
      ".claude/**",
      ".cursor/**",
      ".tmp-*",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/reference/**",
                "**/portfolio-prototype/**",
                "**/old-new-portfolio/**",
                "@portfolio/*/src/**",
              ],
              message: "Use approved active package exports only.",
            },
          ],
        },
      ],
    },
  },
);
