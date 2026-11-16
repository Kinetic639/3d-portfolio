import { expect, test, type Page } from "@playwright/test";
import { trackErrors } from "./helpers";

/**
 * The editor exists only in development, so these tests are skipped against a
 * production server. Every test that edits works on a scratch map created
 * through the editor's own API and removed afterwards; the repository's real
 * maps are only read.
 *
 * The interface is the original editor's: workspaces as tabs, tools in the
 * rail, settings in the left dock, inspector on the right, reports at the
 * bottom, a status bar.
 */
type EditorProbe = {
  session: {
    world: { getHighestNonAirY: (x: number, z: number) => number | null; getBlock: (x: number, y: number, z: number) => number; getColumnZone: (x: number, z: number) => number; gridToWorld: (x: number, y: number, z: number) => { x: number; y: number; z: number } };
    getEntities: () => Array<{ id: string; transform: { position: { x: number; y: number; z: number }; rotation: { y: number }; scale: { x: number } }; contentReference?: { contentId: string } }>;
    getMeta: () => {
      name: string;
      zones: Array<{ numericId: number; label: string; kind?: string; minigame?: { gameId: string } }>;
      environment: { wind: { strength: number } & Record<string, unknown>; lighting?: Record<string, unknown>; style?: Record<string, unknown> };
      modelSettings?: Record<string, unknown>;
    };
    undoLabel: string | null;
    isDirty: boolean;
  };
  viewport: {
    project: (x: number, y: number, z: number) => { x: number; y: number };
    stats: { frames: number; chunkRebuilds: number; entityRebuilds: number; previewRebuilds: number; worstFrameMs: number };
    resetWorstFrame: () => void;
    isBakedView: boolean;
  };
  store: { getState: () => { selection: string[]; settings: { tool: string; brush: { size: number } } }; setState: (patch: { selection: string[] }) => void };
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
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.goto(`/editor?map=${mapId}`);
  await page.waitForSelector('[data-editor="ready"]', { timeout: 120_000 });
  // First frame drawn: the viewport is interactive.
  await expect.poll(() => page.evaluate(() => window.__editor!.viewport.stats.frames)).toBeGreaterThan(0);
  // The editor opens close to the ground, as the original did; the tests need the whole map in view.
  // From above, so a stroke does not climb onto the blocks it has just raised.
  await page.evaluate(() => {
    const viewport = window.__editor!.viewport as unknown as { frameAll: (immediate: boolean) => void; rig: { setOrientation: (yaw: number, pitch: number, immediate: boolean) => void } };
    viewport.rig.setOrientation(0, 55, true);
    viewport.frameAll(true);
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

const workspace = (page: Page, name: string) => page.getByRole("tablist", { name: "Editor workspaces" }).getByRole("tab", { name, exact: true }).click();
const tool = (page: Page, name: string) => page.locator(".editor-tool-rail").getByRole("button", { name, exact: true }).click();
const leftDock = (page: Page) => page.locator(".editor-left-dock");
const statusBar = (page: Page) => page.locator(".editor-status-bar");

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
const undoLabel = (page: Page) => page.evaluate(() => window.__editor!.session.undoLabel);

test("opens the default map in the original interface and reports the hovered cell", async ({ page }) => {
  const errors = trackErrors(page);
  await openEditor(page, "portfolio-main");
  await expect(page.getByRole("menubar", { name: "Editor menu bar" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Terrain", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Camera compass")).toBeVisible();
  await expect(page.locator(".editor-outliner")).toContainText("8944 edits");

  const point = await columnTop(page, 96, 96);
  await page.mouse.move(point.x, point.y);
  await expect(statusBar(page).locator("span").nth(2)).toHaveText(/^\d+,\d+,\d+$/);
  expect(errors).toEqual([]);
});

test("adds and erases blocks; each edit is one undo step and rebuilds only nearby chunks", async ({ page }) => {
  await openEditor(page);
  await workspace(page, "Terrain");
  await tool(page, "Add Block");
  const before = await columnTop(page, 30, 30);
  const baseline = await stats(page);

  // Hovering shows the block's ghost; moving within one cell rebuilds nothing.
  await page.mouse.move(before.x, before.y);
  await page.mouse.move(before.x + 1, before.y + 1);
  await expect.poll(async () => (await stats(page)).previewRebuilds).toBeGreaterThan(baseline.previewRebuilds);
  const previews = (await stats(page)).previewRebuilds;
  await page.mouse.move(before.x + 2, before.y);
  expect((await stats(page)).previewRebuilds).toBe(previews);

  await page.mouse.click(before.x, before.y);
  await expect.poll(() => topOf(page, 30, 30)).toBe(before.top + 1);
  const afterAdd = await stats(page);
  // One block touches its own chunk and at most the neighbours it borders; never the whole 4 x 4 map.
  expect(afterAdd.chunkRebuilds - baseline.chunkRebuilds).toBeLessThanOrEqual(4);
  expect(afterAdd.entityRebuilds).toBe(baseline.entityRebuilds);
  expect(await undoLabel(page)).toBe("Add blocks");

  await tool(page, "Erase");
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

test("raises terrain with a sized brush, one step per column per stroke, and flattens it back", async ({ page }) => {
  await openEditor(page);
  await workspace(page, "Terrain");
  await tool(page, "Raise");
  await leftDock(page).getByLabel("Shape").selectOption("square");
  await leftDock(page).getByLabel("Size").fill("5");
  await expect(leftDock(page).getByText("Affected")).toBeVisible();
  expect(await page.evaluate(() => window.__editor!.store.getState().settings.brush.size)).toBe(5);

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
  expect((await stats(page)).worstFrameMs).toBeLessThan(60);
  expect(await undoLabel(page)).toBe("Raise terrain");

  // Flatten takes the height of the cell the stroke starts on.
  await tool(page, "Flatten");
  await leftDock(page).getByLabel("Shape").selectOption("square");
  await leftDock(page).getByLabel("Size").fill("5");
  const ground = await columnTop(page, 22, 44);
  await page.mouse.click(ground.x, ground.y);
  await expect.poll(() => topOf(page, 22, 42)).toBe(from.top);
  expect(await topOf(page, 23, 40)).toBe(from.top + 1);
  expect(await undoLabel(page)).toBe("Flatten terrain");

  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  for (const x of [18, 20, 23, 26]) expect(await topOf(page, x, 40)).toBe(from.top);
});

test("places, selects, moves, rotates, duplicates and deletes objects", async ({ page }) => {
  await openEditor(page);
  await workspace(page, "Objects");
  await leftDock(page).getByLabel("Search prefabs").fill("Foundation Square");
  await leftDock(page).getByRole("option", { name: /Foundation Square/ }).click();
  expect(await page.evaluate(() => window.__editor!.store.getState().settings.tool)).toBe("entity");

  const spot = await columnTop(page, 32, 32);
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.click(spot.x, spot.y);
  await expect.poll(async () => (await entities(page)).length).toBe(1);
  const [placed] = await entities(page);
  expect(await selection(page)).toEqual([placed.id]);

  // Assign content from the inspector.
  await page.getByRole("combobox", { name: "Object content" }).selectOption({ index: 1 });
  expect((await entities(page))[0].contentReference).toBeTruthy();

  // Drag it with Select: snapped move, one undo step.
  await tool(page, "Select");
  const grab = await page.evaluate(() => {
    const { session, viewport } = window.__editor!;
    const { x, y, z } = session.getEntities()[0].transform.position;
    return viewport.project(x, y + 0.1, z);
  });
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 90, grab.y + 10, { steps: 10 });
  await page.mouse.up();
  const moved = (await entities(page))[0];
  expect(moved.transform.position.x).not.toBe(placed.transform.position.x);
  expect((moved.transform.position.x * 2) % 1).toBe(0);
  expect(await undoLabel(page)).toBe("Move object");

  // Rotate mode: dragging turns the object in 15 degree steps.
  await leftDock(page).getByRole("button", { name: "Rotate", exact: true }).click();
  const handle = await page.evaluate(() => {
    const { session, viewport } = window.__editor!;
    const { x, y, z } = session.getEntities()[0].transform.position;
    return viewport.project(x, y + 0.1, z);
  });
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 120, handle.y, { steps: 10 });
  await page.mouse.up();
  const turned = (await entities(page))[0].transform.rotation.y;
  expect(turned).not.toBe(moved.transform.rotation.y);
  expect(Math.abs((turned / (Math.PI / 12)) - Math.round(turned / (Math.PI / 12)))).toBeLessThan(1e-6);

  await page.keyboard.press("Control+d");
  expect(await entities(page)).toHaveLength(2);
  expect((await selection(page))[0]).not.toBe(placed.id);
  await page.keyboard.press("Delete");
  expect(await entities(page)).toHaveLength(1);
  await page.keyboard.press("Control+z");
  expect(await entities(page)).toHaveLength(2);
});

test("creates a zone, paints it with the brush and the area fill, makes it a mini-game zone, and removes it", async ({ page }) => {
  await openEditor(page);
  await workspace(page, "Zones");
  page.on("dialog", (dialog) => void dialog.accept());
  await page.locator(".editor-tool-rail").getByRole("button", { name: "New Zone" }).click();
  const zone = await page.evaluate(() => window.__editor!.session.getMeta().zones.at(-1)!);

  await page.getByRole("button", { name: "Zone Paint" }).click();
  expect(await page.evaluate(() => window.__editor!.store.getState().settings.tool)).toBe("zone");
  const from = await columnTop(page, 40, 20);
  const to = await columnTop(page, 44, 20);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(([x, z]) => window.__editor!.session.world.getColumnZone(x, z), [42, 20])).toBe(zone.numericId);

  // Area fill: a rectangle from where the button went down to where it came up.
  await page.getByRole("button", { name: "Zone Area Fill" }).click();
  const corner = await columnTop(page, 30, 26);
  const opposite = await columnTop(page, 33, 28);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(opposite.x, opposite.y, { steps: 6 });
  await page.mouse.up();
  for (const [x, z] of [[30, 26], [33, 28], [31, 27]]) {
    expect(await page.evaluate(([cx, cz]) => window.__editor!.session.world.getColumnZone(cx, cz), [x, z])).toBe(zone.numericId);
  }

  await page.getByRole("combobox", { name: "Zone kind" }).selectOption("minigame:dig");
  const updated = await page.evaluate(() => window.__editor!.session.getMeta().zones.at(-1)!);
  expect(updated.kind).toBe("minigame");
  expect(updated.minigame?.gameId).toBe("dig");

  await page.locator(".editor-main-toolbar").getByRole("button", { name: /Valid|issues/ }).click();
  await expect(page.locator(".editor-validation-list")).toContainText("No validation issues");

  await page.locator(".editor-tool-rail").getByRole("button", { name: "Remove Selected Zone" }).click();
  await expect.poll(() => page.evaluate(([x, z]) => window.__editor!.session.world.getColumnZone(x, z), [42, 20])).toBe(0);
  await page.keyboard.press("Control+z");
  expect(await page.evaluate(([x, z]) => window.__editor!.session.world.getColumnZone(x, z), [42, 20])).toBe(zone.numericId);
});

test("saves to the map file and reloads the saved state", async ({ page, request }) => {
  await openEditor(page);
  await expect(statusBar(page)).toContainText("saved");
  await workspace(page, "Terrain");
  await tool(page, "Raise");
  const point = await columnTop(page, 10, 10);
  await page.mouse.click(point.x, point.y);
  await expect(statusBar(page)).toContainText("unsaved changes");
  await expect(page.locator(".editor-map-chip")).toContainText("*");
  await page.keyboard.press("Control+s");
  await expect(statusBar(page)).not.toContainText("unsaved");

  const file = (await (await request.get(`/api/editor/maps/${SCRATCH}`)).json()) as { blocks: { edits: Array<{ x: number; y: number; z: number }> } };
  expect(file.blocks.edits).toContainEqual(expect.objectContaining({ x: 10, y: point.top + 1, z: 10 }));

  await page.reload();
  await page.waitForSelector('[data-editor="ready"]');
  expect(await topOf(page, 10, 10)).toBe(point.top + 1);
});

test("clean preview hides the editor, and the compass turns the camera", async ({ page }) => {
  await openEditor(page);
  await page.locator(".editor-main-toolbar").getByRole("button", { name: "Preview" }).click();
  await expect(page.locator(".editor-tool-rail")).toHaveCount(0);
  await expect(page.getByLabel("Camera compass")).toHaveCount(0);
  await page.getByRole("button", { name: "Restore Editor" }).click();
  await expect(page.locator(".editor-tool-rail")).toBeVisible();

  await page.getByRole("button", { name: "Face East" }).click();
  await expect(page.locator(".viewport-compass__face strong")).toHaveText("E");
  await page.getByRole("button", { name: "Lock camera angle" }).click();
  await expect(page.getByRole("button", { name: "Unlock camera angle" })).toBeVisible();
});

test("the map library creates and duplicates maps", async ({ page, request }) => {
  const name = `E2E made ${Date.now().toString(36)}`;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  created.add(id).add(`${id}-copy`);
  const listed = async () => ((await (await request.get("/api/editor/maps")).json()) as { maps: Array<{ id: string; name: string }>; defaultMapId: string });
  const defaultBefore = (await listed()).defaultMapId;

  await openEditor(page);
  await workspace(page, "Map");
  page.once("dialog", (dialog) => void dialog.accept(name));
  await leftDock(page).getByRole("button", { name: "New Map" }).click();
  await page.waitForURL(`**/editor?map=${id}`);
  await page.waitForSelector('[data-editor="ready"]');
  await expect(page.locator(".editor-map-chip")).toContainText(name);

  await workspace(page, "Map");
  page.once("dialog", (dialog) => void dialog.accept(`${name} copy`));
  await leftDock(page).getByRole("button", { name: "Duplicate Map" }).click();
  await page.waitForURL(`**/editor?map=${id}-copy`);

  const after = await listed();
  expect(after.maps.map((map) => map.id)).toEqual(expect.arrayContaining([id, `${id}-copy`]));
  // The default map is the visitor's map; this test must leave it alone.
  expect(after.defaultMapId).toBe(defaultBefore);
});

test("the baked view shows a bake of the map as it is and switches editing off", async ({ page }) => {
  await openEditor(page);
  await workspace(page, "Map");
  await leftDock(page).getByRole("button", { name: "Show Baked" }).click();
  await expect.poll(() => page.evaluate(() => window.__editor!.viewport.isBakedView), { timeout: 30_000 }).toBe(true);

  // Tools do nothing while the bake is shown.
  await workspace(page, "Terrain");
  await tool(page, "Raise");
  const point = await columnTop(page, 50, 50);
  await page.mouse.click(point.x, point.y);
  expect(await topOf(page, 50, 50)).toBe(point.top);

  await workspace(page, "Map");
  await leftDock(page).getByRole("button", { name: "Show Voxels" }).click();
  expect(await page.evaluate(() => window.__editor!.viewport.isBakedView)).toBe(false);
  await workspace(page, "Terrain");
  await tool(page, "Raise");
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => topOf(page, 50, 50)).toBe(point.top + 1);
  await page.keyboard.press("Control+z");
});

test("Bake writes the baked world next to the map and tracks whether it is current", async ({ page, request }) => {
  await openEditor(page);
  const status = async () => ((await (await request.get(`/api/editor/maps/${SCRATCH}/bake`)).json()) as { state: string }).state;
  await workspace(page, "Map");
  const bakeStatus = leftDock(page).locator(".editor-kv", { hasText: "Status" });
  await expect(bakeStatus).toContainText(/not baked|out of date/);

  await leftDock(page).getByRole("button", { name: "Bake Map" }).click();
  await expect(bakeStatus).toContainText("up to date", { timeout: 30_000 });
  expect(await status()).toBe("fresh");

  // The site serves it under its content hash.
  const { record } = (await (await request.get(`/api/editor/maps/${SCRATCH}/bake`)).json()) as { record: { hash: string; fileBytes: number } };
  const file = await request.get(`/world-data/${SCRATCH}/${record.hash}.bin`);
  expect(file.ok()).toBe(true);
  expect((await file.body()).byteLength).toBe(record.fileBytes);

  await workspace(page, "Terrain");
  await tool(page, "Raise");
  const point = await columnTop(page, 12, 50);
  await page.mouse.click(point.x, point.y);
  await workspace(page, "Map");
  await expect(bakeStatus).toContainText("out of date");
  await page.keyboard.press("Control+s");
  await expect.poll(status).toBe("stale");
});

test("models are listed under their own category, animals and characters included", async ({ page }) => {
  await openEditor(page);
  await workspace(page, "Objects");
  const category = leftDock(page).getByRole("combobox", { name: "Category" });
  await expect(category.locator("option", { hasText: "animals & characters" })).toHaveCount(1);
  await category.selectOption("creatures");
  await expect(leftDock(page).getByRole("option", { name: /Crow/ })).toBeVisible();
  await expect(leftDock(page).getByRole("option", { name: /Pine Tree/ })).toHaveCount(0);
  await category.selectOption("nature");
  await expect(leftDock(page).getByRole("option", { name: /Pine Tree \(fluffy\)/ })).toBeVisible();
  await expect(leftDock(page).getByRole("option", { name: /Land Rock \(small\)/ })).toBeVisible();
  await expect(leftDock(page).getByRole("option", { name: /Crow/ })).toHaveCount(0);
});

test("models from the asset pipeline appear in the object palette with a picture and can be placed", async ({ page }) => {
  await openEditor(page);
  await workspace(page, "Objects");
  await leftDock(page).getByRole("combobox", { name: "Category" }).selectOption("models");
  const crate = leftDock(page).getByRole("option", { name: /Crate \(sample\)/ });
  // The picture is rendered in the browser from the model itself.
  await expect(crate.locator("img")).toHaveAttribute("src", /^data:image\/png/, { timeout: 20_000 });
  await expect(leftDock(page).getByRole("option", { name: /Soldier/ })).toBeVisible();

  await crate.click();
  const first = await columnTop(page, 20, 20);
  await page.mouse.click(first.x, first.y);
  const second = await columnTop(page, 23, 20);
  await page.mouse.click(second.x, second.y);
  const placed = await page.evaluate(() => window.__editor!.session.getEntities()
    .map((entity) => entity as unknown as { entityType: string; assetReference: string; variantId: string; transform: { position: { y: number } } })
    .filter((entity) => entity.entityType === "model"));
  expect(placed).toHaveLength(2);
  expect(placed[0]).toMatchObject({ assetReference: "sample-crate", variantId: "standard" });
  // Standing on the ground, not sunk into it or floating.
  expect(placed[0].transform.position.y).toBe(first.top + 1);

  // Two instances of one model share their draw calls: one instanced mesh per model part.
  const batches = await page.evaluate(() => (window.__editor!.viewport as unknown as { entities: { group: { children: Array<{ name: string; count?: number }> } } })
    .entities.group.children.filter((child) => child.name.startsWith("entities:model|sample-crate")).map((child) => child.count));
  expect(batches).toEqual([2, 2]);

  await page.locator(".editor-main-toolbar").getByRole("button", { name: /Valid|issues/ }).click();
  await expect(page.locator(".editor-validation-list")).toContainText("No validation issues");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
});

test("wind: presets and values in the Map workspace, a model's response and debug views in the inspector", async ({ page }) => {
  const errors = trackErrors(page);
  await openEditor(page);
  await workspace(page, "Objects");
  await leftDock(page).getByRole("combobox", { name: "Category" }).selectOption("nature");
  await leftDock(page).getByRole("option", { name: /Pine Tree \(fluffy\)/ }).click();
  const spot = await columnTop(page, 20, 20);
  await page.mouse.click(spot.x, spot.y);
  const pine = (await entities(page)).find((entity) => (entity as { assetReference?: string }).assetReference === "pine-tree-fluffy")!;
  expect(pine).toBeTruthy();

  await workspace(page, "Map");
  const panel = page.locator("details[aria-label='Weather and wind']");
  await panel.getByRole("button", { name: "Windy" }).click();
  await expect(panel.getByRole("button", { name: "Windy" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.__editor!.session.getMeta().environment.wind)).toMatchObject({ strength: 0.72, gustStrength: 0.28, turbulence: 0.3 });
  // The tree is in view and the wind blows: the viewport keeps drawing.
  const framesWhile = async () => { const before = (await stats(page)).frames; await page.waitForTimeout(600); return (await stats(page)).frames - before; };
  expect(await framesWhile()).toBeGreaterThan(10);
  await panel.getByRole("button", { name: "Calm" }).click();
  await page.waitForTimeout(300);
  expect(await framesWhile()).toBeLessThan(3);
  await page.keyboard.press("Control+z");
  expect(await page.evaluate(() => window.__editor!.session.getMeta().environment.wind.strength)).toBe(0.72);

  await page.evaluate((id) => window.__editor!.store.setState({ selection: [id] }), pine.id);
  const response = page.locator("details[aria-label='Wind response']");
  await expect(response).toContainText("Pine Tree (fluffy)");
  await response.getByRole("combobox", { name: "Wind weight source" }).selectOption("height");
  expect(await page.evaluate(() => window.__editor!.session.getMeta().modelSettings)).toEqual({ "pine-tree-fluffy": { wind: { weightSource: "height" } } });
  const debug = page.getByRole("combobox", { name: "Model debug view" });
  for (const view of ["weight", "color_1-g", "color-r", "uv", "normal"]) await debug.selectOption(view);
  await response.getByRole("button", { name: "Reset to model defaults" }).click();
  expect(await page.evaluate(() => window.__editor!.session.getMeta().modelSettings)).toBeUndefined();
  // Every shader compiled: a GLSL error would be logged here.
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test("style: lighting, surface, edges and shadows in the Map workspace, a model's style in the inspector", async ({ page }) => {
  const errors = trackErrors(page);
  await openEditor(page);
  await workspace(page, "Objects");
  await leftDock(page).getByRole("combobox", { name: "Category" }).selectOption("nature");
  await leftDock(page).getByRole("option", { name: /Land Rock \(small\)/ }).click();
  const spot = await columnTop(page, 22, 22);
  await page.mouse.click(spot.x, spot.y);
  const rock = (await entities(page)).find((entity) => (entity as { assetReference?: string }).assetReference === "rock-land-small")!;

  await workspace(page, "Map");
  const environment = () => page.evaluate(() => window.__editor!.session.getMeta().environment);
  await page.locator("details[aria-label='Lighting']").getByRole("button", { name: "Style lab" }).click();
  expect((await environment()).lighting).toMatchObject({ sunIntensity: 2.4, sunColor: "#fff0d3" });
  const edges = page.locator("details[aria-label='Edges and depth']");
  await edges.getByRole("checkbox", { name: "Shadows" }).check();
  expect(await page.evaluate(() => (window.__editor!.viewport as unknown as { renderer: { shadowMap: { enabled: boolean } } }).renderer.shadowMap.enabled)).toBe(true);
  await page.locator("details[aria-label='Surface']").getByRole("slider", { name: "Hatch power" }).fill("0.6");
  await edges.getByRole("button", { name: "World units" }).click();
  expect((await environment()).style).toMatchObject({ hatchStrength: 0.6, outlineMode: "world", outlineThickness: 0.012 });
  await page.keyboard.press("Control+z");
  expect((await environment()).style).toMatchObject({ hatchStrength: 0.6 });
  expect((await environment()).style?.outlineMode).not.toBe("world");

  await page.evaluate((id) => window.__editor!.store.setState({ selection: [id] }), rock.id);
  const modelStyle = page.locator("details[aria-label='Model style']");
  await expect(modelStyle).toContainText("Land Rock (small)");
  await modelStyle.getByRole("button", { name: "Model's own" }).click();
  await modelStyle.getByRole("checkbox", { name: "Contact AO patch" }).uncheck();
  expect(await page.evaluate(() => window.__editor!.session.getMeta().modelSettings)).toEqual({ "rock-land-small": { style: { shading: "standard", contactShadow: false } } });
  await modelStyle.getByRole("button", { name: "Reset to model defaults" }).click();
  expect(await page.evaluate(() => window.__editor!.session.getMeta().modelSettings)).toBeUndefined();
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});
