import { expect, test } from "@playwright/test";

test.skip(process.env.COLLECT_METRICS !== "1", "Only run during explicit production metrics collection.");

test("collects production renderer metrics after expansion and map gestures", async ({ page }) => {
  await page.goto("/");

  const experience = page.locator(".experience-shell");
  await expect(experience).toHaveAttribute("data-phase", "ready", { timeout: 10_000 });
  await page.getByRole("button", { name: "Expand map" }).click();
  await expect(experience).toHaveAttribute("data-phase", "explore", { timeout: 6_000 });

  await page.mouse.move(720, 500);
  await page.mouse.down();
  await page.mouse.move(650, 545, { steps: 8 });
  await page.mouse.up();
  await page.mouse.wheel(0, -420);
  await page.waitForTimeout(1_200);

  const metrics = await page.evaluate(() => window.__portfolioExperienceMetrics);

  console.log("production metrics", JSON.stringify(metrics));
  expect(metrics?.phase).toBe("explore");
  expect(metrics?.instances).toBe(4096);
  expect(metrics?.calls).toBeGreaterThan(0);
  expect(metrics?.triangles).toBeGreaterThan(0);
});
