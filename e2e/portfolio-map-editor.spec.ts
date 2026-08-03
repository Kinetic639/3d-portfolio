import { expect, test } from "@playwright/test";
import { clickWorldEntryItem } from "./helpers";

test("keeps editor hidden before explore", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".experience-shell")).toHaveAttribute("data-phase", "ready", { timeout: 10_000 });
  await expect(page.getByLabel("Development map editor")).toBeHidden();
});

test("enables editor in development after explore", async ({ page }) => {
  await page.goto("/?editor=1");

  const experience = page.locator(".experience-shell");
  await expect(experience).toHaveAttribute("data-phase", "ready", { timeout: 10_000 });
  await expect(page.getByLabel("Development map editor")).toBeHidden();

  await clickWorldEntryItem(page);
  await expect(experience).toHaveAttribute("data-phase", "explore", { timeout: 6_000 });

  const editor = page.getByLabel("Development map editor");
  await expect(editor).toBeVisible();
  await expect(editor.getByText("Map Editor")).toBeVisible();
  await expect(editor.getByRole("button", { name: "Select" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Paint" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Add Block" })).toBeVisible();
  await expect(editor.getByLabel("Preset")).toBeVisible();
});
