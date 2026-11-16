import type { Page } from "@playwright/test";

export async function clickWorldEntryItem(page: Page) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.mouse.click(viewport.width / 2, viewport.height * 0.88);
    await page.waitForTimeout(150);
    if (await page.locator(".experience-shell").getAttribute("data-phase") !== "ready") return;
  }
}
