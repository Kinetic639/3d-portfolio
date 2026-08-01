import { expect, test } from "@playwright/test";

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

  const expandButton = page.getByRole("button", { name: "Expand map" });
  await expect(expandButton).toBeVisible();
  await expandButton.click();

  await expect(experience).toHaveAttribute("data-phase", "explore", { timeout: 6_000 });
  await expect(expandButton).toBeHidden();
  await expect(page.locator("canvas")).toBeVisible();
  expect(consoleErrors.filter((message) => message.includes("THREE.WebGLProgram"))).toEqual([]);

  const metrics = await page.evaluate(() => window.__portfolioExperienceMetrics);
  expect(metrics?.instances).toBe(4096);
  expect(metrics?.calls).toBeLessThanOrEqual(18);
  expect(metrics?.triangles).toBeLessThanOrEqual(40_960);
});
