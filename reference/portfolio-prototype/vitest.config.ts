import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    exclude: ["temp/**", "e2e/**", "**/node_modules/**", "**/.next/**"],
    globals: false,
  },
});
