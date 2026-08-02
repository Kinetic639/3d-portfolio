import { expect, test } from "@playwright/test";

test("benchmark workspace runs a short benchmark and persists history", async ({ page }) => {
  await page.goto("/benchmark");
  await expect(page.getByRole("heading", { name: "Performance Benchmark" })).toBeVisible({ timeout: 12_000 });

  await page.getByLabel("Map").selectOption("tiny-example");
  await page.getByLabel("Scenario").selectOption("idle-overview");
  await page.getByRole("button", { name: "Short test preset" }).click();
  await page.getByRole("button", { name: "Start benchmark" }).click();

  await expect(page.getByText("Complete")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".benchmark-history-table article")).toHaveCount(1, { timeout: 5_000 });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Performance Benchmark" })).toBeVisible({ timeout: 12_000 });
  await expect(page.locator(".benchmark-history-table article")).toHaveCount(1, { timeout: 10_000 });
});
