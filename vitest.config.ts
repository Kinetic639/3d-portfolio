import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: ["temp/**", "e2e/**", "**/node_modules/**", "**/.next/**"],
    globals: false,
  },
});
