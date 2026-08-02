import { expect, test } from "@playwright/test";
import { clickWorldEntryItem } from "./helpers";

test("loads the center platform, expands, and enters exploration", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");

  const experience = page.locator(".experience-shell");
  await expect(experience).toHaveAttribute("data-phase", "ready", { timeout: 10_000 });

  await clickWorldEntryItem(page);

  await expect(experience).toHaveAttribute("data-phase", "explore", { timeout: 6_000 });
  await expect(page.locator("canvas")).toBeVisible();
  expect(consoleErrors.filter((message) => message.includes("THREE.WebGLProgram"))).toEqual([]);

  const metrics = await page.evaluate(() => window.__portfolioExperienceMetrics);
  expect(metrics?.logicalCells).toBe(49_152);
  expect(metrics?.airCells).toBeGreaterThan(0);
  expect(metrics?.nonAirBlocks).toBeGreaterThan(0);
  expect(metrics?.nonAirBlocks).toBeLessThan(metrics?.logicalCells ?? 0);
  expect(metrics?.chunks).toBe(16);
  expect(metrics?.instances).toBe(metrics?.nonAirBlocks);
  expect(metrics?.calls).toBeGreaterThan(0);
  expect(metrics?.triangles).toBeGreaterThan(0);
});
