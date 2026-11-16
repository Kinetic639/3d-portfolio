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
        triangles: 100, vertices: 80, meshes: 1, materials: 1, textures: 0, animations: [], attributes: ["NORMAL", "POSITION"], skinned: false,
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

describe("per-model preparation", () => {
  /** A triangle with extra UV and colour sets, a blended material, a "root" node and two clips. */
  const build = async () => {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();
    const accessor = (type: "VEC2" | "VEC3" | "VEC4" | "SCALAR", values: number[]) => document.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
    const primitive = document.createPrimitive()
      .setAttribute("POSITION", accessor("VEC3", [0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setAttribute("TEXCOORD_0", accessor("VEC2", [0, 0, 1, 0, 0, 1]))
      .setAttribute("TEXCOORD_1", accessor("VEC2", [0, 0, 1, 0, 0, 1]))
      .setAttribute("COLOR_1", accessor("VEC4", [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]))
      .setMaterial(document.createMaterial("leaf").setAlphaMode("BLEND"));
    const root = document.createNode("root").setMesh(document.createMesh().addPrimitive(primitive));
    document.createScene().addChild(root);
    for (const name of ["Idle", "LongLoop"]) {
      const sampler = document.createAnimationSampler().setInput(accessor("SCALAR", [0, 1])).setOutput(accessor("VEC3", [0, 0, 0, 0, 0, 5]));
      const rotation = document.createAnimationSampler().setInput(accessor("SCALAR", [0, 1])).setOutput(accessor("VEC4", [0, 0, 0, 1, 0, 0, 0, 1]));
      document.createAnimation(name)
        .addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(root).setTargetPath("translation").setSampler(sampler))
        .addSampler(rotation).addChannel(document.createAnimationChannel().setTargetNode(root).setTargetPath("rotation").setSampler(rotation));
    }
    return document;
  };

  it("keeps only the attributes asked for, the clips asked for, no root motion, and alpha testing", async () => {
    const { prepareDocument } = await import("./asset-pipeline");
    const document = await build();
    expect(prepareDocument(document, { name: "Leafy", category: "nature", attributes: ["COLOR_1"], animations: ["Idle"], rootMotionNode: "root", alpha: "cutout", alphaCutoff: 0.33 })).toBeNull();
    const root = document.getRoot();
    expect(root.listMeshes()[0].listPrimitives()[0].listSemantics().sort()).toEqual(["COLOR_1", "POSITION", "TEXCOORD_0"]);
    expect(root.listAnimations().map((animation) => animation.getName())).toEqual(["Idle"]);
    expect(root.listAnimations()[0].listChannels().map((channel) => channel.getTargetPath())).toEqual(["rotation"]);
    expect(root.listMaterials()[0].getAlphaMode()).toBe("MASK");
    expect(root.listMaterials()[0].getAlphaCutoff()).toBeCloseTo(0.33);
  });

  it("names what asset.json asks for that the model does not have", async () => {
    const { prepareDocument } = await import("./asset-pipeline");
    expect(prepareDocument(await build(), { name: "A", category: "nature", attributes: ["COLOR_3"] })).toContain("attribute COLOR_3 is not in the model");
    expect(prepareDocument(await build(), { name: "A", category: "nature", animations: ["Dance"] })).toContain('animation "Dance" is not in the model');
    expect(prepareDocument(await build(), { name: "A", category: "nature", rootMotionNode: "Hips" })).toContain('rootMotionNode "Hips"');
  });

  it("validates the new asset.json fields", () => {
    expect(validateAssetMetadata({ name: "Crow", category: "creatures", attributes: ["COLOR_1"], alpha: "cutout", alphaCutoff: 0.33, animations: ["Fly"], rootMotionNode: "root" })).toEqual([]);
    expect(validateAssetMetadata({ name: "Crow", category: "creatures", attributes: ["color1"], alpha: "blend", alphaCutoff: 2, animations: "Fly" })).toEqual([
      'attributes must be glTF attribute names, e.g. ["COLOR_1"].',
      'alpha must be "cutout" or "opaque".',
      "alphaCutoff must be between 0 and 1.",
      "animations must be an array of strings.",
    ]);
  });
});
