import { expect, test } from "@playwright/test";
import { clickWorldEntryItem } from "./helpers";

test("captures the Phase 1 runtime baseline", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const experience = page.locator(".experience-shell");
  await expect(experience).toHaveAttribute("data-phase", "ready", { timeout: 20_000 });
  await clickWorldEntryItem(page);
  await expect(experience).toHaveAttribute("data-phase", "explore", { timeout: 12_000 });
  await page.waitForTimeout(1_000);

  const metrics = await page.evaluate(() => window.__portfolioExperienceMetrics);
  expect(metrics).toMatchObject({ logicalCells: 131_072, chunks: 16, phase: "explore" });
  console.log("phase 1 runtime baseline", JSON.stringify(metrics));
  await testInfo.attach("phase-1-runtime.png", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("captures the Phase 1 editor baseline", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const startedAt = Date.now();
  await page.goto("/?editor=1");
  const experience = page.locator(".experience-shell");
  await expect(experience).toHaveAttribute("data-phase", "ready", { timeout: 20_000 });
  await clickWorldEntryItem(page);
  await expect(experience).toHaveAttribute("data-phase", "explore", { timeout: 12_000 });
  await expect(page.getByLabel("Development map editor")).toBeVisible();
  await page.waitForTimeout(1_000);

  const editorBaseline = await page.evaluate(() => ({
    metrics: window.__portfolioExperienceMetrics,
    jsHeapSize: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
  }));
  console.log("phase 1 editor baseline", JSON.stringify({ ...editorBaseline, editorReadyMs: Date.now() - startedAt }));

  await testInfo.attach("phase-1-editor.png", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
