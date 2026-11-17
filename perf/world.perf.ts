import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { calculateFrameSummary } from "../lib/perf/frame-statistics";

/**
 * Performance regression test. Measures a production build the way a
 * visitor uses it and compares every number with perf/budgets.json.
 *
 * Two kinds of numbers:
 * - Counts that do not depend on the machine (draw calls, triangles, shader
 *   programs compiled after warm-up, frames drawn while idle, React updates
 *   per interaction). Their budgets are tight: any change is a real change.
 * - Times (load, frame times, long tasks). Their budgets were set from runs
 *   on the reference machine (see budgets.json) with headroom for noise;
 *   each timed scenario that is cheap enough runs three times and the median
 *   is compared.
 *
 * Results go to test-results/perf/latest.json. `PERF_UPDATE=1 pnpm perf`
 * prints the measured values without failing, for setting new budgets.
 */

type Budget = { max?: number; min?: number; why: string };
const budgets = (JSON.parse(fs.readFileSync(path.join(__dirname, "budgets.json"), "utf8")) as { metrics: Record<string, Budget> }).metrics;

type Probe = {
  stats: { frames: number; picks: number; drawCalls: number; triangles: number };
  environment: { wind: { active: boolean; setStilled: (stilled: boolean) => void } };
  windInView: () => boolean;
  frames: { window: (now: number, windowMs: number) => { cpuMean: number | null; cpuMax: number | null } };
  warmUpReport: { ok: boolean; maxFrameMs: number; newResourcesDuringTest: number } | null;
  renderer: { info: { programs: unknown[] } };
  rig: { camera: unknown; lookAt: (x: number, z: number, distance: number, instant: boolean) => void };
  interaction: { items: Array<{ id: string; anchor: Vec; focus: Vec & { x: number; z: number } }> };
  invalidate: () => void;
};
type Vec = { clone: () => Vec & { y: number; project: (camera: unknown) => { x: number; y: number } } };

declare global {
  interface Window {
    __perf: { phases: Array<{ phase: string; t: number }>; longTasks: Array<{ start: number; duration: number }>; frames: number[]; raf: number };
    __worldUiWork?: { total: number };
  }
}

const MINE = "zone:zone-11";
const OBJECT = "entity:portfolio-workshop-compound";

/** Records phase changes and long tasks from the very start of the page. */
const INSTRUMENT = () => {
  window.__perf = { phases: [], longTasks: [], frames: [], raf: 0 };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__perf.longTasks.push({ start: entry.startTime, duration: entry.duration });
  }).observe({ type: "longtask", buffered: true });
  new MutationObserver(() => {
    const phase = document.documentElement.dataset.world ?? "";
    const last = window.__perf.phases[window.__perf.phases.length - 1];
    if (!last || last.phase !== phase) window.__perf.phases.push({ phase, t: performance.now() });
    // The document, not documentElement: init scripts run before the parser creates <html>.
  }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-world"] });
};

const now = (page: Page) => page.evaluate(() => performance.now());

async function startFrames(page: Page) {
  await page.evaluate(() => {
    window.__perf.frames = [];
    let last = 0;
    const tick = (at: number) => {
      if (last) window.__perf.frames.push(at - last);
      last = at;
      window.__perf.raf = requestAnimationFrame(tick);
    };
    window.__perf.raf = requestAnimationFrame(tick);
  });
}

async function stopFrames(page: Page) {
  return page.evaluate(() => {
    cancelAnimationFrame(window.__perf.raf);
    return window.__perf.frames.slice();
  });
}

/** Long tasks that started inside [from, to]: how many, total and longest, ms. */
async function longTasks(page: Page, from: number, to: number) {
  const tasks = await page.evaluate(() => window.__perf.longTasks.slice());
  const inside = tasks.filter((task) => task.start >= from && task.start <= to);
  return { count: inside.length, total: inside.reduce((sum, task) => sum + task.duration, 0), max: inside.reduce((max, task) => Math.max(max, task.duration), 0) };
}

async function settle(page: Page) {
  await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve) => {
    const before = (window.__worldEngine as unknown as Probe).stats.frames;
    setTimeout(() => resolve((window.__worldEngine as unknown as Probe).stats.frames === before), 300);
  })), { timeout: 20_000 }).toBe(true);
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const results: Record<string, number> = {};
const record = (name: string, value: number) => {
  results[name] = Math.round(value * 100) / 100;
};

/** Opens the landing page, waits for the warm world and enters it. Records load and entry. */
async function loadAndEnter(page: Page) {
  await page.addInitScript(INSTRUMENT);
  await page.goto("/");
  await page.waitForFunction(() => document.documentElement.dataset.world === "ready", null, { timeout: 60_000 });
  const ready = await page.evaluate(() => window.__perf.phases.find((entry) => entry.phase === "ready")!.t);
  const load = await longTasks(page, 0, ready);
  const report = await page.evaluate(() => (window.__worldEngine as unknown as Probe).warmUpReport);
  // Wind keeps the world drawing while something sways in view, by design. The scenarios below
  // check on-demand rendering, so they run with the wind held still (as for reduced motion);
  // measureWind measures the wind on its own.
  await page.evaluate(() => (window.__worldEngine as unknown as Probe).environment.wind.setStilled(true));
  // Let the landing page come to rest, as a visitor reading it would.
  await page.waitForTimeout(1500);

  const programsBefore = await page.evaluate(() => (window.__worldEngine as unknown as Probe).renderer.info.programs.length);
  await startFrames(page);
  const clickedAt = await now(page);
  await page.getByRole("button", { name: /enter the world/i }).click();
  await page.waitForFunction(() => document.documentElement.dataset.world === "world", null, { timeout: 30_000 });
  await settle(page);
  const entryFrames = await stopFrames(page);
  const entryTasks = await longTasks(page, clickedAt, await now(page));
  const programsAfter = await page.evaluate(() => (window.__worldEngine as unknown as Probe).renderer.info.programs.length);
  return {
    readyMs: ready,
    loadLongTaskMs: load.total,
    warmUpOk: report?.ok ? 1 : 0,
    warmUpNewResources: report?.newResourcesDuringTest ?? 99,
    entry: calculateFrameSummary(entryFrames),
    entryLongTasks: entryTasks.count,
    entryProgramsCompiled: programsAfter - programsBefore,
  };
}

test("the world stays within its performance budgets", async ({ browser }) => {
  const gpu = await (async () => {
    const page = await browser.newPage();
    const renderer = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "none";
    });
    await page.close();
    return renderer;
  })();
  test.skip(/swiftshader|llvmpipe|software|none/i.test(gpu) && process.env.PERF_ALLOW_SOFTWARE !== "1", `No hardware GPU (${gpu}): frame times would be meaningless.`);

  // Load and entry, three times on fresh pages.
  const runs = [];
  for (let run = 0; run < 3; run += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    runs.push(await loadAndEnter(page));
    if (run < 2) await context.close();
    else {
      // The last page goes on to the scenarios in the world.
      await measureWorld(page);
      await context.close();
    }
  }
  record("load.readyMs", median(runs.map((run) => run.readyMs)));
  record("load.longTaskMs", median(runs.map((run) => run.loadLongTaskMs)));
  record("load.warmUpOk", Math.min(...runs.map((run) => run.warmUpOk)));
  record("load.warmUpNewResources", Math.max(...runs.map((run) => run.warmUpNewResources)));
  record("entry.maxFrameMs", median(runs.map((run) => run.entry.maxFrameMs)));
  record("entry.p95FrameMs", median(runs.map((run) => run.entry.p95FrameMs)));
  record("entry.framesOver33Ms", median(runs.map((run) => run.entry.above33_3Ms.count)));
  record("entry.longTasks", median(runs.map((run) => run.entryLongTasks)));
  record("entry.programsCompiled", Math.max(...runs.map((run) => run.entryProgramsCompiled)));

  // Compare and report.
  const lines: string[] = [];
  const failures: string[] = [];
  for (const [name, budget] of Object.entries(budgets)) {
    const value = results[name];
    if (value === undefined) {
      failures.push(`${name}: not measured`);
      continue;
    }
    const over = budget.max !== undefined && value > budget.max;
    const under = budget.min !== undefined && value < budget.min;
    const limit = budget.max !== undefined ? `<= ${budget.max}` : `>= ${budget.min}`;
    lines.push(`${over || under ? "FAIL" : " ok "}  ${name.padEnd(28)} ${String(value).padStart(10)}   budget ${limit}`);
    if (over || under) failures.push(`${name} = ${value}, budget ${limit} (${budget.why})`);
  }
  for (const name of Object.keys(results)) if (!budgets[name]) lines.push(`  ?   ${name.padEnd(28)} ${String(results[name]).padStart(10)}   (no budget)`);
  console.log(`\nGPU: ${gpu}\n${lines.join("\n")}\n`);
  const outDir = path.join(__dirname, "..", "test-results", "perf");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify({ gpu, measuredAt: new Date().toISOString(), results }, null, 2));

  if (process.env.PERF_UPDATE !== "1") expect(failures, "Performance budgets exceeded").toEqual([]);
});

async function measureWorld(page: Page) {
  // Pan for three seconds.
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await startFrames(page);
  const panFrom = await now(page);
  for (let step = 0; step < 180; step += 1) {
    await page.mouse.move(700 + Math.sin(step / 20) * 300, 450 + Math.cos(step / 25) * 120);
    await page.waitForTimeout(16);
  }
  const panTo = await now(page);
  const panFrames = calculateFrameSummary(await stopFrames(page));
  await page.mouse.up();
  const cpu = await page.evaluate(([from, to]) => (window.__worldEngine as unknown as Probe).frames.window(to, to - from), [panFrom, panTo] as const);
  const panTasks = await longTasks(page, panFrom, panTo);
  record("pan.p95FrameMs", panFrames.p95FrameMs);
  record("pan.maxFrameMs", panFrames.maxFrameMs);
  record("pan.longTasks", panTasks.count);
  record("pan.engineCpuMeanMs", cpu.cpuMean ?? 0);
  await settle(page);
  const stats = await page.evaluate(() => ({ ...(window.__worldEngine as unknown as Probe).stats }));
  record("render.drawCalls", stats.drawCalls);
  record("render.triangles", stats.triangles);

  // Idle: nothing is drawn while nothing moves, the perf badge included.
  const idleBefore = await page.evaluate(() => (window.__worldEngine as unknown as Probe).stats.frames);
  await page.waitForTimeout(2000);
  record("idle.framesIn2s", (await page.evaluate(() => (window.__worldEngine as unknown as Probe).stats.frames)) - idleBefore);

  // Hover across the scene: picks are coalesced, frames and React updates happen only on changes.
  const hoverBefore = await page.evaluate(() => ({ ...(window.__worldEngine as unknown as Probe).stats, ui: window.__worldUiWork!.total }));
  const hoverFrom = await now(page);
  // A line across the screen that passes over an object's icon, so the hover changes twice.
  const object = await screenPoint(page, "anchor", OBJECT);
  for (let step = 0; step < 80; step += 1) await page.mouse.move(object.x - 400 + step * 10, object.y - 40 + step);
  await settle(page);
  const hoverAfter = await page.evaluate(() => ({ ...(window.__worldEngine as unknown as Probe).stats, ui: window.__worldUiWork!.total }));
  record("hover.frames", hoverAfter.frames - hoverBefore.frames);
  record("hover.picks", hoverAfter.picks - hoverBefore.picks);
  record("hover.uiUpdates", hoverAfter.ui - hoverBefore.ui);
  record("hover.longTasks", (await longTasks(page, hoverFrom, await now(page))).count);

  await measurePanel(page);
  await measureWind(page);
  await measureMine(page);
}

/**
 * Opening content: a click on an object's icon until its panel is shown,
 * and the frames around it. The first open in a session is the one that
 * can stall (fonts, raster of the panel), so it is the one measured.
 */
async function measurePanel(page: Page) {
  await page.evaluate((id) => {
    const probe = window.__worldEngine as unknown as Probe;
    const item = probe.interaction.items.find((candidate) => candidate.id === id)!;
    probe.rig.lookAt(item.focus.x, item.focus.z, 30, true);
    probe.invalidate();
  }, OBJECT);
  await settle(page);
  const icon = await screenPoint(page, "anchor", OBJECT);
  await startFrames(page);
  const from = await now(page);
  await page.mouse.click(icon.x, icon.y);
  await page.getByRole("dialog").waitFor();
  const shown = await now(page);
  await page.waitForTimeout(1500);
  const to = await now(page);
  const frames = calculateFrameSummary(await stopFrames(page));
  const tasks = await longTasks(page, from, to);
  record("panel.openMs", shown - from);
  record("panel.maxFrameMs", frames.maxFrameMs);
  record("panel.longTasks", tasks.count);
  await page.getByRole("button", { name: /close and return to the world/i }).click();
  await settle(page);
}

/**
 * Wind at the arrival view, when the map has wind and something it moves is
 * in view there. Recorded as wind.* (no frames are expected to stop).
 */
async function measureWind(page: Page) {
  const state = await page.evaluate(async () => {
    const probe = window.__worldEngine as unknown as Probe;
    probe.environment.wind.setStilled(false);
    probe.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const inView = probe.environment.wind.active && probe.windInView();
    return { inView };
  });
  if (state.inView) {
    const from = await now(page);
    const before = await page.evaluate(() => (window.__worldEngine as unknown as Probe).stats.frames);
    await page.waitForTimeout(2000);
    const to = await now(page);
    const framesDrawn = (await page.evaluate(() => (window.__worldEngine as unknown as Probe).stats.frames)) - before;
    const cpu = await page.evaluate(([a, b]) => (window.__worldEngine as unknown as Probe).frames.window(b, b - a), [from, to] as const);
    record("wind.framesIn2s", framesDrawn);
    record("wind.engineCpuMeanMs", cpu.cpuMean ?? 0);
    record("wind.longTasks", (await longTasks(page, from, to)).count);
  }
  await page.evaluate(() => (window.__worldEngine as unknown as Probe).environment.wind.setStilled(true));
}

/** Digging in the mine with the CPU slowed four times, as on a mid-range phone. */
async function measureMine(page: Page) {
  await page.evaluate((id) => {
    const probe = window.__worldEngine as unknown as Probe;
    const item = probe.interaction.items.find((candidate) => candidate.id === id)!;
    probe.rig.lookAt(item.focus.x, item.focus.z, 40, true);
    probe.invalidate();
  }, MINE);
  await settle(page);
  const icon = await screenPoint(page, "anchor");
  await page.mouse.click(icon.x, icon.y);
  await page.getByRole("region", { name: /mini-game/ }).waitFor();
  await settle(page);

  const programsBefore = await page.evaluate(() => (window.__worldEngine as unknown as Probe).renderer.info.programs.length);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await startFrames(page);
  const from = await now(page);
  for (let dig = 0; dig < 8; dig += 1) {
    const point = await screenPoint(page, "focus");
    const x = point.x + (dig % 4) * 14 - 21;
    const y = point.y + 8;
    await page.mouse.move(x, y);
    await page.waitForTimeout(100);
    await page.mouse.click(x, y);
    await page.waitForTimeout(350);
  }
  const to = await now(page);
  const frames = calculateFrameSummary(await stopFrames(page));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const tasks = await longTasks(page, from, to);
  const dug = Number(await page.getByRole("status").locator("dd").first().textContent());
  const programsAfter = await page.evaluate(() => (window.__worldEngine as unknown as Probe).renderer.info.programs.length);
  record("dig4x.blocksDug", dug);
  record("dig4x.maxFrameMs", frames.maxFrameMs);
  record("dig4x.framesOver50Ms", frames.longFramesAbove50Ms);
  record("dig4x.longTasks", tasks.count);
  record("dig4x.programsCompiled", programsAfter - programsBefore);
}

/** Screen position of the mine's icon, or of the middle of the zone a little below its surface. */
async function screenPoint(page: Page, which: "anchor" | "focus", id = MINE) {
  return page.evaluate(([id, kind]) => {
    const probe = window.__worldEngine as unknown as Probe;
    const item = probe.interaction.items.find((candidate) => candidate.id === id)!;
    const point = (kind === "anchor" ? item.anchor : item.focus).clone();
    if (kind === "focus") point.y = 4;
    const ndc = point.project(probe.rig.camera);
    const rect = document.querySelector("canvas")!.getBoundingClientRect();
    return { x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height };
  }, [id, which] as const);
}

