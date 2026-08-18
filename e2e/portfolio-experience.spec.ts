import { expect, test } from "@playwright/test";
import { clickWorldEntryItem } from "./helpers";

test("loads the center platform, expands, and enters exploration", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/");

  const experience = page.locator(".experience-shell");
  await expect(experience).toHaveAttribute("data-phase", "ready", { timeout: 10_000 });

  await clickWorldEntryItem(page);

  await expect(experience).toHaveAttribute("data-phase", "explore", { timeout: 6_000 });
  await expect(page.locator("canvas")).toBeVisible();
  expect(consoleErrors.filter((message) => message.includes("THREE.WebGLProgram"))).toEqual([]);
  expect(pageErrors).toEqual([]);

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

test("opens the liquid authoring workspace with simulation controls", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/?editor=1");

  const experience = page.locator(".experience-shell");
  await expect(experience).toHaveAttribute("data-phase", "ready", { timeout: 10_000 });
  await clickWorldEntryItem(page);
  await expect(experience).toHaveAttribute("data-phase", "explore", { timeout: 6_000 });

  const editor = page.getByLabel("Development map editor");
  await expect(editor).toBeVisible();
  await page.getByRole("tab", { name: "Liquid" }).click();
  await expect(page.getByRole("button", { name: "Source", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Inspect", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview Basin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settle" })).toBeVisible();
  await expect(page.getByText("Infinite sources", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
