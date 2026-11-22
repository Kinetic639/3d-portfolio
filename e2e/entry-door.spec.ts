import { expect, test } from "@playwright/test";
import { hideDevIndicator, waitForPhase } from "./helpers";

// The entry screen with the door (docs/roadmap.md, B4 and B5). Tests run as a visitor who chose the classic
// page (playwright.config.ts); ?entry=door brings the screen back, and the rules have their own tests below.

test("the door is the world's loader; its note offers the CV and the classic page; through it is the world", async ({ page }) => {
  // Three page loads and the whole entry: longer than the default.
  test.setTimeout(90_000);
  await page.goto("/");
  await hideDevIndicator(page);
  await waitForPhase(page, "ready");
  // Having chosen the classic page, the visitor gets it.
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

  // Leaving the world comes back to the door screen, ready, with the focus on its door.
  await page.getByRole("button", { name: "Back to page" }).click();
  await waitForPhase(page, "ready");
  const back = page.getByRole("dialog", { name: "The way into the 3D world" });
  await expect(back).toBeVisible();
  await expect(back.getByRole("status")).toHaveText("The door is open. Step in.");
  await expect(back.getByRole("button", { name: "Enter the 3D world" })).toBeFocused();
});

test.describe("who gets the entry screen", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  const screen = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: /The way into the 3D world|Wejście do świata 3D/ });

  test("a first visit to a home page on a wide screen opens on the door, with the page hidden before anything is painted", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    // Decided in <head>: the attribute is there before the page's scripts run.
    await page.waitForFunction(() => document.body !== null);
    expect(await page.evaluate(() => "entryScreen" in document.documentElement.dataset)).toBe(true);
    await expect(screen(page)).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("landing")!).visibility)).toBe("hidden");

    await page.goto("/pl");
    await expect(screen(page)).toBeVisible();
  });

  test("links to content, phones and reduced motion get the classic page", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForTimeout(500);
    await expect(screen(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForTimeout(500);
    await expect(screen(page)).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForTimeout(500);
    await expect(screen(page)).toHaveCount(0);
  });

  test("choosing the classic version is remembered", async ({ page }) => {
    await page.goto("/");
    await screen(page).getByRole("button", { name: /classic portfolio/ }).click();
    await expect(screen(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.reload();
    await page.waitForTimeout(500);
    await expect(screen(page)).toHaveCount(0);
  });
});
