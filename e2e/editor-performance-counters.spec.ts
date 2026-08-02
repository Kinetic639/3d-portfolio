import { expect, test } from "@playwright/test";
import { clickWorldEntryItem } from "./helpers";

type CounterMap = Record<string, number>;

async function resetEditorCounters(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const targetWindow = window as typeof window & { __portfolioEditorPerfCounters?: Record<string, number> };
    const counters = (targetWindow.__portfolioEditorPerfCounters ?? {}) as Record<string, number>;
    for (const key of Object.keys(counters)) {
      counters[key] = 0;
    }
    targetWindow.__portfolioEditorPerfCounters = counters as typeof targetWindow.__portfolioEditorPerfCounters;
  });
}

async function readEditorCounters(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const targetWindow = window as typeof window & { __portfolioEditorPerfCounters?: Record<string, number> };
    return { ...(targetWindow.__portfolioEditorPerfCounters ?? {}) };
  }) as Promise<CounterMap>;
}

async function ensureEditorOpen(page: import("@playwright/test").Page) {
  const editor = page.locator('[aria-label="Development map editor"]');
  if (await editor.count() > 0) {
    return;
  }

  if (await editor.waitFor({ state: "attached", timeout: 2_000 }).then(() => true).catch(() => false)) {
    return;
  }

  await page.getByRole("button", { name: "Editor" }).click();
  await expect(editor).toBeAttached();
}

test("editor idle does not run prohibited hot-loop work", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/?editor=1");

  const experience = page.locator(".experience-shell");
  await expect(experience).toHaveAttribute("data-phase", "ready", { timeout: 10_000 });
  await clickWorldEntryItem(page);
  await expect(experience).toHaveAttribute("data-phase", "explore", { timeout: 6_000 });
  await ensureEditorOpen(page);

  await page.waitForTimeout(1_500);
  await resetEditorCounters(page);
  await page.waitForTimeout(3_000);

  const counters = await readEditorCounters(page);
  expect(counters.raycasts ?? 0).toBe(0);
  expect(counters.terrainChunkRebuilds ?? 0).toBe(0);
  expect(counters.completeWorldRebuilds ?? 0).toBe(0);
  expect(counters.entityBatchRebuilds ?? 0).toBe(0);
  expect(counters.mapValidations ?? 0).toBe(0);
  expect(counters.mapSerializations ?? 0).toBe(0);
  expect(counters.draftWrites ?? 0).toBe(0);
  expect(counters.layoutPersistenceWrites ?? 0).toBe(0);
  expect(counters.canvasResizes ?? 0).toBe(0);
});

test("pointer movement raycasts once per relevant editor hover and returns to idle", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/?editor=1");

  const experience = page.locator(".experience-shell");
  await expect(experience).toHaveAttribute("data-phase", "ready", { timeout: 10_000 });
  await clickWorldEntryItem(page);
  await expect(experience).toHaveAttribute("data-phase", "explore", { timeout: 6_000 });
  await ensureEditorOpen(page);

  await page.waitForTimeout(1_500);
  await resetEditorCounters(page);
  await page.mouse.move(720, 420);
  await page.waitForTimeout(300);

  const afterMove = await readEditorCounters(page);
  expect(afterMove.raycasts ?? 0).toBeGreaterThan(0);

  await resetEditorCounters(page);
  await page.waitForTimeout(1_500);
  const afterIdle = await readEditorCounters(page);
  expect(afterIdle.raycasts ?? 0).toBe(0);
});
