import { expect, test } from "@playwright/test";
import { hideDevIndicator, waitForPhase } from "./helpers";

// Prototype (docs/roadmap.md, B4): the entry screen with the door, only with ?entry=door.

test("the door is the world's loader; its note offers the CV and the classic page; through it is the world", async ({ page }) => {
  await page.goto("/");
  await hideDevIndicator(page);
  await waitForPhase(page, "ready");
  // Without the parameter the page is unchanged.
  await expect(page.getByRole("dialog", { name: "The way into the 3D world" })).toHaveCount(0);

  await page.goto("/?entry=door");
  await hideDevIndicator(page);
  const screen = page.getByRole("dialog", { name: "The way into the 3D world" });
  await expect(screen).toBeVisible();
  await waitForPhase(page, "ready");
  await expect(screen.getByRole("status")).toHaveText("The door is open. Step in.");

  // The note: what this is, the CV, and the classic version.
  await screen.getByRole("button", { name: /CV, contact and the classic version/ }).click();
  const note = page.getByRole("dialog", { name: /Hi, I'm/ });
  await expect(note.getByRole("link", { name: "Download CV (PDF)" })).toHaveAttribute("href", "/cv/michal-stepien-cv.pdf");
  await note.getByRole("button", { name: "Classic version" }).click();
  await expect(screen).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Through the door: the light, then the world.
  await page.goto("/?entry=door");
  await hideDevIndicator(page);
  await waitForPhase(page, "ready");
  await page.getByRole("button", { name: "Enter the 3D world" }).click();
  await waitForPhase(page, "world", 20_000);
  await expect(page.getByRole("dialog", { name: "The way into the 3D world" })).toHaveCount(0);
  await expect(page.locator("#landing")).not.toBeVisible();

  // The world's map over the whole screen; the world's controls only after it is closed.
  const map = page.getByRole("dialog", { name: "Map of the world" });
  await expect(map).toBeVisible();
  const menuOpacity = () => page.locator("[data-view] summary", { hasText: "Menu" }).evaluate((el) => Number(getComputedStyle(el.closest("[data-view] > *")!).opacity));
  expect(await menuOpacity()).toBeLessThan(0.01);
  await map.getByRole("button", { name: "Explore the world" }).click();
  await expect(map).toHaveCount(0);
  expect(await menuOpacity()).toBe(1);
});
