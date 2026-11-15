import { expect, test, type Page } from "@playwright/test";

type EngineProbe = {
  stats: { frames: number; drawCalls: number; triangles: number };
  rig: { getView: () => { x: number; z: number; distance: number } };
};

declare global {
  interface Window {
    __worldEngine?: EngineProbe;
  }
}

async function openWorld(page: Page, path = "/") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(path);
  await page.waitForFunction(() => (window.__worldEngine?.stats.frames ?? 0) > 0, null, { timeout: 60_000 });
  await expect(page.getByRole("status")).toHaveCount(0);
  return errors;
}

const view = (page: Page) => page.evaluate(() => window.__worldEngine!.rig.getView());
const frames = (page: Page) => page.evaluate(() => window.__worldEngine!.stats.frames);

test("the default map renders without errors", async ({ page }) => {
  const errors = await openWorld(page);
  const stats = await page.evaluate(() => window.__worldEngine!.stats);
  expect(stats.drawCalls).toBeGreaterThan(0);
  expect(stats.triangles).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test("a map can be opened by URL and unknown maps are 404", async ({ page }) => {
  await openWorld(page, "/map/portfolio-main");
  const response = await page.goto("/map/does-not-exist");
  expect(response?.status()).toBe(404);
});

test("idle and hovering draw no frames", async ({ page }) => {
  await openWorld(page);
  await page.waitForTimeout(500);
  const before = await frames(page);
  for (let step = 0; step < 40; step += 1) {
    await page.mouse.move(400 + step * 8, 300 + step * 4);
  }
  await page.waitForTimeout(500);
  expect(await frames(page)).toBe(before);
});

test("drag pans, wheel zooms and both stay inside limits", async ({ page }) => {
  await openWorld(page);
  const start = await view(page);

  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(840, 460, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const panned = await view(page);
  expect(panned.x).toBeLessThan(start.x);
  expect(panned.z).toBeLessThan(start.z);

  for (let step = 0; step < 40; step += 1) await page.mouse.wheel(0, 400);
  await page.waitForTimeout(800);
  const zoomedOut = await view(page);
  expect(zoomedOut.distance).toBeGreaterThan(start.distance);
  expect(zoomedOut.distance).toBeLessThanOrEqual(82);

  for (let pass = 0; pass < 12; pass += 1) {
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(1100, 650, { steps: 4 });
    await page.mouse.up();
  }
  await page.waitForTimeout(800);
  const edge = await view(page);
  // The playable area is 64 cells wide; the camera target must stay within it.
  expect(Math.abs(edge.x)).toBeLessThanOrEqual(32);
  expect(Math.abs(edge.z)).toBeLessThanOrEqual(32);
});

test("keyboard moves and zooms the camera", async ({ page }) => {
  await openWorld(page);
  const start = await view(page);
  await page.locator("canvas").focus();
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("Equal");
  await page.waitForTimeout(300);
  await page.keyboard.up("Equal");
  await page.waitForTimeout(600);
  const moved = await view(page);
  expect(moved.x).toBeGreaterThan(start.x);
  expect(moved.distance).toBeLessThan(start.distance);
});
