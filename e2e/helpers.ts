import { expect, type Page } from "@playwright/test";

type Vec3 = { x: number; y: number; z: number; clone: () => Vec3; project: (camera: unknown) => Vec3 };

export type EngineProbe = {
  stats: { frames: number; picks: number; drawCalls: number; triangles: number; worstFrameIntervalMs: number };
  warmUpReport: null | { ok: boolean; maxFrameMs: number; newResourcesDuringTest: number; programs: number; geometries: number; testFrames: number };
  renderer: { info: { programs: unknown[]; memory: { geometries: number; textures: number } } };
  rig: { camera: unknown; getView: () => { x: number; z: number; distance: number; yawDegrees: number; pitchDegrees: number } };
  interaction: { items: Array<{ id: string; label: string; anchor: Vec3 }> };
};

declare global {
  interface Window {
    __worldEngine?: EngineProbe;
  }
}

export const phase = (page: Page) => page.evaluate(() => document.documentElement.dataset.world ?? null);

export async function waitForPhase(page: Page, expected: string, timeout = 60_000) {
  await page.waitForFunction((value) => document.documentElement.dataset.world === value, expected, { timeout });
}

/** Collects console and page errors for the lifetime of the page. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/**
 * Opens a landing page and waits until the world behind it is warmed up.
 * The wind is held still (as for visitors who prefer reduced motion): trees
 * swaying in view keep the world drawing by design, and these tests check
 * that it draws only on demand. Wind has its own tests.
 */
export async function openLanding(page: Page, path = "/") {
  await page.goto(path);
  await hideDevIndicator(page);
  await waitForPhase(page, "ready");
  await page.evaluate(() => (window.__worldEngine as unknown as { environment: { wind: { setStilled: (stilled: boolean) => void } } }).environment.wind.setStilled(true));
}

/**
 * The development server's Next.js indicator sits in a corner of the page, over whatever is
 * there (on phones, the door). It does not exist in production; tests take it out of the way.
 */
export async function hideDevIndicator(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

export const enterButton = (page: Page) => page.getByRole("button", { name: /enter the world/i });

/** Opens a landing page and enters the world. */
export async function openWorld(page: Page, path = "/") {
  await openLanding(page, path);
  await enterButton(page).click();
  await waitForPhase(page, "world");
  await settle(page);
}

/** Waits until the engine has stopped drawing frames. */
export async function settle(page: Page) {
  await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve) => {
    const before = window.__worldEngine!.stats.frames;
    setTimeout(() => resolve(window.__worldEngine!.stats.frames === before), 250);
  })), { timeout: 15_000 }).toBe(true);
}

export const view = (page: Page) => page.evaluate(() => window.__worldEngine!.rig.getView());
export const frames = (page: Page) => page.evaluate(() => window.__worldEngine!.stats.frames);

/** Screen position of an interactable's icon, or of the point `below` world units under it. */
export async function iconPosition(page: Page, id: string, below = 0) {
  return page.evaluate(([targetId, drop]) => {
    const engine = window.__worldEngine!;
    const item = engine.interaction.items.find((candidate) => candidate.id === targetId)!;
    const point = item.anchor.clone();
    point.y -= drop;
    const ndc = point.project(engine.rig.camera);
    const rect = document.querySelector("canvas")!.getBoundingClientRect();
    return { x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height };
  }, [id, below] as const);
}

export const gpuResources = (page: Page) => page.evaluate(() => {
  const info = window.__worldEngine!.renderer.info;
  return { programs: info.programs.length, geometries: info.memory.geometries, textures: info.memory.textures };
});

export const PROJECT_OBJECT = "entity:portfolio-workshop-compound";
export const PROJECT_PATH = "/projects/project-placeholder-one";
