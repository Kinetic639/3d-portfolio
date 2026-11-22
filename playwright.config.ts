import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3000";
// PLAYWRIGHT_PROD=1: the production build is served by `pnpm e2e:prod` (scripts/production-tests.ts).
const production = process.env.PLAYWRIGHT_PROD === "1";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["../temp/**"],
  use: {
    baseURL,
    // Tests open the classic page unless they ask for the entry screen with the door (e2e/entry-door.spec.ts):
    // its rules (components/site/entry-boot.ts) would put it over the page every test reads.
    storageState: { cookies: [], origins: [{ origin: baseURL, localStorage: [{ name: "entry-choice", value: "classic" }] }] },
    trace: "on-first-retry",
    // Use the real GPU when there is one: software WebGL makes frame-pacing checks meaningless.
    launchOptions: {
      args: ["--enable-gpu", "--ignore-gpu-blocklist", ...(process.platform === "win32" ? ["--use-angle=d3d11"] : [])],
    },
  },
  webServer: production
    ? undefined
    : {
        // Models are generated files: build them before the server starts, as `pnpm dev` does.
        command: `pnpm assets && pnpm exec next dev -p ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
  // The editor tests write map files. In development the site watches those
  // files and reloads pages that use them, so the editor runs after the site
  // tests instead of beside them.
  projects: [
    {
      name: "site",
      testIgnore: /editor.spec.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "editor",
      testMatch: /editor.spec.ts/,
      dependencies: ["site"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
