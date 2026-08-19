import { expect, test } from "@playwright/test";
import { clickWorldEntryItem } from "./helpers";

test("captures the Phase 5 composite runtime", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const experience = page.locator(".experience-shell");
  await expect(experience).toHaveAttribute("data-phase", "ready", { timeout: 60_000 });
  await clickWorldEntryItem(page);
  await expect(experience).toHaveAttribute("data-phase", "explore", { timeout: 40_000 });
  await page.waitForTimeout(1_000);

  const metrics = await page.evaluate(() => window.__portfolioExperienceMetrics);
  expect(metrics).toMatchObject({ logicalCells: 1_179_648, chunks: 144, phase: "explore" });
  console.log("phase 5 composite runtime", JSON.stringify(metrics));
  await testInfo.attach("phase-5-composite-runtime.png", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("captures the Phase 1 editor baseline", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const startedAt = Date.now();
  await page.goto("/?editor=1");
  const experience = page.locator(".experience-shell");
  await expect(experience).toHaveAttribute("data-phase", "explore", { timeout: 60_000 });
  await expect(page.getByLabel("Development map editor")).toBeVisible();
  await page.waitForTimeout(1_000);

  const editorBaseline = await page.evaluate(() => ({
    metrics: window.__portfolioExperienceMetrics,
    jsHeapSize: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
  }));
  expect(editorBaseline.metrics).toMatchObject({ logicalCells: 1_179_648, chunks: 144, phase: "explore" });
  console.log("phase 1 editor baseline", JSON.stringify({ ...editorBaseline, editorReadyMs: Date.now() - startedAt }));

  await testInfo.attach("phase-1-editor.png", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
