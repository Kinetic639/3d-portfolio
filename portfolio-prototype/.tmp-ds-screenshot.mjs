import { chromium } from "@playwright/test";

const outDir = "C:\\Users\\Michal\\AppData\\Local\\Temp\\claude\\d--dev-new-portfolio\\55368ce3-972f-4de8-a2f7-2479a1ef9e8a\\scratchpad";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:3000/design-system", { waitUntil: "networkidle" });
await page.waitForSelector("#dark-concept");
await page.locator("#dark-concept").screenshot({ path: `${outDir}\\tooltip-section.png` });
await browser.close();
console.log("done");
