import { expect, test } from "@playwright/test";
import {
  enterButton,
  gpuResources,
  openLanding,
  openWorld,
  phase,
  PROJECT_PATH,
  trackErrors,
  view,
  waitForPhase,
} from "./helpers";

test("the landing page is complete HTML before any script runs", async ({ request }) => {
  const html = await (await request.get("/")).text();
  for (const text of ["Michał Stępień", "Projects", "Project Placeholder One", "Experience", "Skills", "Contact", "email-placeholder@example.com"]) {
    expect(html).toContain(text);
  }
  // The invitation must not be in the server output: it only exists once the world is warm.
  expect(html).not.toContain("Enter the world");
});

test("the entry element appears only after warm-up has verified the world", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Michał Stępień" })).toBeVisible();
  // Still loading or warming: no invitation yet.
  if ((await phase(page)) !== "ready") {
    await expect(enterButton(page)).toHaveCount(0);
  }

  await waitForPhase(page, "ready");
  await expect(enterButton(page)).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(/ready/i);

  const report = await page.evaluate(() => window.__worldEngine!.warmUpReport);
  expect(report).not.toBeNull();
  expect(report!.ok).toBe(true);
  expect(report!.newResourcesDuringTest).toBe(0);
  expect(report!.testFrames).toBeGreaterThan(5);
  // Before they enter, the world draws nothing on the page (the door in the sidebar is the way
  // in, not a loader drawn over the page), and the canvas lets every click through to the page.
  expect(await page.evaluate(() => window.__worldEngine!.stats.frames)).toBe(0);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window.__worldEngine as unknown as { stats: { loaderFrames: number } }).stats.loaderFrames)).toBe(0);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("canvas")!.parentElement!).pointerEvents)).toBe("none");
  // The world's own controls stay out of the page: not reachable, not clickable, and
  // drawn at a fraction of a percent of opacity only so they are rasterized before the visitor enters.
  await expect(page.getByRole("button", { name: "Back to page" })).toHaveCount(0);
  const backToPage = page.getByText("Back to page");
  expect(await backToPage.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
  expect(await backToPage.evaluate((element) => Number(getComputedStyle(element.closest("[data-view] > *")!).opacity))).toBeLessThanOrEqual(0.01);
  expect(errors).toEqual([]);
});

test("entering loads nothing, compiles nothing and runs smoothly", async ({ page }) => {
  await openLanding(page);
  const before = await gpuResources(page);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.evaluate(() => {
    const samples: number[] = [];
    let last = 0;
    const tick = (now: number) => {
      if (last) samples.push(now - last);
      last = now;
      if (document.documentElement.dataset.world !== "world") requestAnimationFrame(tick);
    };
    (window as unknown as { __samples: number[] }).__samples = samples;
    // Sampling starts when the transition does, not when the click is handled.
    const start = () => {
      if (document.documentElement.dataset.world === "entering") requestAnimationFrame(tick);
      else requestAnimationFrame(start);
    };
    requestAnimationFrame(start);
  });

  const clickedAt = Date.now();
  await enterButton(page).click();
  await waitForPhase(page, "world");
  const elapsed = Date.now() - clickedAt;
  // The entry is a 5.4 s move (focus, then wave and settle); it must neither stall nor be skipped.
  expect(elapsed).toBeGreaterThan(5000);
  expect(elapsed).toBeLessThan(9000);

  // No GPU resource was created by entering: everything was prepared during warm-up.
  expect(await gpuResources(page)).toEqual(before);
  // No asset was fetched either (dev-server housekeeping aside).
  expect(requests.filter((url) => !url.includes("/_next/") && !url.includes("__nextjs"))).toEqual([]);

  const samples = await page.evaluate(() => (window as unknown as { __samples: number[] }).__samples);
  // Frame pacing only means something on a real GPU; software WebGL renders a frame in tens of milliseconds.
  const hardware = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = extension ? String(gl!.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : "";
    return renderer !== "" && !/swiftshader|llvmpipe|software/i.test(renderer);
  });
  if (hardware) {
    expect(samples.length).toBeGreaterThan(60);
    const sorted = [...samples].sort((left, right) => left - right);
    // Tolerant bound for shared machines; the measured numbers are in docs/architecture.md.
    expect(sorted[Math.floor(sorted.length * 0.95)]).toBeLessThan(34);
  }

  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("#landing")).not.toBeVisible();
  await expect(page.locator("canvas")).toBeFocused();
});

test("the visitor can leave the world and come back with Back and Forward", async ({ page }) => {
  await openWorld(page);
  await page.getByRole("button", { name: "Back to page" }).click();
  await waitForPhase(page, "ready");
  await expect(page.locator("#landing")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(enterButton(page)).toBeFocused();
  expect(await page.evaluate(() => document.getElementById("landing")!.inert)).toBe(false);

  // Entering again reuses the warm engine.
  await enterButton(page).click();
  await waitForPhase(page, "world");
  await page.goBack();
  await waitForPhase(page, "ready");
  await expect(page.locator("#landing")).toBeVisible();
  await page.goForward();
  await waitForPhase(page, "world");
  await expect(page.locator("canvas")).toBeVisible();
});

test("a direct link starts on the landing page and entering goes straight to that content", async ({ page, request }) => {
  const html = await (await request.get(PROJECT_PATH)).text();
  expect(html).toContain("Project Placeholder One");
  expect(html).toContain("Placeholder for a future featured project.");
  expect((await request.get("/projects/nope")).status()).toBe(404);

  await openLanding(page, PROJECT_PATH);
  await expect(page).toHaveTitle(/Project Placeholder One/);
  await expect(page.getByRole("heading", { level: 1, name: "Project Placeholder One" })).toBeVisible();
  // Nothing happens on its own: no panel, no world, until the visitor asks.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await phase(page)).toBe("ready");

  await enterButton(page).click();
  await waitForPhase(page, "world");
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "Project Placeholder One" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${PROJECT_PATH}$`));
  expect((await view(page)).distance).toBeLessThan(45);

  await panel.getByRole("button", { name: /close/i }).click();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  expect(await phase(page)).toBe("world");
});

test("moving between landing pages does not restart the world", async ({ page }) => {
  await openLanding(page);
  await page.evaluate(() => Object.assign(window.__worldEngine!, { e2eTag: true }));
  await page.getByRole("link", { name: "Project Placeholder Two" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Project Placeholder Two" })).toBeVisible();
  expect(await phase(page)).toBe("ready");
  expect(await page.evaluate(() => (window.__worldEngine as unknown as { e2eTag?: boolean }).e2eTag)).toBe(true);
  await expect(enterButton(page)).toBeVisible();
});

test("without WebGL the landing page works and no entry element appears", async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type.startsWith("webgl")) return null;
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await page.goto("/");
  await waitForPhase(page, "unavailable");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("#projects").getByRole("link", { name: "Project Placeholder One" })).toBeVisible();
  await expect(enterButton(page)).toHaveCount(0);
  // Missing WebGL is not the visitor's problem: no warning, no broken control.
  await expect(page.getByText(/unavailable|failed|not supported/i)).toHaveCount(0);
  // On phones no empty door bar stays pinned at the bottom, and the page keeps no room for it.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("[data-door-bar]")).toBeHidden();
  expect(await page.locator("#landing").evaluate((el) => getComputedStyle(el).paddingBottom)).toBe("0px");
  expect(errors).toEqual([]);
});

test("reduced motion skips the transition animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openLanding(page);
  const clickedAt = Date.now();
  await enterButton(page).click();
  await waitForPhase(page, "world");
  expect(Date.now() - clickedAt).toBeLessThan(900);
  expect((await view(page)).distance).toBeLessThan(83);
});

test("the landing page is navigable by keyboard", async ({ page }) => {
  await openLanding(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  // The hidden world must not be reachable while the landing page is in front.
  for (let step = 0; step < 80; step += 1) {
    await page.keyboard.press("Tab");
    const inWorld = await page.evaluate(() => Boolean(document.activeElement?.closest("[aria-hidden='true']")) || document.activeElement?.tagName === "CANVAS");
    expect(inWorld).toBe(false);
    if (await enterButton(page).evaluate((element) => element === document.activeElement)) break;
  }
  await expect(enterButton(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await waitForPhase(page, "world");
});

test("day is the default theme; night is a switch away and is remembered", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("switch", { name: "Night theme" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => document.documentElement.dataset.theme ?? "light")).toBe("light");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  // The page's colours follow (they ease over 2.5 s).
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor), { timeout: 5000 }).toBe("rgb(15, 21, 25)");
  // A returning visitor gets night from the first paint, before any script of the app runs.
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  await page.getByRole("switch", { name: "Night theme" }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme ?? "light")).toBe("light");
});

test("each list section has its own page, which is also its zone's address", async ({ page }) => {
  const response = await page.goto("/projects");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Project Placeholder One" }).first()).toBeVisible();
  // The landing page's section headings lead to these pages.
  await page.goto("/");
  await page.getByRole("heading", { level: 2, name: "Experience" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/experience$/);
  await expect(page.getByRole("heading", { level: 1, name: "Experience" })).toBeVisible();
});

test("the map is site navigation: zones lead to their sections and pins to their items, with no world needed", async ({ page, request }) => {
  // In the server's HTML: no script, WebGL or world is needed to use it.
  const html = await (await request.get("/")).text();
  for (const href of ["/projects", "/experience", "/skills", "/about", "/contact", PROJECT_PATH]) {
    expect(html).toContain(`href="${href}"`);
  }
  await page.goto("/");
  const map = page.getByRole("group", { name: "Map of the portfolio" });
  await expect(map.getByRole("link", { name: "Projects" })).toBeVisible();
  await expect(map.getByRole("link", { name: "Project Placeholder One" })).toBeVisible();
  // A zone's name is the easiest target, also for thin zones.
  await page.locator('#map svg a[tabindex="-1"][href="/experience"]').click();
  await expect(page).toHaveURL(/\/experience$/);
  await expect(page.getByRole("heading", { level: 1, name: "Experience" })).toBeVisible();
  // The section shown is marked on its page's map.
  await expect(page.getByRole("group", { name: "Map of the portfolio" }).getByRole("link", { name: "Experience" })).toHaveAttribute("aria-current", "location");
});

test("layout: the portrait and the door are pinned in the sidebar; on phones the portrait scrolls and the door stays", async ({ page, request }) => {
  await openLanding(page);
  const sidebar = page.getByRole("complementary", { name: /way into the 3D world/ });
  const door = page.getByRole("button", { name: "Enter the world" });
  await expect(sidebar).toBeVisible();
  // The door is in the sidebar and ready: open a little, with light behind it.
  await expect(sidebar.getByRole("button", { name: "Enter the world" })).toBeVisible();
  await expect(page.locator("[data-state=ready]")).toHaveCount(1);
  // Pinned: still on screen at the end of the page, and over nothing of the content.
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect(door).toBeInViewport();
  const content = await page.locator("#content").boundingBox();
  const aside = await sidebar.boundingBox();
  expect(content!.x + content!.width).toBeLessThanOrEqual(aside!.x + 1);
  // The CV downloads.
  expect((await request.get("/cv/michal-stepien-cv.pdf")).headers()["content-type"]).toContain("application/pdf");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  // Phones: the portrait leads the content and scrolls away; the door keeps its bar at the bottom.
  const inline = page.locator("#content figure[data-placement=inline]");
  await expect(inline).toBeVisible();
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect(inline).not.toBeInViewport();
  await expect(door).toBeInViewport();
  const bar = await door.boundingBox();
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(844);
  // The page keeps room for the bar: its last line is above it.
  const footer = await page.locator("#landing footer").boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual((await sidebar.boundingBox())!.y + 1);
});
