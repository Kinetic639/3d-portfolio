import { expect, test } from "@playwright/test";
import { hideDevIndicator, openLanding, PROJECT_PATH, waitForPhase } from "./helpers";

// Two languages (docs/roadmap.md, B1): English on the bare paths, Polish under /pl, the same pages in both.

test("each language is complete HTML with its own lang, and every page names its other language for search engines", async ({ request }) => {
  const english = await (await request.get(PROJECT_PATH)).text();
  const polish = await (await request.get(`/pl${PROJECT_PATH}`)).text();
  expect(english).toContain('<html lang="en"');
  expect(polish).toContain('<html lang="pl"');
  expect(polish).toContain("Projekt zastępczy pierwszy");
  expect(polish).toContain("Pobierz CV");
  for (const html of [english, polish]) {
    expect(html).toMatch(new RegExp(`<link rel="alternate" hrefLang="en" href="[^"]*${PROJECT_PATH}"`));
    expect(html).toMatch(new RegExp(`<link rel="alternate" hrefLang="pl" href="[^"]*/pl${PROJECT_PATH}"`));
    expect(html).toMatch(new RegExp(`<link rel="alternate" hrefLang="x-default" href="[^"]*${PROJECT_PATH}"`));
  }
  expect(polish).toMatch(new RegExp(`<link rel="canonical" href="[^"]*/pl${PROJECT_PATH}"`));
  expect((await request.get("/pl/projects/nope")).status()).toBe(404);
  expect((await request.get("/pl/projects")).status()).toBe(200);
});

test("the switch opens the same page in the other language and remembers the choice", async ({ page }) => {
  await page.goto(PROJECT_PATH);
  await hideDevIndicator(page);
  const switcher = page.getByRole("navigation", { name: "Language" });
  await expect(switcher.getByRole("link", { name: "English" })).toHaveAttribute("aria-current", "page");
  await switcher.getByRole("link", { name: "Polski" }).click();

  await expect(page).toHaveURL(new RegExp(`/pl${PROJECT_PATH}$`));
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(page.getByRole("heading", { level: 1, name: "Projekt zastępczy pierwszy" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Sekcje" }).getByRole("link", { name: "Projekty" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("lang-choice"))).toBe("pl");

  await page.getByRole("navigation", { name: "Język" }).getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(new RegExp(`${PROJECT_PATH}$`));
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("the world speaks Polish on a Polish page, and its addresses keep the prefix", async ({ page }) => {
  await openLanding(page, "/pl/projects");
  await page.getByRole("button", { name: "Wejdź do świata" }).click();
  await waitForPhase(page, "world");

  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "Projekty" })).toBeVisible();
  await expect(page).toHaveURL(/\/pl\/projects$/);
  await panel.getByRole("link", { name: "Projekt zastępczy pierwszy" }).click();
  await expect(page).toHaveURL(new RegExp(`/pl${PROJECT_PATH}$`));
  await expect(panel.getByRole("heading", { name: "Projekt zastępczy pierwszy" })).toBeVisible();

  // Zone names come from the page's language too.
  const zones = await page.evaluate(() => (window as unknown as { __worldEngine: { bridge: { store: { getState: () => { zones: Array<{ label: string }> } } } } }).__worldEngine.bridge.store.getState().zones.map((zone) => zone.label));
  expect(zones).toContain("Projekty");

  // Closing the item returns to the list it was opened from; closing the list returns to the world, at the Polish home.
  await panel.getByRole("button", { name: "Zamknij i wróć do świata" }).click();
  await expect(panel.getByRole("heading", { name: "Projekty" })).toBeVisible();
  await expect(page).toHaveURL(/\/pl\/projects$/);
  await panel.getByRole("button", { name: "Zamknij i wróć do świata" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/pl$/);
  await page.getByRole("button", { name: "Wróć na stronę" }).click();
  await waitForPhase(page, "ready");
  await expect(page.getByRole("button", { name: "Wejdź do świata" })).toBeFocused();
});

test.describe("first visit with a Polish browser", () => {
  test.use({ locale: "pl-PL" });

  test("the English page offers Polish once, in Polish; either answer is remembered", async ({ page }) => {
    await page.goto("/");
    await hideDevIndicator(page);
    const prompt = page.getByRole("complementary", { name: "Język" });
    await expect(prompt).toContainText("Ta strona jest też po polsku.");
    await prompt.getByRole("button", { name: "Zostań przy angielskim" }).click();
    await expect(prompt).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(500);
    await expect(prompt).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("lang-choice"))).toBe("en");
  });

  test("choosing Polish opens the same page in Polish", async ({ page }) => {
    await page.goto("/projects");
    await hideDevIndicator(page);
    await page.getByRole("complementary", { name: "Język" }).getByRole("link", { name: "Polski" }).click();
    await expect(page).toHaveURL(/\/pl\/projects$/);
    await expect(page.getByRole("complementary", { name: "Język" })).toHaveCount(0);
  });

  test("a Polish page asks nothing", async ({ page }) => {
    await page.goto("/pl");
    await hideDevIndicator(page);
    await page.waitForTimeout(500);
    await expect(page.getByRole("complementary", { name: /Język|Language/ })).toHaveCount(0);
  });
});

test("an English browser is asked nothing", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(500);
  await expect(page.getByRole("complementary", { name: /Język|Language/ })).toHaveCount(0);
});
