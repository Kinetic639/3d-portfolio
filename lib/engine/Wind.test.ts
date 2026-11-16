import { describe, expect, it } from "vitest";
import { windDebugViews } from "@/lib/editor/wind-debug";
import { DEFAULT_MAP_ENVIRONMENT, validateMapDefinition, type MapDefinition } from "@/lib/maps/map-definition";
import { readMap } from "@/lib/maps/map-store";
import { ModelWindRegistry } from "./model-wind";
import { ModelLibrary } from "./model-library";
import { matchWindPreset, resolveWind, Wind, WIND_PRESETS, windVertexChunk, windWeightSources } from "./wind";

describe("wind", () => {
  it("fills the fields older maps do not have and recognises presets", () => {
    expect(resolveWind({ direction: 90, strength: 0.25 })).toEqual({ direction: 90, strength: 0.25, enabled: true, speed: 1, gustStrength: 0, gustFrequency: 0.1, turbulence: 0 });
    expect(matchWindPreset({ direction: 12, ...WIND_PRESETS.storm })).toBe("storm");
    expect(matchWindPreset({ ...WIND_PRESETS.windy, direction: 0, strength: 0.7 })).toBeNull();
  });

  it("points the wind along the compass and is still when off, calm or stilled", () => {
    const wind = new Wind();
    wind.apply({ direction: 90, ...WIND_PRESETS.windy });
    expect(wind.uniforms.uWindDirection.value.x).toBeCloseTo(1);
    expect(wind.uniforms.uWindDirection.value.y).toBeCloseTo(0);
    wind.apply({ direction: 0, ...WIND_PRESETS.windy });
    expect(wind.uniforms.uWindDirection.value.y).toBeCloseTo(-1); // north = -Z
    expect(wind.active).toBe(true);
    wind.apply({ direction: 0, ...WIND_PRESETS.calm });
    expect(wind.active).toBe(false);
    wind.apply({ direction: 0, ...WIND_PRESETS.storm, enabled: false });
    expect([wind.active, wind.uniforms.uWindStrength.value]).toEqual([false, 0]);
    wind.apply({ direction: 0, ...WIND_PRESETS.storm });
    wind.setStilled(true);
    expect([wind.active, wind.uniforms.uWindStrength.value, wind.uniforms.uWindTurbulence.value]).toEqual([false, 0, 0]);
  });

  it("gusts on the upper part of a sine, within the gust strength, and keeps time only while active", () => {
    const wind = new Wind();
    wind.apply({ direction: 0, ...WIND_PRESETS.strongWind });
    let peak = 0;
    for (let step = 0; step < 600; step += 1) {
      wind.update(1 / 60);
      peak = Math.max(peak, wind.uniforms.uWindGust.value);
    }
    expect(peak).toBeGreaterThan(0.3);
    expect(peak).toBeLessThanOrEqual(WIND_PRESETS.strongWind.gustStrength + 1e-9);
    expect(wind.uniforms.uWindTime.value).toBeCloseTo(10, 5);
    wind.setStilled(true);
    wind.update(1);
    expect(wind.uniforms.uWindTime.value).toBeCloseTo(10, 5);
  });

  it("offers weight sources from the model's attributes and compiles only the chosen one", () => {
    expect(windWeightSources(["POSITION", "COLOR_1", "TEXCOORD_0"])).toEqual(["color_1-r", "color_1-g", "color_1-b", "color_1-a", "uv-x", "uv-y", "height"]);
    expect(windWeightSources(["POSITION"])).toEqual(["height"]);
    const pine = windVertexChunk("color_1-r", ["COLOR_1", "TEXCOORD_0"]);
    expect(pine).toContain("attribute vec4 color_1;");
    expect(pine).toContain("clamp(color_1.r, 0.0, 1.0)");
    expect(pine).toContain("color_1.g * 6.2831853");
    // A source the model lacks falls back to height, and no attribute is declared that does not exist.
    const plain = windVertexChunk("color_1-r", ["TEXCOORD_0"]);
    expect(plain).not.toContain("color_1");
    expect(plain).toContain("smoothstep(uTreeMinY, uTreeMaxY, localPosition.y)");
    expect(windVertexChunk("uv1-x", ["TEXCOORD_1"])).toContain("#ifndef USE_UV1");
  });

  it("lists debug views for what the model carries", () => {
    expect(windDebugViews(["POSITION", "COLOR_0", "COLOR_1", "TEXCOORD_0"], true)).toEqual([
      "normal", "weight", "height", "color-r", "color-g", "color-b", "color-a", "color_1-r", "color_1-g", "color_1-b", "color_1-a", "uv",
    ]);
    expect(windDebugViews(["POSITION", "TEXCOORD_0"], false)).toEqual(["normal", "height", "uv"]);
  });
});

describe("model wind registry", () => {
  const library = new ModelLibrary({
    version: 1,
    assets: [{
      id: "pine", name: "Pine", category: "nature", scale: 1, rotationY: 0, anchor: "bottom", collision: "blocking", variants: [], replacesPrefabs: [], tags: [],
      file: "pine.glb", hash: "h", sourceBytes: 1, bytes: 1, triangles: 1, vertices: 1, meshes: 1, materials: 1, textures: 1, animations: [], skinned: false,
      attributes: ["COLOR_1", "NORMAL", "POSITION", "TEXCOORD_0"], bounds: { min: [0, 0, 0], max: [1, 8, 1] },
      wind: { sway: 0.7, branches: 0.55, leaves: 0.32, stiffness: 1, weightSource: "color_1-r" },
    }, {
      id: "rock", name: "Rock", category: "nature", scale: 1, rotationY: 0, anchor: "bottom", collision: "blocking", variants: [], replacesPrefabs: [], tags: [],
      file: "rock.glb", hash: "h", sourceBytes: 1, bytes: 1, triangles: 1, vertices: 1, meshes: 1, materials: 1, textures: 1, animations: [], skinned: false,
      attributes: ["POSITION"], bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    }],
  });

  it("binds only wind-reactive models, with the map's overrides over the model's defaults", () => {
    const registry = new ModelWindRegistry(library, new Wind(), { pine: { wind: { sway: 1.4 } } });
    expect(registry.forModel("rock")).toBeNull();
    const pine = registry.forModel("pine")!;
    expect(pine.weightSource).toBe("color_1-r");
    expect(pine.uniforms.uTreeSwayResponse.value).toBe(1.4);
    expect(pine.uniforms.uBranchResponse.value).toBe(0.55);
    expect([pine.uniforms.uTreeMinY.value, pine.uniforms.uTreeMaxY.value]).toEqual([0, 8]);
    expect(registry.forModel("pine")).toBe(pine); // shared by every batch of the model
  });

  it("updates values in place and asks for a rebuild only when the weight source changes", () => {
    const registry = new ModelWindRegistry(library, new Wind(), undefined);
    const pine = registry.forModel("pine")!;
    expect(registry.update({ pine: { wind: { leaves: 1 } } })).toBe(false);
    expect(pine.uniforms.uLeafResponse.value).toBe(1);
    expect(registry.update({ pine: { wind: { weightSource: "height" } } })).toBe(true);
    expect(registry.forModel("pine")!.weightSource).toBe("height");
    // A source the model cannot provide is read as height.
    expect(registry.response("pine")).toMatchObject({ weightSource: "height" });
    expect(new ModelWindRegistry(library, new Wind(), { pine: { wind: { weightSource: "uv2-x" } } }).response("pine")?.weightSource).toBe("height");
  });
});

describe("map wind and model settings", () => {
  const map = readMap("portfolio-main");
  const withPatch = (patch: Partial<MapDefinition>) => validateMapDefinition({ ...map, ...patch });

  it("accepts the full wind and per-model settings, and old maps without them", () => {
    expect(withPatch({ environment: { ...DEFAULT_MAP_ENVIRONMENT, wind: { direction: 32, ...WIND_PRESETS.storm } } }).ok).toBe(true);
    expect(withPatch({ modelSettings: { "pine-tree-fluffy": { wind: { sway: 1, weightSource: "color_1-g" } } } }).ok).toBe(true);
    expect(validateMapDefinition(map).ok).toBe(true);
  });

  it("names wind and model settings that are out of range", () => {
    const result = withPatch({
      environment: { ...DEFAULT_MAP_ENVIRONMENT, wind: { direction: 32, strength: 1, speed: 9, turbulence: -1 } },
      modelSettings: { "pine-tree-fluffy": { wind: { stiffness: 0, weightSource: "color_7-r" } } },
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toEqual(expect.arrayContaining([
      "Wind speed must be between 0 and 3.",
      "Wind turbulence must be between 0 and 1.",
      "modelSettings.pine-tree-fluffy.wind.stiffness is out of range.",
      "modelSettings.pine-tree-fluffy.wind.weightSource is not a known source.",
    ]));
  });
});
