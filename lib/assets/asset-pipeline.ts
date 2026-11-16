import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Logger, NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { dedup, getBounds, meshopt, prune, resample, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { getPrefabDefinition } from "@/lib/prefabs/prefab-library";
import { addOutlineNormals } from "./outline-normals";
import { BASE_VERTEX_ATTRIBUTES, isAssetId, validateAssetMetadata, type AssetManifest, type AssetManifestEntry, type AssetMetadata } from "./asset-types";

/**
 * The model pipeline (Node only): reads every folder in assets/models,
 * checks its metadata, optimises the model and writes the result and a
 * manifest to public/assets/models.
 *
 * Optimisation: vertex attributes nobody reads dropped (asset.json can keep
 * more), clips trimmed to the ones asked for and root motion removed,
 * transparency turned into alpha testing where asked, duplicate accessors and
 * materials merged, unused data removed, animation keyframes resampled
 * (redundant keys dropped), vertices welded, then meshopt compression
 * (smaller files, decoded on the GPU-friendly path by the loader). Textures
 * are re-encoded as WebP (quality 90, alpha lossless, so cut-out edges stay
 * exact) and capped at `maxTextureSize`.
 *
 * Work is skipped for models whose source and metadata have not changed.
 */
/** Raise when the optimisation steps change, so every output is rebuilt. */
// 4: prune keeps the attributes prepareDocument chose (it dropped COLOR_1 before). 5: outline normals.
const PIPELINE_VERSION = 5;

/** Largest texture side kept unless asset.json says otherwise. */
export const DEFAULT_MAX_TEXTURE_SIZE = 2048;
const TEXTURE_QUALITY = 90;

/** Sizes above these are reported as warnings; they do not fail the run. */
export const ASSET_BUDGET = { bytes: 1_500_000, triangles: 60_000 };

export type AssetReportRow = AssetManifestEntry & { status: "built" | "unchanged"; warnings: string[] };
export type AssetReport = { rows: AssetReportRow[]; errors: string[]; removed: string[] };

export function getAssetSourceRoot(root = process.cwd()) {
  return path.join(root, "assets", "models");
}

export function getAssetOutputRoot(root = process.cwd()) {
  return path.join(root, "public", "assets", "models");
}

async function createIO() {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });
}

function describe(document: Document) {
  const root = document.getRoot();
  let triangles = 0;
  let vertices = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      const count = primitive.getIndices()?.getCount() ?? position?.getCount() ?? 0;
      triangles += Math.floor(count / 3);
      vertices += position?.getCount() ?? 0;
    }
  }
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const bounds = scene ? getBounds(scene) : { min: [0, 0, 0], max: [0, 0, 0] };
  return {
    triangles,
    vertices,
    meshes: root.listMeshes().length,
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    animations: root.listAnimations().map((animation) => animation.getName()),
    attributes: [...new Set(root.listMeshes().flatMap((mesh) => mesh.listPrimitives().flatMap((primitive) => primitive.listSemantics())))].sort(),
    skinned: root.listSkins().length > 0,
    bounds: { min: [...bounds.min] as [number, number, number], max: [...bounds.max] as [number, number, number] },
  };
}

/**
 * The per-model steps asset.json asks for, applied before the generic ones.
 * Returns a problem to report, or null.
 */
export function prepareDocument(document: Document, metadata: AssetMetadata): string | null {
  const root = document.getRoot();
  const keep = new Set([...BASE_VERTEX_ATTRIBUTES, ...(metadata.attributes ?? [])]);
  const present = new Set<string>();
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) {
        present.add(semantic);
        if (!keep.has(semantic)) primitive.setAttribute(semantic, null);
      }
    }
  }
  const missingAttribute = (metadata.attributes ?? []).find((name) => !present.has(name));
  if (missingAttribute) return `attribute ${missingAttribute} is not in the model (it has: ${[...present].sort().join(", ")}).`;

  if (metadata.animations) {
    const names = root.listAnimations().map((animation) => animation.getName());
    const missing = metadata.animations.find((name) => !names.includes(name));
    if (missing) return `animation "${missing}" is not in the model (it has: ${names.join(", ") || "none"}).`;
    for (const animation of root.listAnimations()) {
      if (metadata.animations.includes(animation.getName())) continue;
      animation.listChannels().forEach((channel) => channel.dispose());
      animation.listSamplers().forEach((sampler) => sampler.dispose());
      animation.dispose();
    }
  }
  if (metadata.rootMotionNode) {
    if (!root.listNodes().some((node) => node.getName() === metadata.rootMotionNode)) return `rootMotionNode "${metadata.rootMotionNode}" is not a node of the model.`;
    for (const animation of root.listAnimations()) {
      for (const channel of animation.listChannels()) {
        if (channel.getTargetPath() !== "translation" || channel.getTargetNode()?.getName() !== metadata.rootMotionNode) continue;
        channel.getSampler()?.dispose();
        channel.dispose();
      }
    }
  }
  if (metadata.alpha) {
    for (const material of root.listMaterials()) {
      if (metadata.alpha === "opaque") material.setAlphaMode("OPAQUE");
      else if (material.getAlphaMode() !== "OPAQUE") material.setAlphaMode("MASK").setAlphaCutoff(metadata.alphaCutoff ?? 0.5);
    }
  }
  return null;
}

/**
 * Every texture as WebP, no larger than maxSize on either side, with sharp
 * directly so alpha is kept lossless (cut-out edges stay exact). three.js's
 * GLTFLoader reads EXT_texture_webp. The sharp devDependency must be the
 * version @gltf-transform/functions loads (through ndarray-pixels): two
 * copies of libvips in one process fail with "colourspace: parameter space
 * not set".
 */
export async function compressTextures(document: Document, maxSize: number) {
  const textures = document.getRoot().listTextures();
  if (textures.length === 0) return;
  for (const texture of textures) {
    const image = texture.getImage();
    if (!image) continue;
    const encoded = await sharp(Buffer.from(image))
      .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
      .webp({ quality: TEXTURE_QUALITY, alphaQuality: 100, effort: 6 })
      .toBuffer();
    texture.setImage(new Uint8Array(encoded)).setMimeType("image/webp");
    const uri = texture.getURI();
    if (uri) texture.setURI(uri.replace(/\.(png|jpe?g)$/i, ".webp"));
  }
  document.createExtension(EXTTextureWebP).setRequired(true);
}

export async function processAssets(options: { root?: string; force?: boolean } = {}): Promise<AssetReport> {
  const sourceRoot = getAssetSourceRoot(options.root);
  const outputRoot = getAssetOutputRoot(options.root);
  fs.mkdirSync(outputRoot, { recursive: true });
  const manifestFile = path.join(outputRoot, "manifest.json");
  const previous: AssetManifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")) as AssetManifest : { version: 1, assets: [] };
  const report: AssetReport = { rows: [], errors: [], removed: [] };
  const io = await createIO();
  const folders = fs.existsSync(sourceRoot)
    ? fs.readdirSync(sourceRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : [];

  for (const id of folders) {
    const folder = path.join(sourceRoot, id);
    const fail = (message: string) => report.errors.push(`${id}: ${message}`);
    if (!isAssetId(id)) {
      fail("folder name must be lowercase letters, digits and dashes.");
      continue;
    }
    const metadataFile = path.join(folder, "asset.json");
    const modelFile = ["model.glb", "model.gltf"].map((name) => path.join(folder, name)).find((file) => fs.existsSync(file));
    if (!fs.existsSync(metadataFile)) {
      fail("asset.json is missing.");
      continue;
    }
    if (!modelFile) {
      fail("model.glb (or model.gltf) is missing.");
      continue;
    }

    let metadata: AssetMetadata;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
      const problems = validateAssetMetadata(parsed);
      if (problems.length > 0) {
        problems.forEach(fail);
        continue;
      }
      metadata = parsed as AssetMetadata;
    } catch (error) {
      fail(`asset.json is not valid JSON (${error instanceof Error ? error.message : String(error)}).`);
      continue;
    }
    for (const prefabId of metadata.replacesPrefabs ?? []) {
      if (!getPrefabDefinition(prefabId)) fail(`replacesPrefabs names an unknown prefab: ${prefabId}.`);
    }

    const source = fs.readFileSync(modelFile);
    const hash = createHash("sha256").update(source).update(fs.readFileSync(metadataFile)).update(String(PIPELINE_VERSION)).digest("hex").slice(0, 12);
    const file = `${id}-${hash}.glb`;
    const cached = previous.assets.find((entry) => entry.id === id && entry.hash === hash);
    let entry: AssetManifestEntry;
    let status: AssetReportRow["status"] = "unchanged";

    if (cached && !options.force && fs.existsSync(path.join(outputRoot, file))) {
      entry = cached;
    } else {
      let document: Document;
      try {
        document = await io.read(modelFile);
        // The transforms narrate every step at the default level; the report below says what matters.
        document.setLogger(new Logger(Logger.Verbosity.WARN));
        const problem = prepareDocument(document, metadata);
        if (problem) {
          fail(problem);
          continue;
        }
        if (metadata.style?.outline) addOutlineNormals(document);
        await document.transform(dedup(), prune({ keepAttributes: true }), resample(), weld(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
        await compressTextures(document, metadata.maxTextureSize ?? DEFAULT_MAX_TEXTURE_SIZE);
      } catch (error) {
        fail(`could not be read or optimised (${error instanceof Error ? error.message : String(error)}).`);
        continue;
      }
      const stats = describe(document);
      const windSource = metadata.wind?.weightSource;
      if (windSource && windSource !== "height") {
        const attribute = { color_1: "COLOR_1", uv: "TEXCOORD_0", uv1: "TEXCOORD_1", uv2: "TEXCOORD_2" }[windSource.split("-")[0]];
        if (!attribute || !stats.attributes.includes(attribute)) {
          fail(`wind.weightSource ${windSource} needs ${attribute ?? "an attribute"}; keep it with "attributes" in asset.json.`);
          continue;
        }
      }
      if (metadata.animation && !stats.animations.includes(metadata.animation)) {
        fail(`animation "${metadata.animation}" is not in the model (it has: ${stats.animations.join(", ") || "none"}).`);
        continue;
      }
      const output = await io.writeBinary(document);
      fs.writeFileSync(path.join(outputRoot, file), output);
      entry = {
        id,
        name: metadata.name,
        category: metadata.category,
        description: metadata.description,
        scale: metadata.scale ?? 1,
        rotationY: metadata.rotationY ?? 0,
        anchor: metadata.anchor ?? "bottom",
        collision: metadata.collision ?? "blocking",
        animation: metadata.animation,
        wind: metadata.wind,
        style: metadata.style,
        variants: metadata.variants ?? [],
        replacesPrefabs: metadata.replacesPrefabs ?? [],
        tags: metadata.tags ?? [],
        file,
        hash,
        sourceBytes: source.byteLength,
        bytes: output.byteLength,
        ...stats,
      };
      status = "built";
    }

    const warnings: string[] = [];
    if (entry.bytes > ASSET_BUDGET.bytes) warnings.push(`file is ${(entry.bytes / 1024).toFixed(0)} KB (budget ${(ASSET_BUDGET.bytes / 1024).toFixed(0)} KB)`);
    if (entry.triangles > ASSET_BUDGET.triangles) warnings.push(`${entry.triangles.toLocaleString("en")} triangles (budget ${ASSET_BUDGET.triangles.toLocaleString("en")})`);
    report.rows.push({ ...entry, status, warnings });
  }

  // Outputs of models that were removed or rebuilt.
  const keep = new Set(report.rows.map((row) => row.file));
  for (const name of fs.readdirSync(outputRoot)) {
    if (name.endsWith(".glb") && !keep.has(name)) {
      fs.rmSync(path.join(outputRoot, name));
      report.removed.push(name);
    }
  }
  const manifest: AssetManifest = {
    version: 1,
    assets: report.rows.map((row) => {
      const entry: Partial<AssetReportRow> = { ...row };
      delete entry.status;
      delete entry.warnings;
      return entry as AssetManifestEntry;
    }),
  };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return report;
}

/** The report as a table for the terminal. */
export function formatAssetReport(report: AssetReport) {
  const lines: string[] = [];
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
  if (report.rows.length === 0 && report.errors.length === 0) lines.push("No models in assets/models.");
  for (const row of report.rows) {
    const saved = row.sourceBytes > 0 ? Math.round((1 - row.bytes / row.sourceBytes) * 100) : 0;
    lines.push(
      `${row.id.padEnd(24)} ${kb(row.sourceBytes).padStart(9)} -> ${kb(row.bytes).padStart(8)} (${String(saved).padStart(3)}% smaller)  ` +
      `${row.triangles.toLocaleString("en").padStart(8)} tris  ${row.textures} tex  ${row.animations.length} anim  [${row.status}]`,
    );
    for (const warning of row.warnings) lines.push(`  warning: ${warning}`);
  }
  const total = report.rows.reduce((sum, row) => sum + row.bytes, 0);
  if (report.rows.length > 0) lines.push(`${report.rows.length} model${report.rows.length === 1 ? "" : "s"}, ${kb(total)} in public/assets/models`);
  for (const error of report.errors) lines.push(`error: ${error}`);
  return lines.join("\n");
}
