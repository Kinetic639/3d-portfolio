import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatAssetReport, getAssetOutputRoot, getAssetSourceRoot, processAssets } from "./asset-pipeline";
import { validateAssetMetadata, type AssetManifest } from "./asset-types";
import { listLibraryItems } from "./library";

describe("asset metadata", () => {
  it("accepts the minimum and explains what is wrong otherwise", () => {
    expect(validateAssetMetadata({ name: "Rock", category: "nature" })).toEqual([]);
    expect(validateAssetMetadata({ name: "", category: "rocks" })).toEqual([
      "name is required.",
      expect.stringContaining("category must be one of"),
    ]);
    expect(validateAssetMetadata({ name: "Rock", category: "nature", scale: 0, anchor: "top", variants: [{ id: "A", label: "a" }, { id: "big", label: "Big", tint: "red" }] })).toEqual([
      "scale must be a positive number.",
      'anchor must be "bottom" or "center".',
      "every variant needs an id (lowercase, dashes) and a label.",
      "variant big: tint must look like #a1b2c3.",
    ]);
  });
});

describe("asset pipeline", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "assets-"));
  const source = getAssetSourceRoot(root);
  const output = getAssetOutputRoot(root);
  const sample = path.join(getAssetSourceRoot(), "sample-crate");
  const readManifest = () => JSON.parse(fs.readFileSync(path.join(output, "manifest.json"), "utf8")) as AssetManifest;

  beforeAll(() => {
    fs.cpSync(sample, path.join(source, "crate"), { recursive: true });
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("optimises a model, describes it in the manifest and skips it when nothing changed", async () => {
    const first = await processAssets({ root });
    expect(first.errors).toEqual([]);
    expect(first.rows).toHaveLength(1);
    const [row] = first.rows;
    expect(row).toMatchObject({ id: "crate", status: "built", triangles: 24, meshes: 2, materials: 2, anchor: "bottom", scale: 1, skinned: false });
    expect(row.variants.map((variant) => variant.id)).toEqual(["standard", "large", "painted"]);
    expect(row.file).toBe(`crate-${row.hash}.glb`);
    expect(fs.statSync(path.join(output, row.file)).size).toBe(row.bytes);
    expect(readManifest().assets.map((asset) => asset.id)).toEqual(["crate"]);
    expect(formatAssetReport(first)).toContain("1 model");

    const second = await processAssets({ root });
    expect(second.rows[0]).toMatchObject({ status: "unchanged", hash: row.hash });
  });

  it("rebuilds under a new name when metadata changes and removes the old output", async () => {
    const before = readManifest().assets[0];
    const metadataFile = path.join(source, "crate", "asset.json");
    const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8")) as Record<string, unknown>;
    fs.writeFileSync(metadataFile, JSON.stringify({ ...metadata, scale: 2, replacesPrefabs: ["no-such-prefab"] }));
    const report = await processAssets({ root });
    expect(report.errors).toEqual(["crate: replacesPrefabs names an unknown prefab: no-such-prefab."]);
    expect(report.rows[0]).toMatchObject({ status: "built", scale: 2 });
    expect(report.rows[0].hash).not.toBe(before.hash);
    expect(report.removed).toEqual([before.file]);
    expect(fs.existsSync(path.join(output, before.file))).toBe(false);
  });

  it("reports broken assets without stopping the others", async () => {
    fs.mkdirSync(path.join(source, "no-model"));
    fs.writeFileSync(path.join(source, "no-model", "asset.json"), JSON.stringify({ name: "Nothing", category: "nature" }));
    fs.cpSync(sample, path.join(source, "bad-metadata"), { recursive: true });
    fs.writeFileSync(path.join(source, "bad-metadata", "asset.json"), JSON.stringify({ name: "Bad", category: "nature", animation: "Dance" }));
    fs.cpSync(sample, path.join(source, "Bad Name"), { recursive: true });

    const report = await processAssets({ root });
    expect(report.rows.map((row) => row.id)).toEqual(["crate"]);
    expect(report.errors).toEqual(expect.arrayContaining([
      "Bad Name: folder name must be lowercase letters, digits and dashes.",
      expect.stringContaining('bad-metadata: animation "Dance" is not in the model'),
      "no-model: model.glb (or model.gltf) is missing.",
    ]));
  });
});

describe("object library", () => {
  it("lists models first and marks prefabs a model stands in for", () => {
    const manifest: AssetManifest = {
      version: 1,
      assets: [{
        id: "oak", name: "Oak", category: "nature", scale: 1, rotationY: 0, anchor: "bottom", collision: "blocking",
        variants: [], replacesPrefabs: ["deciduous-tree"], tags: [], file: "oak-abc.glb", hash: "abc", sourceBytes: 10, bytes: 5,
        triangles: 100, vertices: 80, meshes: 1, materials: 1, textures: 0, animations: [], skinned: false,
        bounds: { min: [0, 0, 0], max: [1, 2, 1] },
      }],
    };
    const items = listLibraryItems(manifest);
    expect(items[0]).toMatchObject({ key: "model:oak", kind: "model", bytes: 5, triangles: 100, animated: false, revision: "abc" });
    expect(items.find((item) => item.key === "prefab:deciduous-tree")).toMatchObject({ replacedBy: "oak" });
    expect(items.filter((item) => item.kind === "prefab" && item.replacedBy).length).toBe(1);
    expect(listLibraryItems({ version: 1, assets: [] }).every((item) => item.kind === "prefab")).toBe(true);
  });
});
