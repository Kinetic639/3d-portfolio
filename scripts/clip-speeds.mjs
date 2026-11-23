/**
 * Measures how fast a creature's walk, run and sprint clips move it over the
 * ground, and writes that into its asset.json (`actor.walkClipSpeed`, ...):
 *
 *   node scripts/clip-speeds.mjs guide
 *
 * The clips are in place (root motion removed), so the speed is read from
 * the feet: while a foot is planted, it slides back under the body exactly
 * as fast as the body should move forward. The engine then plays each clip
 * at "speed / clip speed", so the feet stay on the ground at any speed
 * (lib/engine/actor.ts).
 *
 * Feet are the `ball_l`/`ball_r` bones (Unreal-style rigs), or `foot_l`/`foot_r`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2];
if (!id) {
  console.error("Usage: node scripts/clip-speeds.mjs <model id>");
  process.exit(1);
}
const folder = path.join(root, "assets/models", id);
const assetFile = path.join(folder, "asset.json");
const asset = JSON.parse(fs.readFileSync(assetFile, "utf8"));

// Textures are not needed and would not load outside a browser: drop them first.
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(path.join(folder, asset.file ?? "model.glb"));
for (const texture of document.getRoot().listTextures()) texture.dispose();
const glb = await io.writeBinary(document);
const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), "", resolve, reject));

const scene = gltf.scene;
const bone = (names) => {
  let found = null;
  scene.traverse((object) => {
    if (!found && names.includes(object.name.toLowerCase())) found = object;
  });
  return found;
};
const feet = [bone(["ball_l", "foot_l"]), bone(["ball_r", "foot_r"])];
if (feet.includes(null)) {
  console.error("No foot bones (ball_l/ball_r or foot_l/foot_r) in this model.");
  process.exit(1);
}

/** Median horizontal speed of the feet while they are planted (in the lowest 15% of its height range: the body bobs, so a planted foot is not at one fixed height). */
function plantedSpeed(clip) {
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clip).play();
  const steps = 400;
  const dt = clip.duration / steps;
  const tracks = feet.map(() => []);
  for (let step = 0; step <= steps; step += 1) {
    mixer.setTime(step * dt);
    scene.updateMatrixWorld(true);
    feet.forEach((foot, index) => tracks[index].push(foot.getWorldPosition(new THREE.Vector3())));
  }
  mixer.stopAllAction();
  const speeds = [];
  for (const track of tracks) {
    const heights = track.map((point) => point.y);
    const lowest = Math.min(...heights);
    const planted = lowest + (Math.max(...heights) - lowest) * 0.15;
    for (let step = 1; step < track.length; step += 1) {
      const [a, b] = [track[step - 1], track[step]];
      if (a.y <= planted && b.y <= planted) speeds.push(Math.hypot(b.x - a.x, b.z - a.z) / dt);
    }
  }
  speeds.sort((a, b) => a - b);
  // The upper quartile: around touchdown and toe-off a planted foot is still slowing or speeding up.
  return speeds[Math.floor(speeds.length * 0.75)] ?? 0;
}

// The same clips the actor picks for each gait (by name; the shortest when several match).
const clipFor = (role) => gltf.animations.filter((clip) => clip.name.toLowerCase().replace(/[^a-z0-9]/g, "").includes(role)).sort((a, b) => a.duration - b.duration)[0];
const scale = asset.scale ?? 1;
const actor = { ...asset.actor };
for (const role of ["walk", "run", "sprint"]) {
  const clip = clipFor(role);
  if (!clip) continue;
  const speed = Math.round(plantedSpeed(clip) * scale * 100) / 100;
  actor[`${role}ClipSpeed`] = speed;
  console.log(`${role}: ${clip.name}, ${speed} units/s at the model's own size`);
}
// Only the actor block is rewritten, so the rest of the file keeps its hand-made layout.
const source = fs.readFileSync(assetFile, "utf8");
const block = JSON.stringify(actor, null, 2).replace(/\n/g, "\n  ");
fs.writeFileSync(assetFile, asset.actor ? source.replace(/"actor": \{[^}]*\}/, `"actor": ${block}`) : `${JSON.stringify({ ...asset, actor }, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, assetFile)}`);
