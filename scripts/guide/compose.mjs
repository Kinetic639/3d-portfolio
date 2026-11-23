/**
 * Builds the test guide (docs/characters.md, B2): assets/models/guide/model.glb.
 *
 *   node scripts/guide/compose.mjs
 *
 * Source: Quaternius packs (CC0), downloaded by hand into temp/models/quaternius
 * (not in the repository: 550 MB, of which the guide uses a few files):
 *   - Modular Character Outfits - Fantasy [Standard]: the Peasant outfit, a whole
 *     clothed body in regular proportions, without a head;
 *   - Universal Base Characters [Standard]: the head (with its eyes and
 *     eyebrows) cut from the Superhero body, and a hairstyle;
 *   - Universal Animation Library 1 and 2 [Standard]: the clips, renamed to
 *     plain roles (the engine finds idle, walk and run by name).
 *
 * Everything shares one humanoid rig and bind pose, so the parts merge into
 * one mesh with one skeleton (two materials: a colour atlas, and the eyes).
 * Composition runs in a browser with three.js (its exporter writes the
 * skinned, animated GLB); `pnpm assets` then optimises the result as usual.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { chromium } = require("@playwright/test");

const Q = "/temp/models/quaternius";
const base = `${Q}/Universal Base Characters[Standard]`;
const recipe = {
  outfit: `${Q}/Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/Outfits/Male_Peasant.gltf`,
  parts: [
    // The body's own eyebrows are kept; the separate eyebrow model would double them.
    { url: `${base}/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf`, headOnly: "SuperHero_Male", headBones: ["Head", "neck_01"] },
    { url: `${base}/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_SimpleParted.gltf` },
  ],
  libraries: [
    {
      url: `${Q}/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb`,
      clips: {
        Idle_Loop: "Idle",
        Walk_Loop: "Walk",
        Jog_Fwd_Loop: "Run",
        Sprint_Loop: "Sprint",
        Idle_Talking_Loop: "Talk",
        Interact: "Interact",
        PickUp_Table: "PickUp",
        Sitting_Enter: "SitDown",
        Sitting_Idle_Loop: "Sitting",
        Sitting_Exit: "StandUp",
      },
    },
    {
      url: `${Q}/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb`,
      clips: { Yes: "Yes", Idle_No_Loop: "No", Idle_Rail_Call: "Call", Idle_FoldArms_Loop: "ArmsFolded" },
    },
  ],
  /** Colour textures that share one 2048 px atlas (a quadrant each, as large as each texture was before). */
  atlas: ["MI_Peasant", "MI_Regular_Male", "MI_Superhero_Male", "MI_Hair_1"],
  maxTextureSize: 2048,
};

for (const file of [recipe.outfit, ...recipe.parts.map((part) => part.url), ...recipe.libraries.map((library) => library.url)]) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`Missing ${file}. Download the Quaternius packs into temp/models/quaternius (docs/characters.md).`);
    process.exit(1);
  }
}

// Serves the repository read-only (the page loads three.js from node_modules and the packs from temp/).
const types = { ".html": "text/html", ".js": "text/javascript", ".gltf": "model/gltf+json", ".glb": "model/gltf-binary", ".bin": "application/octet-stream", ".png": "image/png", ".jpg": "image/jpeg" };
const server = http.createServer((request, response) => {
  const file = path.join(root, decodeURIComponent(new URL(request.url, "http://local").pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": types[path.extname(file).toLowerCase()] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // The Superhero file names two textures that are not in the pack; they are not used, so their 404s are expected.
  page.on("pageerror", (error) => console.error("page error:", String(error)));
  await page.goto(`http://127.0.0.1:${port}/scripts/guide/compose.html`);
  await page.waitForFunction(() => window.__ready === true);
  const { report, base64 } = await page.evaluate((r) => window.compose(r), recipe);
  const out = path.join(root, "assets/models/guide/model.glb");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(base64, "base64"));
  console.log(`Head: ${report.headTriangles} triangles. Meshes: ${report.meshes.join(", ")}`);
  console.log(`Clips: ${report.clips.join(", ")}`);
  console.log(`Wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
} finally {
  await browser.close();
  server.close();
}
