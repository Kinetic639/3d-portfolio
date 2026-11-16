import { Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { computeOutlineNormals } from "@/lib/assets/outline-normals";
import { DEFAULT_MAP_ENVIRONMENT, validateMapDefinition } from "@/lib/maps/map-definition";
import { readMap } from "@/lib/maps/map-store";
import { ModelLibrary } from "./model-library";
import { ModelStyleRegistry } from "./model-style";
import { DEFAULT_LIGHTING, resolveLighting, resolveModelStyle, resolveShadows, STYLE_LAB_LIGHTING, SurfaceStyle } from "./surface-style";

describe("surface style", () => {
  it("defaults to the original look and the lab's surface values", () => {
    expect(resolveLighting(undefined)).toEqual(DEFAULT_LIGHTING);
    expect(resolveLighting({ sunIntensity: 2 })).toMatchObject({ sunIntensity: 2, sunPosition: DEFAULT_LIGHTING.sunPosition });
    expect(resolveShadows(undefined)).toMatchObject({ enabled: false, mapSize: 2048 });
    expect(STYLE_LAB_LIGHTING).toMatchObject({ sunIntensity: 2.4, sunColor: "#fff0d3", skyIntensity: 1.15 });
    expect(resolveModelStyle(undefined, undefined)).toEqual({ shading: "standard", outline: false, outlineScale: 1, contactShadow: false, castShadow: true });
    expect(resolveModelStyle({ shading: "toon", outlineScale: 0.55 }, { outlineScale: 1.2 })).toMatchObject({ shading: "toon", outlineScale: 1.2 });
  });

  it("steps the toon gradient like the lab and keeps one texture for any band count", () => {
    const style = new SurfaceStyle();
    const texture = style.gradient;
    style.apply({ ...style.settings, toonBands: 2 });
    expect([...(texture.image.data as Uint8Array)]).toEqual([54, 54, 54, 255, 255, 255]);
    style.apply({ ...style.settings, toonBands: 3 });
    expect(new Set(texture.image.data as Uint8Array).size).toBe(3);
    expect(style.gradient).toBe(texture);
  });

  it("measures outlines in pixels or in world units", () => {
    const style = new SurfaceStyle();
    style.setViewport(32, 900);
    expect(style.outline.uPixelSize.value).toBeCloseTo((2 * Math.tan((16 * Math.PI) / 180)) / 900, 8);
    style.apply({ ...style.settings, outlineMode: "world", outlineThickness: 0.012 });
    expect([style.outline.uOutlineScreen.value, style.outline.uOutlineThickness.value]).toEqual([0, 0.012]);
  });
});

describe("model style registry", () => {
  const entry = (id: string, style?: object) => ({
    id, name: id, category: "nature" as const, scale: 1, rotationY: 0, anchor: "bottom" as const, collision: "blocking" as const, variants: [], replacesPrefabs: [], tags: [],
    file: `${id}.glb`, hash: "h", sourceBytes: 1, bytes: 1, triangles: 1, vertices: 1, meshes: 1, materials: 1, textures: 0, animations: [], skinned: false,
    attributes: ["POSITION"], bounds: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] }, style,
  });
  const library = new ModelLibrary({ version: 1, assets: [entry("rock", { shading: "toon", outline: true, outlineScale: 1 }), entry("crate")] });

  it("changes outline scale live and asks for a rebuild only when batches change", () => {
    const registry = new ModelStyleRegistry(library, undefined, undefined);
    const rock = registry.forModel("rock");
    expect(rock.style.shading).toBe("toon");
    expect(registry.forModel("crate").style.shading).toBe("standard");
    expect(registry.update({ rock: { style: { outlineScale: 2 } } })).toBe(false);
    expect(rock.outlineScale.value).toBe(2);
    expect(registry.update({ rock: { style: { outlineScale: 2, shading: "standard" } } })).toBe(true);
    registry.applySurface({ contactShadow: 0.5, toonBands: 3 });
    expect(registry.options().contactOpacity.value).toBe(0.5);
  });
});

describe("outline normals", () => {
  it("gives every vertex at one position the same normal, weighted by the corners around it", () => {
    // Two faces of a box edge meeting at a right angle, with their seam vertices split (as exported hard edges are).
    const document = new Document();
    const position = document.createAccessor().setType("VEC3").setArray(new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 0, 1, // floor (normal +Y after winding below)
      0, 0, 0, 0, 1, 0, 1, 0, 0, // wall (normal +Z)
    ]));
    const indices = document.createAccessor().setType("SCALAR").setArray(new Uint16Array([0, 2, 1, 3, 5, 4]));
    const primitive = document.createPrimitive().setAttribute("POSITION", position).setIndices(indices);
    const normals = computeOutlineNormals(primitive)!;
    const at = (index: number) => [...normals.slice(index * 3, index * 3 + 3)];
    // The shared corner (vertex 0 and 3) points between the two faces.
    expect(at(0)).toEqual(at(3));
    expect(at(0)[1]).toBeGreaterThan(0.5);
    expect(Math.hypot(...at(0))).toBeCloseTo(1, 5);
    // A vertex on one face only keeps that face's normal.
    expect(at(2)).toEqual([0, 1, 0]);
  });
});

describe("map look", () => {
  const map = readMap("portfolio-main");
  it("accepts lighting, shadows and style, and names what is out of range", () => {
    const ok = validateMapDefinition({ ...map, environment: { ...DEFAULT_MAP_ENVIRONMENT, lighting: STYLE_LAB_LIGHTING, shadows: { enabled: true, mapSize: 4096 }, style: { toonBands: 4, hatchMode: "screen" } } });
    expect(ok.ok).toBe(true);
    const bad = validateMapDefinition({
      ...map,
      environment: { ...DEFAULT_MAP_ENVIRONMENT, lighting: { sunColor: "red", sunPosition: { x: 0, y: -1, z: 0 } }, shadows: { mapSize: 3000 as 2048 }, style: { toonBands: 9 } },
      modelSettings: { rock: { style: { shading: "flat" as "toon" } } },
    });
    expect(bad.ok ? [] : bad.errors).toEqual(expect.arrayContaining([
      "Environment lighting.sunColor is not valid.",
      "Environment lighting.sunPosition is not valid.",
      "Environment shadows.mapSize is not valid.",
      "Environment style.toonBands is not valid.",
      'modelSettings.rock.style.shading must be "toon" or "standard".',
    ]));
  });
});
