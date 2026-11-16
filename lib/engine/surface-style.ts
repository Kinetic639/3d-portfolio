import * as THREE from "three";
import type { MapLighting, MapShadows, MapSurfaceStyle, ModelStyleSettings } from "@/lib/maps/map-definition";

/**
 * The style lab's look (stylized-rock-material.ts and its panel on the old
 * prototype), on the engine's terms:
 *
 * - Toon shading: three.js's toon material with a banded gradient, plus the
 *   lab's procedural cross-hatching in the shade. Bands, hatch power, scale
 *   and mode are shared uniforms and one shared texture: changing them never
 *   compiles a shader.
 * - Outlines: the lab's inverted hull (back faces pushed out along the
 *   outline normals the model pipeline computes), as an instanced batch next
 *   to each model batch. Thickness is in screen pixels by default, so edges
 *   read the same at any camera distance; "world" mode is the lab's.
 * - Lighting and shadows: see Environment. Defaults are the original look;
 *   STYLE_LAB_LIGHTING is the lab's.
 */
export type LightingState = Required<Omit<MapLighting, "sunPosition">> & { sunPosition: { x: number; y: number; z: number } };
export type ShadowState = Required<MapShadows>;
export type SurfaceStyleState = Required<MapSurfaceStyle>;
export type ModelStyle = Required<ModelStyleSettings>;

/** The original project's lighting: white sun and white ambient light. */
export const DEFAULT_LIGHTING: LightingState = {
  sunIntensity: 1.2,
  sunColor: "#ffffff",
  sunPosition: { x: 24, y: 42, z: 18 },
  skyIntensity: 0.9,
  skyColor: "#ffffff",
  groundColor: "#ffffff",
};

/** The style lab's lighting: warm sun from the left, green-grey sky light. */
export const STYLE_LAB_LIGHTING: LightingState = {
  sunIntensity: 2.4,
  sunColor: "#fff0d3",
  sunPosition: { x: -4.5, y: 7, z: 3.5 },
  skyIntensity: 1.15,
  skyColor: "#dce8dc",
  groundColor: "#52635a",
};

export const DEFAULT_SHADOWS: ShadowState = { enabled: false, strength: 0.45, bias: -0.0004, normalBias: 0.025, mapSize: 2048 };

/** The lab's surface values, with the outline in pixels (the lab's 0.012 world units is under a pixel from this camera). */
export const DEFAULT_SURFACE_STYLE: SurfaceStyleState = {
  toonBands: 4,
  hatchStrength: 0,
  hatchScale: 2,
  hatchMode: "uv",
  outlineThickness: 1.5,
  outlineMode: "screen",
  outlineColor: "#252927",
  contactShadow: 0.22,
};

/** A model without `style` in its asset.json is drawn as before. */
export const DEFAULT_MODEL_STYLE: ModelStyle = { shading: "standard", outline: false, outlineScale: 1, contactShadow: false, castShadow: true };

export const resolveLighting = (lighting: MapLighting | undefined): LightingState => ({
  ...DEFAULT_LIGHTING,
  ...lighting,
  sunPosition: { ...(lighting?.sunPosition ?? DEFAULT_LIGHTING.sunPosition) },
});
export const resolveShadows = (shadows: MapShadows | undefined): ShadowState => ({ ...DEFAULT_SHADOWS, ...shadows });
export const resolveSurfaceStyle = (style: MapSurfaceStyle | undefined): SurfaceStyleState => ({ ...DEFAULT_SURFACE_STYLE, ...style });
export const resolveModelStyle = (defaults: ModelStyleSettings | undefined, overrides: ModelStyleSettings | undefined): ModelStyle => ({
  ...DEFAULT_MODEL_STYLE,
  ...defaults,
  ...overrides,
});

/** Shared uniforms and the gradient of the toon bands. */
export class SurfaceStyle {
  readonly hatch = {
    uHatchStrength: { value: DEFAULT_SURFACE_STYLE.hatchStrength },
    uHatchScale: { value: DEFAULT_SURFACE_STYLE.hatchScale },
    uHatchMode: { value: 0 },
  };
  readonly outline = {
    uOutlineColor: { value: new THREE.Color(DEFAULT_SURFACE_STYLE.outlineColor) },
    uOutlineThickness: { value: DEFAULT_SURFACE_STYLE.outlineThickness },
    /** 1: thickness in pixels; 0: in world units. */
    uOutlineScreen: { value: 1 },
    /** World units per pixel at distance 1: 2 tan(fov / 2) / viewport height. Set on resize. */
    uPixelSize: { value: 0.001 },
  };
  /** Width = number of bands; nearest filtering makes the steps. */
  readonly gradient: THREE.DataTexture;
  private state = DEFAULT_SURFACE_STYLE;

  constructor() {
    this.gradient = new THREE.DataTexture(new Uint8Array(6), 6, 1, THREE.RedFormat);
    this.gradient.name = "toon-gradient";
    this.gradient.minFilter = THREE.NearestFilter;
    this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.generateMipmaps = false;
    this.gradient.colorSpace = THREE.NoColorSpace;
    this.apply(DEFAULT_SURFACE_STYLE);
  }

  get settings() {
    return { ...this.state };
  }

  apply(style: SurfaceStyleState) {
    this.state = style;
    this.hatch.uHatchStrength.value = style.hatchStrength;
    this.hatch.uHatchScale.value = style.hatchScale;
    this.hatch.uHatchMode.value = style.hatchMode === "screen" ? 1 : 0;
    this.outline.uOutlineColor.value.set(style.outlineColor);
    this.outline.uOutlineThickness.value = style.outlineThickness;
    this.outline.uOutlineScreen.value = style.outlineMode === "screen" ? 1 : 0;
    this.setBands(style.toonBands);
  }

  /** For screen-space outlines: call when the camera's fov or the viewport height changes. */
  setViewport(fovDegrees: number, heightPixels: number) {
    this.outline.uPixelSize.value = (2 * Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2)) / Math.max(1, heightPixels);
  }

  private setBands(count: number) {
    // The lab's ramp: from 54 to 255 in `count` even steps. The texture keeps its size, so
    // changing the count is a data upload, not a new texture (no recompile).
    const bands = THREE.MathUtils.clamp(Math.round(count), 2, 6);
    const data = this.gradient.image.data as Uint8Array;
    for (let index = 0; index < 6; index += 1) {
      const band = Math.min(bands - 1, Math.floor((index / 6) * bands));
      data[index] = Math.round(54 + (201 * band) / (bands - 1));
    }
    this.gradient.needsUpdate = true;
  }

  dispose() {
    this.gradient.dispose();
  }
}

/** The lab's crosshatch, applied where the lit colour falls below the base colour. */
const HATCH_FRAGMENT = /* glsl */ `
  float baseLuminance = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.08);
  float litLuminance = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  float relativeLight = clamp(litLuminance / baseLuminance, 0.0, 1.25);
  float shadeAmount = 1.0 - smoothstep(0.28, 0.92, relativeLight);
  vec2 hatchPoint = mix(vStyleUv * (9.0 * uHatchScale), gl_FragCoord.xy * (0.075 * uHatchScale), step(0.5, uHatchMode));
  float hatchMask = hatchLine(hatchPoint, 1.0) * smoothstep(0.18, 0.52, shadeAmount);
  hatchMask += hatchLine(hatchPoint * 1.17 + vec2(0.31), -1.0) * smoothstep(0.58, 0.9, shadeAmount);
  hatchMask = clamp(hatchMask, 0.0, 1.0) * shadeAmount * uHatchStrength;
  outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.18, 0.21, 0.2), hatchMask);
`;

/**
 * A toon material standing in for a model's own: same texture, vertex
 * colours, alpha test and sides, with the shared gradient and hatching.
 * Its hook runs before the instance effects (pop, fade, wind), which chain onto it.
 */
export function createToonMaterial(source: THREE.Material, style: SurfaceStyle) {
  const standard = source as THREE.MeshStandardMaterial;
  const material = new THREE.MeshToonMaterial({
    name: `toon:${source.name}`,
    color: standard.color ? standard.color.clone() : new THREE.Color("#ffffff"),
    map: standard.map ?? null,
    gradientMap: style.gradient,
    vertexColors: source.vertexColors,
    alphaTest: source.alphaTest,
    side: source.side,
    transparent: false,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, style.hatch);
    shader.vertexShader = `varying vec2 vStyleUv;\n${shader.vertexShader}`.replace("#include <uv_vertex>", "#include <uv_vertex>\nvStyleUv = uv;");
    shader.fragmentShader = `uniform float uHatchStrength;
uniform float uHatchScale;
uniform float uHatchMode;
varying vec2 vStyleUv;
float hatchLine(vec2 point, float direction) {
  float diagonal = direction > 0.0 ? point.x + point.y : point.x - point.y;
  return 1.0 - smoothstep(0.055, 0.12, abs(fract(diagonal) - 0.5));
}
${shader.fragmentShader}`.replace(
      "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
      `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;\n${HATCH_FRAGMENT}`,
    );
  };
  material.customProgramCacheKey = () => "toon-hatch-v1";
  return material;
}

/**
 * The outline: back faces pushed out along the outline normals. Written
 * with three.js's own chunks, so the instance effects (pop, fade, wind)
 * attach to it exactly as to the model's material, and skinned models bend
 * it with their skeleton.
 */
export function createOutlineMaterial(style: SurfaceStyle, scale: { value: number }, source: THREE.Material) {
  const map = (source as THREE.MeshStandardMaterial).map ?? null;
  return new THREE.ShaderMaterial({
    name: "outline",
    uniforms: {
      ...style.outline,
      uOutlineScale: scale,
      uAlphaMap: { value: map },
      uAlphaTest: { value: source.alphaTest },
    },
    defines: map && source.alphaTest > 0 ? { USE_OUTLINE_ALPHA: 1 } : {},
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      attribute vec3 _outline_normal;
      uniform float uOutlineThickness;
      uniform float uOutlineScreen;
      uniform float uPixelSize;
      uniform float uOutlineScale;
      varying vec2 vOutlineUv;
      void main() {
        vOutlineUv = uv;
        vec3 objectNormal = _outline_normal;
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        mat3 toView = mat3(modelViewMatrix);
        #ifdef USE_INSTANCING
          toView = toView * mat3(instanceMatrix);
        #endif
        vec3 viewNormal = normalize(toView * objectNormal);
        float thickness = uOutlineThickness * uOutlineScale * mix(1.0, -mvPosition.z * uPixelSize, uOutlineScreen);
        mvPosition.xyz += viewNormal * thickness;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <clipping_planes_pars_fragment>
      uniform vec3 uOutlineColor;
      uniform sampler2D uAlphaMap;
      uniform float uAlphaTest;
      varying vec2 vOutlineUv;
      void main() {
        #include <clipping_planes_fragment>
        #ifdef USE_OUTLINE_ALPHA
          if (texture2D(uAlphaMap, vOutlineUv).a < uAlphaTest) discard;
        #endif
        gl_FragColor = vec4(uOutlineColor, 1.0);
      }
    `,
  });
}

/**
 * The shadow caster's material for a model whose shape the shader changes
 * (wind, pop) or whose leaves are cut out: without it the shadow would be
 * the rest pose and solid quads.
 */
export function createDepthMaterial(source: THREE.Material) {
  const material = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: (source as THREE.MeshStandardMaterial).map ?? null,
    alphaTest: source.alphaTest,
    side: source.side,
  });
  material.name = `depth:${source.name}`;
  return material;
}
