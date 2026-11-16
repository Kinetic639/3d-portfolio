import { expect, test } from "@playwright/test";
import { frames, iconPosition, openWorld, PROJECT_OBJECT, PROJECT_PATH, settle, trackErrors, view } from "./helpers";

test("the default map renders without errors", async ({ page }) => {
  const errors = trackErrors(page);
  await openWorld(page);
  const stats = await page.evaluate(() => window.__worldEngine!.stats);
  expect(stats.drawCalls).toBeGreaterThan(0);
  expect(stats.triangles).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test("the default map's bake loads in place of its voxels and plays the same entry", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_PROD === "1", "?world=baked is a development switch.");
  const errors = trackErrors(page);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await openWorld(page, "/?world=baked");
  const meshes = await page.evaluate(() => (window.__worldEngine as unknown as { terrain: { meshes: () => Array<{ name: string }> } }).terrain.meshes().map((mesh) => mesh.name));
  // Tiles of 4 x 4 chunks and the loader platform on its own, not 144 chunks.
  expect(meshes).toContain("loader");
  expect(meshes.filter((name) => name.startsWith("tile-")).length).toBeGreaterThan(0);
  expect(meshes.length).toBeLessThan(20);
  // One baked file, and no voxel map.
  expect(requests.some((url) => url.includes("/world-data/portfolio-main/"))).toBe(true);
  expect(requests.some((url) => url.includes("map_json"))).toBe(false);
  expect(errors).toEqual([]);
});

test("a map can be opened by URL and unknown maps are 404", async ({ page }) => {
  await openWorld(page, "/map/portfolio-main");
  const response = await page.goto("/map/does-not-exist");
  expect(response?.status()).toBe(404);
});

test("idle draws nothing and hovering only draws when the hovered thing changes", async ({ page }) => {
  await openWorld(page);
  const idleBefore = await frames(page);
  await page.waitForTimeout(1000);
  expect(await frames(page)).toBe(idleBefore);

  const before = await page.evaluate(() => ({ ...window.__worldEngine!.stats }));
  for (let step = 0; step < 80; step += 1) {
    await page.mouse.move(300 + step * 8, 250 + step * 4);
  }
  await settle(page);
  const after = await page.evaluate(() => ({ ...window.__worldEngine!.stats }));
  // Picks are coalesced to at most one per frame, and a frame is drawn only on a hover change.
  expect(after.picks - before.picks).toBeLessThanOrEqual(81);
  expect(after.frames - before.frames).toBeLessThan(20);
});

test("drag pans, wheel zooms and both stay inside limits", async ({ page }) => {
  await openWorld(page);
  const start = await view(page);

  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(840, 460, { steps: 10 });
  await page.mouse.up();
  await settle(page);
  const panned = await view(page);
  // The camera looks north-west, so dragging the ground right and down moves the view west and a little south.
  expect(panned.x).toBeLessThan(start.x);
  expect(panned.z).toBeGreaterThan(start.z);
  // A drag is not a click: nothing opened.
  expect(new URL(page.url()).pathname).toBe("/");

  for (let step = 0; step < 40; step += 1) await page.mouse.wheel(0, 400);
  await settle(page);
  const zoomedOut = await view(page);
  expect(zoomedOut.distance).toBeGreaterThan(start.distance);
  expect(zoomedOut.distance).toBeLessThanOrEqual(98);

  for (let pass = 0; pass < 12; pass += 1) {
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(1100, 650, { steps: 4 });
    await page.mouse.up();
  }
  await settle(page);
  const edge = await view(page);
  // The playable area is 64 cells wide; the camera target must stay within it.
  expect(Math.abs(edge.x)).toBeLessThanOrEqual(32);
  expect(Math.abs(edge.z)).toBeLessThanOrEqual(32);
});

test("the camera turns and tilts within its limits", async ({ page }) => {
  await openWorld(page);
  const start = await view(page);
  // As in the original: a low angle, looking across the terrain.
  expect(start.pitchDegrees).toBeCloseTo(14.4, 1);
  expect(start.yawDegrees).toBeCloseTo(45, 1);

  const turn = async (fromX: number, fromY: number, toX: number, toY: number) => {
    await page.keyboard.down("Control");
    await page.mouse.move(fromX, fromY);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(toX, toY, { steps: 10 });
    await page.mouse.up({ button: "right" });
    await page.keyboard.up("Control");
    await settle(page);
  };

  await turn(640, 360, 840, 360);
  const turned = await view(page);
  expect(turned.yawDegrees).toBeLessThan(start.yawDegrees - 10);
  expect(turned.pitchDegrees).toBeCloseTo(start.pitchDegrees, 1);
  // Turning happens around the point being looked at.
  expect(turned.x).toBeCloseTo(start.x, 3);
  expect(turned.z).toBeCloseTo(start.z, 3);

  await turn(640, 100, 640, 700);
  expect((await view(page)).pitchDegrees).toBeCloseTo(70, 1);
  await turn(640, 700, 640, 20);
  await turn(640, 700, 640, 20);
  expect((await view(page)).pitchDegrees).toBeCloseTo(8, 1);

  // A right drag without Ctrl pans, and a right click opens nothing.
  await page.mouse.click(640, 360, { button: "right" });
  expect(new URL(page.url()).pathname).toBe("/");

  await page.locator("canvas").focus();
  const before = await view(page);
  await page.keyboard.down("KeyQ");
  await page.waitForTimeout(300);
  await page.keyboard.up("KeyQ");
  await settle(page);
  expect((await view(page)).yawDegrees).toBeGreaterThan(before.yawDegrees + 5);
});

test("keyboard moves and zooms the camera", async ({ page }) => {
  await openWorld(page);
  const start = await view(page);
  await page.locator("canvas").focus();
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("Equal");
  await page.waitForTimeout(300);
  await page.keyboard.up("Equal");
  await settle(page);
  const moved = await view(page);
  expect(moved.x).toBeGreaterThan(start.x);
  expect(moved.distance).toBeLessThan(start.distance);
});

test("hovering an object signals it and clicking opens its content at its own URL", async ({ page }) => {
  await openWorld(page);
  const start = await view(page);
  // Tag this engine instance; a remount would create a new, untagged one.
  await page.evaluate(() => Object.assign(window.__worldEngine!, { e2eTag: true }));
  const icon = await iconPosition(page, PROJECT_OBJECT);

  await page.mouse.move(icon.x, icon.y);
  await expect(page.getByText("Click to open")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCSS("cursor", "pointer");

  const clickedAt = Date.now();
  await page.mouse.click(icon.x, icon.y);
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "Project Placeholder One" })).toBeVisible();
  // Generous bound for CI; the panel renders in the same task as the click.
  expect(Date.now() - clickedAt).toBeLessThan(1000);
  await expect(page).toHaveURL(new RegExp(`${PROJECT_PATH}$`));
  await expect(panel.getByRole("heading", { name: "Project Placeholder One" })).toBeFocused();

  // The camera travels to the object.
  await expect.poll(async () => Math.hypot((await view(page)).x - start.x, (await view(page)).z - start.z)).toBeGreaterThan(3);

  // Escape returns to the world, restores the camera and the URL.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  // The return move starts a moment after the URL change, so poll for the destination.
  await expect.poll(async () => (await view(page)).distance).toBeCloseTo(start.distance, 1);
  await expect.poll(async () => (await view(page)).x).toBeCloseTo(start.x, 1);
  await expect(page.locator("canvas")).toBeFocused();

  // The world was never remounted by the URL changes.
  expect(await page.evaluate(() => (window.__worldEngine as unknown as { e2eTag?: boolean }).e2eTag === true)).toBe(true);
});

test("the close button and browser Back both return to the world", async ({ page }) => {
  await openWorld(page);
  const icon = await iconPosition(page, PROJECT_OBJECT);
  const panel = page.getByRole("dialog");

  await page.mouse.click(icon.x, icon.y);
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: /close/i }).click();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);

  await settle(page);
  const again = await iconPosition(page, PROJECT_OBJECT);
  await page.mouse.click(again.x, again.y);
  await expect(panel).toBeVisible();
  await page.goBack();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await page.goForward();
  await expect(panel.getByRole("heading", { name: "Project Placeholder One" })).toBeVisible();
});

test("clicking terrain inside a content zone opens that zone's content", async ({ page }) => {
  await openWorld(page);
  // The opening view is close; step back until the zone is in the picture.
  await page.mouse.move(640, 360);
  for (let step = 0; step < 40; step += 1) await page.mouse.wheel(0, 400);
  await settle(page);
  // A zone's icon floats three units above its ground.
  const ground = await iconPosition(page, "zone:zone-5", 3);
  await page.mouse.move(ground.x, ground.y);
  await expect(page.getByText("Click to open")).toBeVisible();
  await page.mouse.click(ground.x, ground.y);
  await expect(page.getByRole("dialog").getByRole("heading", { name: "About" })).toBeVisible();
  await expect(page).toHaveURL(/\/about$/);
});

test("content can be opened from the menu with the keyboard alone", async ({ page }) => {
  await openWorld(page);
  await page.getByText("Menu", { exact: true }).focus();
  await page.keyboard.press("Enter");
  const link = page.getByRole("link", { name: "Contact" });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Contact" })).toBeVisible();
  await expect(page).toHaveURL(/\/contact$/);
});

test("touch: a tap opens content and a one-finger drag pans", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openWorld(page);
  const start = await view(page);

  const drag = async (fromX: number, fromY: number, toX: number, toY: number) => {
    const client = await context.newCDPSession(page);
    const point = (x: number, y: number) => [{ x, y, id: 1 }];
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(fromX, fromY) });
    for (let step = 1; step <= 8; step += 1) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: point(fromX + ((toX - fromX) * step) / 8, fromY + ((toY - fromY) * step) / 8),
      });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await drag(200, 400, 300, 500);
  await settle(page);
  const panned = await view(page);
  expect(panned.x).toBeLessThan(start.x);

  const icon = await iconPosition(page, PROJECT_OBJECT);
  await page.touchscreen.tap(icon.x, icon.y);
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Project Placeholder One" })).toBeVisible();
  await context.close();
});

test("the perf badge reads idle at rest, counts frames while panning and opens into the details", async ({ page }) => {
  await openWorld(page);
  const hud = page.getByRole("complementary", { name: "Rendering performance" });
  const badge = hud.getByRole("button", { name: /FPS/ });
  await expect(badge).toContainText("idle");
  // The badge refreshes itself without drawing anything.
  const before = await frames(page);
  await page.waitForTimeout(1200);
  expect(await frames(page)).toBe(before);

  await page.mouse.move(640, 360);
  await page.mouse.down();
  for (let step = 0; step < 60; step += 1) {
    await page.mouse.move(640 + step * 4, 360 + (step % 2) * 4);
    await page.waitForTimeout(16);
  }
  await expect(badge).toContainText(/FPS\s*\d+\s*[\d.]+ ms/);
  await page.mouse.up();

  await badge.click();
  await expect(badge).toHaveAttribute("aria-expanded", "true");
  await expect(hud.getByText("Draw calls")).toBeVisible();
  await expect(hud.locator("dd").nth(3)).toHaveText(/^\d+$/);
  await expect(hud.getByText("UI (5 s)")).toBeVisible();
});

test("the original's view buttons: the angle lock keeps the tilt, Reset view returns to the start", async ({ page }) => {
  await openWorld(page);
  const start = await view(page);
  const drag = async (fromX: number, fromY: number, toX: number, toY: number, rotate: boolean) => {
    if (rotate) await page.keyboard.down("Control");
    await page.mouse.move(fromX, fromY);
    await page.mouse.down({ button: rotate ? "right" : "left" });
    await page.mouse.move(toX, toY, { steps: 10 });
    await page.mouse.up({ button: rotate ? "right" : "left" });
    if (rotate) await page.keyboard.up("Control");
    await settle(page);
  };

  await page.getByRole("button", { name: "Lock camera angle" }).click();
  await expect(page.getByRole("button", { name: "Unlock camera angle" })).toHaveAttribute("aria-pressed", "true");
  await drag(640, 200, 840, 600, true);
  const locked = await view(page);
  expect(locked.pitchDegrees).toBeCloseTo(start.pitchDegrees, 1);
  expect(Math.abs(locked.yawDegrees - start.yawDegrees)).toBeGreaterThan(10);

  await drag(640, 360, 900, 500, false);
  expect(Math.hypot((await view(page)).x - start.x, (await view(page)).z - start.z)).toBeGreaterThan(2);
  await page.getByRole("button", { name: "Reset view" }).click();
  await settle(page);
  const reset = await view(page);
  expect(reset.x).toBeCloseTo(start.x, 1);
  expect(reset.z).toBeCloseTo(start.z, 1);
  expect(reset.yawDegrees).toBeCloseTo(start.yawDegrees, 0);
  expect(reset.distance).toBeCloseTo(start.distance, 0);
  // Reset lifts the lock.
  await expect(page.getByRole("button", { name: "Lock camera angle" })).toHaveAttribute("aria-pressed", "false");
});
