import type { Page } from "@playwright/test";

export async function clickWorldEntryItem(page: Page) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.click(viewport.width / 2, viewport.height * 0.88);
}
