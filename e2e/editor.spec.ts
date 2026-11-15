import { expect, test, type Page } from "@playwright/test";
import { trackErrors } from "./helpers";

/**
 * The editor exists only in development, so these tests are skipped against a
 * production server. Every test that edits works on a scratch map created
 * through the editor's own API and removed afterwards; the repository's real
 * maps are only read.
 */
type EditorProbe = {
  session: {
    world: { getHighestNonAirY: (x: number, z: number) => number | null; getBlock: (x: number, y: number, z: number) => number; getColumnZone: (x: number, z: number) => number; gridToWorld: (x: number, y: number, z: number) => { x: number; y: number; z: number } };
    getEntities: () => Array<{ id: string; transform: { position: { x: number; y: number; z: number }; rotation: { y: number }; scale: { x: number } }; contentReference?: { contentId: string } }>;
    getMeta: () => { name: string; zones: Array<{ numericId: number; label: string; kind?: string; minigame?: { gameId: string } }> };
    undoLabel: string | null;
    isDirty: boolean;
    undo: () => void;
  };
  viewport: {
    project: (x: number, y: number, z: number) => { x: number; y: number };
    stats: { frames: number; chunkRebuilds: number; entityRebuilds: number; worstFrameMs: number };
    resetWorstFrame: () => void;
  };
  store: { getState: () => { selection: string[]; settings: { tool: string; brushSize: number } } };
};

declare global {
  interface Window {
    __editor?: EditorProbe;
  }
}

const SCRATCH = `e2e-scratch-${Date.now().toString(36)}`;
const created = new Set<string>([SCRATCH]);

test.skip(process.env.PLAYWRIGHT_PROD === "1", "The editor is not part of a production build.");
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const response = await request.post("/api/editor/maps", { data: { action: "create", id: SCRATCH, name: "E2E scratch", width: 64, depth: 64 } });
  expect(response.ok()).toBe(true);
});

test.afterAll(async ({ request }) => {
  const { maps } = (await (await request.get("/api/editor/maps")).json()) as { maps: Array<{ id: string }> };
  for (const map of maps) {
    if (created.has(map.id) || map.id.startsWith("e2e-")) await request.delete(`/api/editor/maps/${map.id}`);
  }
});

async function openEditor(page: Page, mapId = SCRATCH) {
  await page.goto(`/editor?map=${mapId}`);
  await page.waitForSelector('[data-editor="ready"]', { timeout: 120_000 });
  // First frame drawn: the viewport is interactive.
  await expect.poll(() => page.evaluate(() => window.__editor!.viewport.stats.frames)).toBeGreaterThan(0);
}

/** Screen position of the top face of a column. */
const columnTop = (page: Page, x: number, z: number) => page.evaluate(([cx, cz]) => {
  const { session, viewport } = window.__editor!;
  const y = session.world.getHighestNonAirY(cx, cz)!;
  const centre = session.world.gridToWorld(cx, y, cz);
  return { ...viewport.project(centre.x, centre.y + 0.5, centre.z), top: y };
}, [x, z]);

const topOf = (page: Page, x: number, z: number) => page.evaluate(([cx, cz]) => window.__editor!.session.world.getHighestNonAirY(cx, cz), [x, z]);
const entities = (page: Page) => page.evaluate(() => window.__editor!.session.getEntities());
const selection = (page: Page) => page.evaluate(() => window.__editor!.store.getState().selection);
const stats = (page: Page) => page.evaluate(() => ({ ...window.__editor!.viewport.stats }));

test("opens the default map with its tools and reports what is under the pointer", async ({ page }) => {
  const errors = trackErrors(page);
  await openEditor(page, "portfolio-main");
  await expect(page.getByRole("radio", { name: /Select/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("option", { name: /Portfolio Workshop Compound/ })).toBeVisible();

  const point = await columnTop(page, 96, 96);
  await page.mouse.move(point.x, point.y);
  await expect(page.getByTestId("editor-hover")).toHaveText(/^\d+, -?\d+, \d+ · /);
  expect(errors).toEqual([]);
});

test("places and removes blocks; each stroke is one undo step and rebuilds only nearby chunks", async ({ page }) => {
  await openEditor(page);
  const before = await columnTop(page, 30, 30);
  const baseline = await stats(page);

  await page.keyboard.press("2");
  await page.mouse.click(before.x, before.y);
  await expect.poll(() => topOf(page, 30, 30)).toBe(before.top + 1);
  const afterPlace = await stats(page);
  // One block touches its own chunk and at most the neighbours it borders; never the whole 4 x 4 map.
  expect(afterPlace.chunkRebuilds - baseline.chunkRebuilds).toBeLessThanOrEqual(4);
  expect(afterPlace.entityRebuilds).toBe(baseline.entityRebuilds);
  expect(await page.evaluate(() => window.__editor!.session.undoLabel)).toBe("Place blocks");

  await page.keyboard.press("3");
  const placed = await columnTop(page, 30, 30);
  await page.mouse.click(placed.x, placed.y);
  await expect.poll(() => topOf(page, 30, 30)).toBe(before.top);

  await page.keyboard.press("Control+z");
  await expect.poll(() => topOf(page, 30, 30)).toBe(before.top + 1);
  await page.keyboard.press("Control+z");
  await expect.poll(() => topOf(page, 30, 30)).toBe(before.top);
  await page.keyboard.press("Control+y");
  await expect.poll(() => topOf(page, 30, 30)).toBe(before.top + 1);
  await page.keyboard.press("Control+z");
});

test("raises terrain with a sized brush: one step per column per stroke, undone as one", async ({ page }) => {
  await openEditor(page);
  await page.keyboard.press("5");
  await page.keyboard.press("BracketRight");
  await page.keyboard.press("BracketRight");
  expect(await page.evaluate(() => window.__editor!.store.getState().settings.brushSize)).toBe(5);

  const from = await columnTop(page, 20, 40);
  const to = await columnTop(page, 26, 40);
  await page.evaluate(() => window.__editor!.viewport.resetWorstFrame());
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();

  // Overlapping brush positions must not stack: every touched column rose by exactly one.
  for (const x of [18, 20, 23, 26]) expect(await topOf(page, x, 40)).toBe(from.top + 1);
  expect(await topOf(page, 20, 44)).toBe(from.top);
  expect((await stats(page)).worstFrameMs).toBeLessThan(50);

  await page.keyboard.press("Control+z");
  for (const x of [18, 20, 23, 26]) expect(await topOf(page, x, 40)).toBe(from.top);
});

test("places, selects, moves, rotates, scales, duplicates and deletes objects", async ({ page }) => {
  await openEditor(page);
  await page.keyboard.press("8");
  await page.getByRole("searchbox", { name: "Search objects" }).fill("Conifer");
  await page.getByRole("option", { name: "Conifer" }).first().click();

  const spot = await columnTop(page, 32, 32);
  await page.mouse.click(spot.x, spot.y);
  await expect.poll(async () => (await entities(page)).length).toBe(1);
  const [placed] = await entities(page);
  expect(await selection(page)).toEqual([placed.id]);

  // Assign content from the inspector.
  await page.getByRole("combobox", { name: /Content shown/ }).selectOption({ index: 1 });
  expect((await entities(page))[0].contentReference).toBeTruthy();

  // Drag it: snapped move, one undo step.
  await page.keyboard.press("1");
  const grab = await page.evaluate(() => {
    const { session, viewport } = window.__editor!;
    const { x, y, z } = session.getEntities()[0].transform.position;
    return viewport.project(x, y + 0.6, z);
  });
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 90, grab.y + 10, { steps: 10 });
  await page.mouse.up();
  const moved = (await entities(page))[0];
  expect(moved.transform.position.x).toBeGreaterThan(placed.transform.position.x + 1);
  expect((moved.transform.position.x * 2) % 1).toBe(0);
  expect(await page.evaluate(() => window.__editor!.session.undoLabel)).toBe("Move object");

  await page.keyboard.press("r");
  expect((await entities(page))[0].transform.rotation.y).not.toBe(moved.transform.rotation.y);
  await page.getByRole("button", { name: "Scale +" }).click();
  expect((await entities(page))[0].transform.scale.x).toBeCloseTo(1.25);

  await page.keyboard.press("Control+d");
  expect(await entities(page)).toHaveLength(2);
  const copyId = (await selection(page))[0];
  expect(copyId).not.toBe(placed.id);

  // Multi-select through the list, then delete both.
  await page.getByRole("listbox", { name: "Objects on the map" }).getByRole("option").first().click({ modifiers: ["Shift"] });
  expect(await selection(page)).toHaveLength(2);
  await page.keyboard.press("Delete");
  expect(await entities(page)).toHaveLength(0);
  expect(await selection(page)).toEqual([]);

  await page.keyboard.press("Control+z");
  expect(await entities(page)).toHaveLength(2);
});

test("defines a zone, paints it, makes it a mini-game zone, and the map validates", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("tab", { name: "Zones" }).click();
  await page.getByRole("button", { name: "Add zone" }).click();
  const zone = await page.evaluate(() => window.__editor!.session.getMeta().zones.at(-1)!);
  expect(await page.evaluate(() => window.__editor!.store.getState().settings.tool)).toBe("zone");

  const from = await columnTop(page, 40, 20);
  const to = await columnTop(page, 44, 20);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(([x, z]) => window.__editor!.session.world.getColumnZone(x, z), [42, 20])).toBe(zone.numericId);

  await page.getByRole("combobox", { name: "Zone kind" }).selectOption("minigame");
  const updated = await page.evaluate(() => window.__editor!.session.getMeta().zones.at(-1)!);
  expect(updated.kind).toBe("minigame");
  expect(updated.minigame?.gameId).toBe("dig");

  await page.getByRole("tab", { name: "Map" }).click();
  await page.getByRole("button", { name: "Validate map" }).click();
  await expect(page.getByText("No problems found.")).toBeVisible();

  await page.getByRole("tab", { name: "Zones" }).click();
  await page.getByRole("button", { name: "Delete zone" }).click();
  expect(await page.evaluate(([x, z]) => window.__editor!.session.world.getColumnZone(x, z), [42, 20])).toBe(0);
  await page.keyboard.press("Control+z");
  expect(await page.evaluate(([x, z]) => window.__editor!.session.world.getColumnZone(x, z), [42, 20])).toBe(zone.numericId);
});

test("saves to the map file and reloads the saved state", async ({ page, request }) => {
  await openEditor(page);
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();

  await page.keyboard.press("5");
  const point = await columnTop(page, 10, 10);
  await page.mouse.click(point.x, point.y);
  await expect(save).toBeEnabled();
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toContainText(`Saved to maps/${SCRATCH}/map.json`);
  await expect(save).toBeDisabled();

  const file = (await (await request.get(`/api/editor/maps/${SCRATCH}`)).json()) as { blocks: { edits: Array<{ x: number; y: number; z: number }> } };
  expect(file.blocks.edits).toContainEqual(expect.objectContaining({ x: 10, y: point.top + 1, z: 10 }));

  await page.reload();
  await page.waitForSelector('[data-editor="ready"]');
  expect(await topOf(page, 10, 10)).toBe(point.top + 1);
});

test("visitor preview hides the editor chrome and Escape returns", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Preview as visitor" }).click();
  await expect(page.getByRole("complementary", { name: "Tools" })).toHaveCount(0);
  await expect(page.getByText(/Visitor preview/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Tools" })).toBeVisible();
});

test("map manager creates, duplicates, renames and deletes maps", async ({ page, request }) => {
  const id = `e2e-made-${Date.now().toString(36)}`;
  created.add(id).add(`${id}-copy`).add(`${id}-renamed`);
  const listed = async () => ((await (await request.get("/api/editor/maps")).json()) as { maps: Array<{ id: string; name: string }>; defaultMapId: string });
  const defaultBefore = (await listed()).defaultMapId;

  await openEditor(page);
  await page.getByRole("button", { name: "Maps" }).click();
  const dialog = page.getByRole("dialog", { name: "Maps" });
  await dialog.getByRole("button", { name: "New map" }).click();
  await dialog.getByLabel("Name", { exact: true }).fill("E2E made");
  await dialog.getByLabel("Id (folder name)").fill(id);
  await dialog.getByRole("button", { name: "Create and open" }).click();
  await page.waitForURL(`**/editor?map=${id}`);
  await page.waitForSelector('[data-editor="ready"]');

  await page.getByRole("button", { name: "Maps" }).click();
  const row = (mapId: string) => dialog.locator(`li[data-map="${mapId}"]`);
  await row(id).getByRole("button", { name: "Duplicate" }).click();
  await dialog.getByRole("button", { name: "Duplicate", exact: true }).last().click();
  await expect(row(`${id}-copy`)).toBeVisible();

  await row(`${id}-copy`).getByRole("button", { name: "Rename" }).click();
  await dialog.getByLabel("Name", { exact: true }).fill("E2E renamed");
  await dialog.getByLabel("Id (folder name)").fill(`${id}-renamed`);
  await dialog.getByRole("button", { name: "Rename", exact: true }).last().click();
  await expect(row(`${id}-renamed`)).toContainText("E2E renamed");
  await expect(row(`${id}-copy`)).toHaveCount(0);

  await row(`${id}-renamed`).getByRole("button", { name: "Delete" }).click();
  await row(`${id}-renamed`).getByRole("button", { name: "Yes, delete" }).click();
  await expect(row(`${id}-renamed`)).toHaveCount(0);

  const after = await listed();
  expect(after.maps.map((map) => map.id)).toContain(id);
  expect(after.maps.map((map) => map.id)).not.toContain(`${id}-renamed`);
  // The default map is the visitor's map; this test must leave it alone.
  expect(after.defaultMapId).toBe(defaultBefore);
  await expect(row(defaultBefore).getByRole("button", { name: "Delete" })).toBeDisabled();
});
