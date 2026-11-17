import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { listMapIds, readMap } from "@/lib/maps/map-store";
import type { MapDefinition } from "@/lib/maps/map-definition";
import { SURFACE_TEXTURE_KINDS } from "@/lib/terrain/surface-faces";
import { describeMinimap, readMinimapColumns, type MinimapColumns, type MinimapData } from "./minimap";
import { MINIMAP_OUTPUT } from "./minimap-store";

/**
 * Draws the minimap images at build time (`pnpm assets`): the playable area
 * from above, each column in the average colour of its top texture, shaded
 * by height like a relief map, with the placed objects' footprints. Written
 * to public/assets/minimap/<mapId>.webp with <mapId>.json beside it (zones,
 * pins, the image's hashed URL).
 */

/** Pixels per map column. */
export const MINIMAP_SCALE = 8;
const OUTPUT = MINIMAP_OUTPUT;
const TEXTURES = path.join("public", "textures", "terrain");

const TEXTURE_FILES: Record<number, string> = {
  [SURFACE_TEXTURE_KINDS.GrassTop]: "grass-top.png",
  [SURFACE_TEXTURE_KINDS.GrassSide]: "grass-side.png",
  [SURFACE_TEXTURE_KINDS.Dirt]: "dirt.png",
  [SURFACE_TEXTURE_KINDS.Stone]: "stone-01.png",
  [SURFACE_TEXTURE_KINDS.MossyStone]: "mossy-stone-01.png",
  [SURFACE_TEXTURE_KINDS.PathDirt]: "path-dirt-01.png",
  [SURFACE_TEXTURE_KINDS.WoodPlanks]: "wood-planks-01.png",
  [SURFACE_TEXTURE_KINDS.Sand]: "sand-01.png",
  [SURFACE_TEXTURE_KINDS.Riverbed]: "riverbed-01.png",
};
const FALLBACK: [number, number, number] = [120, 128, 120];

/** Average colour of each surface texture: the minimap looks like the terrain it maps. */
async function textureColours(root: string) {
  const colours = new Map<number, [number, number, number]>();
  for (const [kind, file] of Object.entries(TEXTURE_FILES)) {
    const source = path.join(root, TEXTURES, file);
    if (!fs.existsSync(source)) continue;
    const { channels } = await sharp(source).removeAlpha().stats();
    // The terrain shader darkens and saturates its textures; a power curve brings the
    // averages close to what the world shows (grass, sand, stone checked against screenshots).
    const graded = (mean: number) => 255 * Math.pow(mean / 255, 1.6);
    colours.set(Number(kind), [graded(channels[0].mean), graded(channels[1].mean), graded(channels[2].mean)]);
  }
  return colours;
}

/** RGB pixels: flat colour per column, lit from the north-west by the height steps around it, with a dark line along each step. */
export function drawRelief(columns: MinimapColumns, colours: Map<number, [number, number, number]>, scale = MINIMAP_SCALE) {
  const { width, depth, heights, textures } = columns;
  const pixels = Buffer.alloc(width * scale * depth * scale * 3);
  const heightAt = (x: number, z: number) => heights[Math.min(width - 1, Math.max(0, x)) + width * Math.min(depth - 1, Math.max(0, z))];
  const lowest = Math.min(...Array.from(heights).filter((value) => value > -128));
  const highest = Math.max(...heights);
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const height = heightAt(x, z);
      const base = colours.get(textures[x + width * z]) ?? FALLBACK;
      // Facing the light (north-west neighbours lower): brighter; in its shadow: darker.
      const slope = (heightAt(x - 1, z) - height) + (heightAt(x, z - 1) - height);
      const light = 1 - Math.max(-2, Math.min(2, slope)) * 0.07 + (highest > lowest ? ((height - lowest) / (highest - lowest) - 0.5) * 0.16 : 0);
      for (let py = 0; py < scale; py += 1) {
        for (let px = 0; px < scale; px += 1) {
          // Steps up to the west or north cast a one-pixel dark edge.
          const edge = (px === 0 && heightAt(x - 1, z) !== height) || (py === 0 && heightAt(x, z - 1) !== height);
          const shade = edge ? light * 0.72 : light;
          const offset = ((z * scale + py) * width * scale + (x * scale + px)) * 3;
          pixels[offset] = Math.max(0, Math.min(255, base[0] * shade));
          pixels[offset + 1] = Math.max(0, Math.min(255, base[1] * shade));
          pixels[offset + 2] = Math.max(0, Math.min(255, base[2] * shade));
        }
      }
    }
  }
  return pixels;
}

/** Footprints of the placed objects, as SVG drawn over the relief: trees as round crowns, rocks as grey stones, buildings as roofs. */
export function drawObjects(definition: MapDefinition, columns: MinimapColumns, scale = MINIMAP_SCALE) {
  const shapes: string[] = [];
  for (const entity of definition.entities) {
    if (!entity.appearance.visibleAtRuntime) continue;
    const x = (entity.transform.position.x - columns.offsetX) * scale;
    const z = (entity.transform.position.z - columns.offsetZ) * scale;
    if (x < 0 || z < 0 || x > columns.width * scale || z > columns.depth * scale) continue;
    const id = `${entity.assetReference ?? ""} ${entity.prefabId ?? ""}`.toLowerCase();
    if (entity.entityType === "model") {
      if (/tree|pine|bush|plant/.test(id)) {
        shapes.push(`<circle cx="${x}" cy="${z}" r="${scale * 0.85}" fill="#14240f" opacity="0.5"/><circle cx="${x - scale * 0.15}" cy="${z - scale * 0.15}" r="${scale * 0.62}" fill="#2c4f1c"/>`);
      } else {
        shapes.push(`<circle cx="${x}" cy="${z}" r="${scale * 0.55}" fill="#8f948f" stroke="#5c615d" stroke-width="1.5"/>`);
      }
      continue;
    }
    const footprint = entity.footprintOverride ?? entity.footprint;
    const width = Math.max(1, footprint.width) * scale;
    const depth = Math.max(1, footprint.depth) * scale;
    const degrees = -((entity.transform.rotation?.y ?? 0) * 180) / Math.PI;
    shapes.push(`<g transform="translate(${x} ${z}) rotate(${degrees})"><rect x="${-width / 2 + 2}" y="${-depth / 2 + 3}" width="${width}" height="${depth}" fill="#000" opacity="0.18"/><rect x="${-width / 2}" y="${-depth / 2}" width="${width}" height="${depth}" fill="#d7d9d2" stroke="#59605b" stroke-width="2"/></g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${columns.width * scale}" height="${columns.depth * scale}">${shapes.join("")}</svg>`;
}

/** Draws one map's minimap and writes its image and data. Returns the data. */
export async function buildMinimap(mapId: string, options: { root?: string; colours?: Map<number, [number, number, number]> } = {}): Promise<MinimapData> {
  const root = options.root ?? process.cwd();
  const definition = readMap(mapId, options.root);
  const columns = readMinimapColumns(definition);
  const colours = options.colours ?? await textureColours(root);
  const relief = drawRelief(columns, colours);
  const image = await sharp(relief, { raw: { width: columns.width * MINIMAP_SCALE, height: columns.depth * MINIMAP_SCALE, channels: 3 } })
    .composite([{ input: Buffer.from(drawObjects(definition, columns)) }])
    .webp({ quality: 82, effort: 5 })
    .toBuffer();
  const hash = createHash("sha256").update(image).digest("hex").slice(0, 10);
  const data = describeMinimap(definition, columns, `/assets/minimap/${mapId}.webp?v=${hash}`);
  const directory = path.join(root, OUTPUT);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${mapId}.webp`), image);
  fs.writeFileSync(path.join(directory, `${mapId}.json`), `${JSON.stringify(data)}\n`);
  return data;
}

/** Every map's minimap. Fast (a map is a few thousand columns), so it simply runs every time. */
export async function buildMinimaps(options: { root?: string } = {}) {
  const colours = await textureColours(options.root ?? process.cwd());
  const built: Array<{ mapId: string; bytes: number }> = [];
  for (const mapId of listMapIds(options.root)) {
    await buildMinimap(mapId, { ...options, colours });
    built.push({ mapId, bytes: fs.statSync(path.join(options.root ?? process.cwd(), OUTPUT, `${mapId}.webp`)).size });
  }
  return built;
}
