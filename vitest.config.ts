import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: ["temp/**", "**/node_modules/**", "**/.next/**"],
    globals: false,
  },
});
