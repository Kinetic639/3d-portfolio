import { defineConfig, devices } from "@playwright/test";

/**
 * The performance regression test. Run it with `pnpm perf` (scripts/perf.ts),
 * which builds for production with NEXT_PUBLIC_WORLD_PROBE=1 (so the test can
 * read the engine's counters), serves the build, runs this and stops the
 * server. Measured in Chromium with the machine's real GPU.
 */
const port = process.env.PERF_PORT ?? "3218";

export default defineConfig({
  testDir: "./perf",
  testMatch: /\.perf\.ts$/,
  // Measurements must not share the machine with each other.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 240_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: ["--enable-gpu", "--ignore-gpu-blocklist", ...(process.platform === "win32" ? ["--use-angle=d3d11"] : [])],
    },
  },
});
