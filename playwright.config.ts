import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3000";
const serverMode = process.env.PLAYWRIGHT_PROD === "1" ? "start" : "dev";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["../temp/**"],
  use: {
    baseURL,
    trace: "on-first-retry",
    // Use the real GPU when there is one: software WebGL makes frame-pacing checks meaningless.
    launchOptions: {
      args: ["--enable-gpu", "--ignore-gpu-blocklist", ...(process.platform === "win32" ? ["--use-angle=d3d11"] : [])],
    },
  },
  webServer: {
    command: `pnpm exec next ${serverMode} -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
