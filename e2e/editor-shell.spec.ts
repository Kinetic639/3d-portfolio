import { expect, test } from "@playwright/test";
import { clickWorldEntryItem } from "./helpers";

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
]) {
  test(`editor shell remains usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const experience = page.locator(".experience-shell");
    await expect(experience).toHaveAttribute("data-phase", "ready", { timeout: 10_000 });
    await clickWorldEntryItem(page);
    await expect(experience).toHaveAttribute("data-phase", "explore", { timeout: 6_000 });

    const editor = page.getByLabel("Development map editor");
    await expect(editor).toBeVisible();
    await expect(editor.locator(".editor-main-toolbar")).toBeVisible();
    await expect(editor.locator(".editor-tool-rail")).toBeVisible();
    await expect(editor.locator(".editor-left-dock")).toBeVisible();
    await expect(editor.locator(".editor-right-dock")).toBeVisible();
    await expect(editor.locator(".editor-bottom-dock")).toBeVisible();

    const canvas = page.locator(".map-canvas-layer canvas");
    const canvasId = await canvas.evaluate((element) => {
      const current = element.getAttribute("data-e2e-canvas-id") ?? crypto.randomUUID();
      element.setAttribute("data-e2e-canvas-id", current);
      return current;
    });
    const canvasBox = await canvas.boundingBox();
    const leftDockBox = await editor.locator(".editor-left-dock").boundingBox();
    const rightDockBox = await editor.locator(".editor-right-dock").boundingBox();
    const bottomDockBox = await editor.locator(".editor-bottom-dock").boundingBox();
    expect(canvasBox?.x).toBeGreaterThanOrEqual((leftDockBox?.x ?? 0) + (leftDockBox?.width ?? 0) - 1);
    expect((canvasBox?.x ?? 0) + (canvasBox?.width ?? 0)).toBeLessThanOrEqual((rightDockBox?.x ?? viewport.width) + 1);
    expect((canvasBox?.y ?? 0) + (canvasBox?.height ?? 0)).toBeLessThanOrEqual((bottomDockBox?.y ?? viewport.height) + 1);

    await page.keyboard.press(process.platform === "darwin" ? "Meta+P" : "Control+P");
    await expect(page.getByRole("dialog", { name: "Command search" })).toBeVisible();
    await page.keyboard.type("save");
    await expect(page.getByRole("option", { name: /Save Draft/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command search" })).toBeHidden();

    await editor.getByRole("tab", { name: "Objects" }).click();
    await expect(canvas).toHaveAttribute("data-e2e-canvas-id", canvasId);

    await editor.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("button", { name: "Restore Editor" })).toBeVisible();
    await expect(canvas).toHaveAttribute("data-e2e-canvas-id", canvasId);
    await page.getByRole("button", { name: "Restore Editor" }).click();
    await expect(editor).toBeVisible();
    await expect(canvas).toHaveAttribute("data-e2e-canvas-id", canvasId);
  });
}
