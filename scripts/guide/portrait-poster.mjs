/**
 * Renders the portrait's poster, public/portrait/guide.webp, from the living
 * portrait itself, so the picture shown first and the guide that fades in
 * over it match. Run it whenever the guide model changes, against a running
 * development server:
 *
 *   node scripts/guide/portrait-poster.mjs [http://localhost:3000]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { chromium } = require("@playwright/test");
const base = process.argv[2] ?? "http://localhost:3000";

const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
try {
  // The sidebar's portrait, drawn at twice its CSS size for sharp screens.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/?entry=classic`);
  await page.waitForFunction(() => (window.__portrait?.sidebar?.stats.loadedAt ?? null) !== null, null, { timeout: 90_000 });
  const dataUrl = await page.evaluate(() => window.__portrait.sidebar.capture());
  const out = path.join(root, "public/portrait/guide.webp");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
  const size = await page.evaluate(() => {
    const canvas = document.querySelector("figure[data-placement=sidebar] canvas");
    return `${canvas.width}x${canvas.height}`;
  });
  console.log(`Wrote ${path.relative(root, out)} (${size}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
} finally {
  await browser.close();
}
