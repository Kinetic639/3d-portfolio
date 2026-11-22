import { expect, test, type Page } from "@playwright/test";
import { hideDevIndicator, openLanding, waitForPhase } from "./helpers";

// The living portrait (docs/roadmap.md, B3): a poster first, the guide over it once the world is ready.

type PortraitProbe = { stats: { frames: number; loadedAt: number | null }; isRunning: boolean };
const portrait = (page: Page, placement: "sidebar" | "inline") =>
  page.evaluate((key) => {
    const scene = (window as unknown as { __portrait?: Record<string, PortraitProbe> }).__portrait?.[key];
    return scene ? { frames: scene.stats.frames, loaded: scene.stats.loadedAt !== null, running: scene.isRunning } : null;
  }, placement);
const framesIn = async (page: Page, placement: "sidebar" | "inline", ms: number) => {
  const before = (await portrait(page, placement))!.frames;
  await page.waitForTimeout(ms);
  return (await portrait(page, placement))!.frames - before;
};

test("the poster is in the HTML; the living guide comes after the world is ready and stops while the world is in front", async ({ page, request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain('src="/portrait/guide.webp"');
  expect((await request.get("/portrait/guide.webp")).headers()["content-type"]).toContain("image/webp");

  await openLanding(page);
  await expect(page.locator("figure[data-placement=sidebar] canvas")).toHaveAttribute("data-loaded", "true", { timeout: 20_000 });
  // At most 30 frames a second while it is shown.
  const shown = await framesIn(page, "sidebar", 1000);
  expect(shown).toBeGreaterThan(15);
  expect(shown).toBeLessThanOrEqual(32);
  // The phone's portrait is not displayed on a wide screen, so it never even loads.
  expect(await portrait(page, "inline")).toBeNull();

  // The head follows the pointer: moving it changes the picture (more frames are not the test; a different look is).
  await page.mouse.move(100, 450);
  await page.waitForTimeout(600);

  await page.getByRole("button", { name: "Enter the world" }).click();
  await waitForPhase(page, "world");
  expect(await framesIn(page, "sidebar", 800)).toBe(0);
  expect((await portrait(page, "sidebar"))!.running).toBe(false);
});

test("phones: the portrait in the content comes alive on screen and stops when scrolled away", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLanding(page);
  await expect(page.locator("figure[data-placement=inline] canvas")).toHaveAttribute("data-loaded", "true", { timeout: 20_000 });
  expect(await portrait(page, "sidebar")).toBeNull();
  expect(await framesIn(page, "inline", 600)).toBeGreaterThan(0);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => portrait(page, "inline").then((state) => state!.running)).toBe(false);
  expect(await framesIn(page, "inline", 600)).toBe(0);
});

test("with reduced motion the poster stays: no living portrait is loaded", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await hideDevIndicator(page);
  await waitForPhase(page, "ready");
  await page.waitForTimeout(1500);
  expect(await portrait(page, "sidebar")).toBeNull();
  await expect(page.locator("figure[data-placement=sidebar] img")).toBeVisible();
});
