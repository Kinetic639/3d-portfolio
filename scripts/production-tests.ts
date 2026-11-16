import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";

/**
 * Tests that need a production build. Both build with NEXT_PUBLIC_WORLD_PROBE=1
 * (the tests read the engine's counters) and serve the build on PERF_PORT (3218).
 *
 * pnpm perf             the performance regression test (perf/world.perf.ts)
 * pnpm perf --update    the same, printing the measurements without failing (for new budgets)
 * pnpm e2e:prod         the end-to-end tests against the production build
 * --no-build            reuses the last build
 *
 * The server is started and stopped here, not by Playwright: on Windows a
 * server started through a shell and pnpm can outlive the test run and keep
 * the port, so the next run would wait for a port that never frees.
 */
const PORT = Number(process.env.PERF_PORT ?? 3218);
const root = path.resolve(__dirname, "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const env = { ...process.env, NEXT_PUBLIC_WORLD_PROBE: "1", SERVE_BAKED_WORLDS: process.env.SERVE_BAKED_WORLDS ?? "1", PERF_PORT: String(PORT) };

function portIsFree(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port);
  });
}

async function waitForServer(url: string, timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The server did not answer at ${url} within ${timeoutMs / 1000} s.`);
}

function stop(server: ChildProcess) {
  if (server.exitCode !== null || server.pid === undefined) return;
  // The whole tree: next start forks workers.
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill("SIGTERM");
}

/** `pnpm` needs a shell on Windows (it is a .cmd); node itself must not get one (its path has spaces). */
function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit", shell: command === "pnpm" && process.platform === "win32" });
  return result.status ?? 1;
}

async function main() {
  const args = process.argv.slice(2);
  if (!(await portIsFree(PORT))) {
    console.error(`Port ${PORT} is in use. Stop whatever is serving it (a previous perf run?) or set PERF_PORT.`);
    process.exit(1);
  }
  if (!args.includes("--no-build")) {
    if (run("pnpm", ["assets"]) !== 0 || run(process.execPath, [nextBin, "build"]) !== 0) process.exit(1);
  }

  const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], { cwd: root, env, stdio: ["ignore", "ignore", "inherit"] });
  const cleanup = () => stop(server);
  process.on("exit", cleanup);
  process.on("SIGINT", () => process.exit(130));
  let status = 1;
  try {
    await waitForServer(`http://localhost:${PORT}/`, 60_000);
    const e2e = args[0] === "e2e";
    const testEnv = args.includes("--update") ? "1" : process.env.PERF_UPDATE ?? "";
    const config = e2e ? "playwright.config.ts" : "playwright.perf.config.ts";
    const extra = args.filter((arg) => arg !== "e2e" && arg !== "perf" && !arg.startsWith("--"));
    const result = spawnSync(process.execPath, [path.join(root, "node_modules", "@playwright", "test", "cli.js"), "test", "-c", config, ...extra], {
      cwd: root,
      env: { ...env, PERF_UPDATE: testEnv, PLAYWRIGHT_PROD: e2e ? "1" : "", PLAYWRIGHT_PORT: String(PORT) },
      stdio: "inherit",
    });
    status = result.status ?? 1;
  } finally {
    cleanup();
  }
  process.exit(status);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
