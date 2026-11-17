import * as THREE from "three";
import type { TerrainChunkBuffers } from "./terrain-chunk";

/**
 * The look of voxel terrain: textured blocks under one fixed light, and the
 * reveal that grows each cell out of the loader platform.
 *
 * The shading is the original project's, kept line for line where it decides
 * what a pixel looks like. What changed is how the data gets there:
 *
 * - one texture array instead of nine strips: one sampler, and each tile has
 *   its own mipmaps, so distant terrain is smooth instead of noisy while
 *   close terrain keeps its crisp pixels;
 * - 46 bytes per vertex instead of 84: normals and colours as bytes, the four
 *   texture parameters and the per-cell variation in one byte vector, and the
 *   reveal data (cell origin + delay) in one float vector.
 */
export type TerrainUniforms = {
  /** How far the reveal wave has travelled. Cells appear when it passes their delay. */
  uExpansionProgress: { value: number };
  uTime: { value: number };
  /** 0-1: how strongly the loader platform bobs. */
  uLoaderMotion: { value: number };
};

/**
 * Editor-only view options: the cell grid drawn on every face, and "hide
 * terrain material" (one flat colour instead of textures). Compiled in only
 * for the editor's terrain, so the visitor's shader is untouched.
 */
export type EditorTerrainUniforms = {
  uGridLines: { value: number };
  uGridColor: { value: THREE.Color };
  uNeutral: { value: number };
  uNeutralColor: { value: THREE.Color };
};

export function createEditorTerrainUniforms(): EditorTerrainUniforms {
  return {
    uGridLines: { value: 1 },
    uGridColor: { value: new THREE.Color("#9a9f98") },
    uNeutral: { value: 0 },
    uNeutralColor: { value: new THREE.Color("#f7f7f2") },
  };
}

/** A progress value past every cell's delay: the whole world is shown. */
export const REVEAL_COMPLETE = 1000;

export function createTerrainUniforms(): TerrainUniforms {
  return { uExpansionProgress: { value: REVEAL_COMPLETE }, uTime: { value: 0 }, uLoaderMotion: { value: 0 } };
}

const TILE = 64;
/** Tiles per texture kind, in texture-kind order (kind 1 first). See SURFACE_TEXTURE_KINDS. */
const TILE_ROWS: string[][] = [
  ["grass-top", "grass-top-02", "grass-top-03", "grass-top-04"],
  ["grass-side", "grass-side-02", "grass-side-03"],
  ["dirt", "dirt-02", "dirt-03", "dirt-04"],
  ["stone-01", "stone-02", "stone-03", "stone-04"],
  ["mossy-stone-01", "mossy-stone-02", "mossy-stone-03"],
  ["path-dirt-01", "path-dirt-02", "path-dirt-03", "path-dirt-04"],
  ["wood-planks-01", "wood-planks-02", "wood-planks-03"],
  ["sand-01", "sand-02", "sand-03", "sand-04"],
  ["riverbed-01", "riverbed-02", "riverbed-03", "riverbed-04"],
];
const TILE_NAMES = TILE_ROWS.flat();
/** Layer of each kind's first tile; a tile's layer is this plus its variant. */
const KIND_FIRST_LAYER = TILE_ROWS.map((_, kind) => TILE_ROWS.slice(0, kind).reduce((sum, row) => sum + row.length, 0));

export type TerrainAtlas = {
  texture: THREE.Texture;
  /** Resolves when every tile is in the texture. */
  ready: Promise<void>;
};

let sharedAtlas: TerrainAtlas | null = null;

/**
 * The terrain textures as one array texture, a layer per tile. The texture
 * object exists at once (so materials can be created before anything has
 * downloaded) and is filled in when the tiles arrive. Tiles are decoded off
 * the main thread.
 */
export function getTerrainAtlas(): TerrainAtlas {
  if (sharedAtlas) return sharedAtlas;
  const layerBytes = TILE * TILE * 4;
  const data = new Uint8Array(layerBytes * TILE_NAMES.length);
  const texture = new THREE.DataArrayTexture(data, TILE, TILE, TILE_NAMES.length);
  texture.format = THREE.RGBAFormat;
  texture.colorSpace = THREE.SRGBColorSpace;
  // Up close a texel is a crisp square, as the art intends; far away the mipmaps average it.
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TILE;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingEnabled = false;

  const ready = Promise.all(TILE_NAMES.map(async (name) => {
    const response = await fetch(`/textures/terrain/${name}.png`);
    if (!response.ok) throw new Error(`Terrain texture ${name} failed to load (${response.status}).`);
    return createImageBitmap(await response.blob());
  })).then((bitmaps) => {
    bitmaps.forEach((bitmap, layer) => {
      context.clearRect(0, 0, TILE, TILE);
      context.drawImage(bitmap, 0, 0, TILE, TILE);
      bitmap.close();
      const pixels = context.getImageData(0, 0, TILE, TILE).data;
      // Data textures are stored bottom row first; images come top row first.
      for (let row = 0; row < TILE; row += 1) {
        const source = (TILE - 1 - row) * TILE * 4;
        data.set(pixels.subarray(source, source + TILE * 4), layer * layerBytes + row * TILE * 4);
      }
    });
    texture.needsUpdate = true;
  });
  sharedAtlas = { texture, ready };
  return sharedAtlas;
}

const VERTEX_SHADER = /* glsl */ `
  // Shadows from models and prefabs, when the map has them (three.js's own shadow code).
  #include <common>
  #include <shadowmap_pars_vertex>

  uniform float uExpansionProgress;
  uniform float uTime;
  uniform float uLoaderMotion;

  attribute vec3 color;
  // x: texture kind, y: variant, z: rotation (0-3) + 4 if mirrored, w: variation * 255.
  attribute vec4 aTex;
  // xyz: centre of the cell the vertex belongs to, w: reveal delay; negative marks the loader platform.
  attribute vec4 aReveal;

  varying vec3 vNormal;
  varying vec3 vBlockColor;
  varying float vVariation;
  varying vec2 vUv;
  varying float vTextureKind;
  varying float vTextureVariant;
  varying float vUvRotation;
  varying float vUvMirror;

  float easeOutBack(float x) {
    float c1 = 1.2;
    float c3 = c1 + 1.0;
    return 1.0 + c3 * pow(x - 1.0, 3.0) + c1 * pow(x - 1.0, 2.0);
  }

  void main() {
    float centerFlag = aReveal.w < 0.0 ? 1.0 : 0.0;
    float variation = aTex.w / 255.0;
    float revealWindow = 0.22;
    float reveal = centerFlag > 0.5
      ? 1.0
      : clamp((uExpansionProgress - aReveal.w) / revealWindow, 0.0, 1.0);
    float easedReveal = clamp(easeOutBack(reveal), 0.0, 1.08);

    // Each cell's real, shape-accurate geometry grows outward from that cell's own centre.
    vec3 grownPosition = mix(aReveal.xyz, position, easedReveal);
    grownPosition.y -= (1.0 - easedReveal) * 5.0;

    float loaderWave = sin(uTime * 2.3 + variation * 6.28318) * 0.13 * uLoaderMotion * centerFlag;
    grownPosition.y += loaderWave;

    vNormal = normalize(normalMatrix * normal);
    vBlockColor = color;
    vVariation = variation;
    vUv = uv;
    vTextureKind = aTex.x;
    vTextureVariant = aTex.y;
    vUvRotation = mod(aTex.z, 4.0);
    vUvMirror = step(3.5, aTex.z);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(grownPosition, 1.0);

    vec4 worldPosition = modelMatrix * vec4(grownPosition, 1.0);
    vec3 transformedNormal = normalMatrix * normal;
    #include <shadowmap_vertex>
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp sampler2DArray;
  #include <common>
  #include <packing>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>
  uniform sampler2DArray uAtlas;
  // Layer of each texture kind's first tile, indexed by kind - 1.
  uniform float uKindLayer[${TILE_ROWS.length}];

  varying vec3 vNormal;
  varying vec3 vBlockColor;
  varying float vVariation;
  varying vec2 vUv;
  varying float vTextureKind;
  varying float vTextureVariant;
  varying float vUvRotation;
  varying float vUvMirror;

  vec2 transformUv(vec2 sourceUv) {
    vec2 result = sourceUv;
    if (vUvMirror > 0.5) result.x = 1.0 - result.x;
    if (vUvRotation > 2.5) return vec2(result.y, 1.0 - result.x);
    if (vUvRotation > 1.5) return vec2(1.0 - result.x, 1.0 - result.y);
    if (vUvRotation > 0.5) return vec2(1.0 - result.y, result.x);
    return result;
  }

  #ifdef EDITOR_VIEW
  uniform float uGridLines;
  uniform vec3 uGridColor;
  uniform float uNeutral;
  uniform vec3 uNeutralColor;
  #endif

  void main() {
    vec3 base = vBlockColor;
    #ifdef EDITOR_VIEW
    if (uNeutral > 0.5) {
      base = uNeutralColor;
    } else
    #endif
    if (vTextureKind > 0.5) {
      int kind = int(floor(vTextureKind + 0.5)) - 1;
      float layer = uKindLayer[kind] + floor(vTextureVariant + 0.5);
      base = texture(uAtlas, vec3(transformUv(vUv), layer)).rgb;
      base *= mix(0.94, 1.06, vVariation);
    }
    vec3 lightDirection = normalize(vec3(0.35, 0.8, 0.42));
    float light = clamp(dot(normalize(vNormal), lightDirection), 0.0, 1.0);
    vec3 color = base * (0.48 + light * 0.52);
    color += vec3(0.035, 0.028, 0.018);
    // 1 outside shadows and when the map has none; the light's shadow intensity sets how dark.
    color *= getShadowMask();

    #ifdef EDITOR_VIEW
    if (uGridLines > 0.5) {
      // A thin line along each face's edges: every face spans one cell, so its UVs run 0-1 across it.
      vec2 edge = min(vUv, 1.0 - vUv) / max(fwidth(vUv), vec2(1e-4));
      float line = 1.0 - clamp(min(edge.x, edge.y) - 0.25, 0.0, 1.0);
      color = mix(color, uGridColor, line * 0.42);
    }
    #endif

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createTerrainMaterial(uniforms: TerrainUniforms, atlas: THREE.Texture = getTerrainAtlas().texture, editor?: EditorTerrainUniforms) {
  return new THREE.ShaderMaterial({
    // Light uniforms only for the shadow maps: the terrain keeps the original's own fixed light.
    lights: true,
    uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.lights]), ...uniforms, ...editor, uAtlas: { value: atlas }, uKindLayer: { value: KIND_FIRST_LAYER } },
    defines: editor ? { EDITOR_VIEW: 1 } : {},
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.FrontSide,
  });
}

/** A chunk's buffers as a geometry for the terrain material. */
export function createTerrainGeometry(buffers: TerrainChunkBuffers) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(buffers.normals, 3, true));
  geometry.setAttribute("color", new THREE.BufferAttribute(buffers.colors, 3, true));
  geometry.setAttribute("uv", new THREE.BufferAttribute(buffers.uvs, 2));
  geometry.setAttribute("aTex", new THREE.BufferAttribute(buffers.tex, 4));
  geometry.setAttribute("aReveal", new THREE.BufferAttribute(buffers.reveal, 4));
  geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  geometry.userData.summary = buffers.summary;
  return geometry;
}
