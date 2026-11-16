import { expect, type Page, test } from "@playwright/test";
import { iconPosition, openWorld, settle, trackErrors } from "./helpers";

const MINE = "zone:zone-11";

type MineProbe = {
  interaction: { items: Array<{ id: string; focus: { x: number; z: number; clone: () => { y: number; project: (camera: unknown) => { x: number; y: number } } } }> };
  rig: { camera: unknown; lookAt: (x: number, z: number, distance: number, instant: boolean) => void };
  invalidate: () => void;
};

/** Brings the mine's icon into the middle of the view. */
async function lookAtMine(page: Page) {
  await page.evaluate((id) => {
    const engine = (window.__worldEngine as unknown as MineProbe);
    const item = engine.interaction.items.find((candidate) => candidate.id === id)!;
    engine.rig.lookAt(item.focus.x, item.focus.z, 40, true);
    engine.invalidate();
  }, MINE);
  await settle(page);
}

/** Screen point near the middle of the mine, a little to one side for each dig. */
async function digPoint(page: Page, index: number) {
  const point = await page.evaluate((id) => {
    const engine = (window.__worldEngine as unknown as MineProbe);
    const item = engine.interaction.items.find((candidate) => candidate.id === id)!;
    const centre = item.focus.clone();
    centre.y = 4;
    const ndc = centre.project(engine.rig.camera);
    const rect = document.querySelector("canvas")!.getBoundingClientRect();
    return { x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height };
  }, MINE);
  return { x: point.x + (index % 4) * 14 - 21, y: point.y + 8 };
}

const dugCount = async (page: Page) => Number(await page.getByRole("status").locator("dd").first().textContent());

for (const world of ["voxels", "baked"] as const) {
  test(`the mine: enter from its icon, dig, leave with Escape (${world})`, async ({ page }) => {
    test.skip(process.env.PLAYWRIGHT_PROD === "1", "?world= is a development switch.");
    const errors = trackErrors(page);
    await openWorld(page, `/?world=${world}`);
    await lookAtMine(page);

    const icon = await iconPosition(page, MINE);
    await page.mouse.move(icon.x, icon.y);
    await expect(page.getByText("Click to play")).toBeVisible();
    await page.mouse.click(icon.x, icon.y);

    const hud = page.getByRole("region", { name: "Mine mini-game" });
    await expect(hud).toBeVisible();
    await expect(hud).toContainText("Blocks dug");
    expect(await dugCount(page)).toBe(0);
    await settle(page);

    for (let index = 0; index < 6; index += 1) {
      const point = await digPoint(page, index);
      await page.mouse.move(point.x, point.y);
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(120);
    }
    await expect.poll(() => dugCount(page)).toBeGreaterThanOrEqual(3);

    // The holes are drawn: the engine settles again after digging.
    await settle(page);

    await page.keyboard.press("Escape");
    await expect(hud).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("leaving the mine with its button restores the view", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_PROD === "1", "Reads the camera through the development probe.");
  await openWorld(page);
  await lookAtMine(page);
  const before = await page.evaluate(() => (window.__worldEngine as unknown as { rig: { getView: () => { pitchDegrees: number; distance: number } } }).rig.getView());
  const icon = await iconPosition(page, MINE);
  await page.mouse.click(icon.x, icon.y);
  const hud = page.getByRole("region", { name: "Mine mini-game" });
  await expect(hud).toBeVisible();
  await settle(page);
  const playing = await page.evaluate(() => (window.__worldEngine as unknown as { rig: { getView: () => { pitchDegrees: number } } }).rig.getView());
  // The game looks down into the zone, more steeply than visitors normally do.
  expect(playing.pitchDegrees).toBeGreaterThan(before.pitchDegrees + 10);

  await hud.getByRole("button", { name: /leave/i }).click();
  await expect(hud).toHaveCount(0);
  await settle(page);
  const after = await page.evaluate(() => (window.__worldEngine as unknown as { rig: { getView: () => { pitchDegrees: number; distance: number } } }).rig.getView());
  expect(after.pitchDegrees).toBeCloseTo(before.pitchDegrees, 0);
  expect(after.distance).toBeCloseTo(before.distance, 0);
});
