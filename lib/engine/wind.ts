import * as THREE from "three";
import type { MapWind, ModelWindSettings } from "@/lib/maps/map-definition";

/**
 * Wind, ported from the style lab (environment-controller.ts and
 * tree-wind.ts on the old prototype), with the same presets, gusts and
 * per-model response, on the engine's terms:
 *
 * - One set of global uniforms (`Wind.uniforms`), shared by every
 *   wind-reactive material: changing the weather changes values, never
 *   shaders.
 * - Per model, a small response block (sway, branches, leaves, stiffness)
 *   whose values the editor changes live. The vertex data that weights the
 *   motion (`weightSource`) is compiled in rather than chosen per vertex by a
 *   chain of branches, so a model's shader does only its own work; changing
 *   it in the editor recompiles that one material.
 * - The motion is computed in the vertex shader of the instanced model
 *   batches; no CPU work per tree.
 * - Wind needs continuous frames. The engine asks for them only while wind
 *   blows and a wind-reactive batch is in view, and not at all for visitors
 *   who prefer reduced motion.
 */
export type WindPreset = "calm" | "lightBreeze" | "windy" | "strongWind" | "storm";

/** Global wind with every field resolved. */
export type WindState = Required<MapWind>;

export const WIND_PRESETS: Record<WindPreset, Omit<WindState, "direction">> = {
  calm: { enabled: true, strength: 0, speed: 0.45, gustStrength: 0, gustFrequency: 0.08, turbulence: 0.02 },
  lightBreeze: { enabled: true, strength: 0.3, speed: 0.72, gustStrength: 0.12, gustFrequency: 0.1, turbulence: 0.12 },
  windy: { enabled: true, strength: 0.72, speed: 1, gustStrength: 0.28, gustFrequency: 0.16, turbulence: 0.3 },
  strongWind: { enabled: true, strength: 1.15, speed: 1.25, gustStrength: 0.45, gustFrequency: 0.2, turbulence: 0.55 },
  storm: { enabled: true, strength: 1.6, speed: 1.55, gustStrength: 0.65, gustFrequency: 0.28, turbulence: 0.85 },
};

export const WIND_PRESET_LABELS: Record<WindPreset, string> = {
  calm: "Calm",
  lightBreeze: "Light breeze",
  windy: "Windy",
  strongWind: "Strong wind",
  storm: "Storm",
};

/** A map's wind with defaults for the fields older maps do not have. */
export function resolveWind(wind: MapWind): WindState {
  return {
    direction: wind.direction,
    strength: wind.strength,
    enabled: wind.enabled ?? true,
    speed: wind.speed ?? 1,
    gustStrength: wind.gustStrength ?? 0,
    gustFrequency: wind.gustFrequency ?? 0.1,
    turbulence: wind.turbulence ?? 0,
  };
}

/** The preset a wind matches, or null when it has been tuned by hand. */
export function matchWindPreset(wind: MapWind): WindPreset | null {
  const state = resolveWind(wind);
  for (const [name, preset] of Object.entries(WIND_PRESETS) as Array<[WindPreset, Omit<WindState, "direction">]>) {
    if ((Object.keys(preset) as Array<keyof typeof preset>).every((key) => Math.abs(Number(preset[key]) - Number(state[key])) < 1e-6)) return name;
  }
  return null;
}

export type WindUniforms = {
  uWindTime: { value: number };
  /** Unit direction the wind blows towards, in world XZ. */
  uWindDirection: { value: THREE.Vector2 };
  uWindStrength: { value: number };
  uWindSpeed: { value: number };
  uWindGust: { value: number };
  uWindTurbulence: { value: number };
};

export class Wind {
  readonly uniforms: WindUniforms = {
    uWindTime: { value: 0 },
    uWindDirection: { value: new THREE.Vector2(1, 0) },
    uWindStrength: { value: 0 },
    uWindSpeed: { value: 1 },
    uWindGust: { value: 0 },
    uWindTurbulence: { value: 0 },
  };
  private state: WindState = resolveWind({ direction: 90, strength: 0.25 });
  private gustPhase = 0;
  private stilled = false;

  get settings(): WindState {
    return { ...this.state };
  }

  /** True while anything moves, so the renderer must keep drawing frames. */
  get active() {
    return !this.stilled && this.state.enabled && this.state.strength > 0;
  }

  apply(wind: MapWind) {
    this.state = resolveWind(wind);
    this.sync();
  }

  /** Whether everything is held still (reduced motion, or a test that needs a still scene). */
  get isStilled() {
    return this.stilled;
  }

  /** Holds everything still, e.g. for visitors who prefer reduced motion. */
  setStilled(stilled: boolean) {
    this.stilled = stilled;
    this.sync();
  }

  /** Advances time and the gust envelope. Same curve as the lab: gusts rise on the upper part of a sine. */
  update(deltaSeconds: number) {
    if (!this.active) return;
    const delta = Math.min(Math.max(deltaSeconds, 0), 0.1);
    this.uniforms.uWindTime.value += delta;
    this.gustPhase += delta * this.state.gustFrequency * Math.PI * 2;
    const wave = 0.5 + Math.sin(this.gustPhase) * 0.5;
    this.uniforms.uWindGust.value = THREE.MathUtils.smoothstep(wave, 0.52, 0.96) * this.state.gustStrength;
  }

  private sync() {
    const radians = THREE.MathUtils.degToRad(this.state.direction);
    // Compass: 0 = north = -Z, 90 = east = +X.
    this.uniforms.uWindDirection.value.set(Math.sin(radians), -Math.cos(radians));
    const on = !this.stilled && this.state.enabled;
    this.uniforms.uWindStrength.value = on ? this.state.strength : 0;
    this.uniforms.uWindSpeed.value = this.state.speed;
    this.uniforms.uWindTurbulence.value = on ? this.state.turbulence : 0;
    if (!on || this.state.gustStrength === 0) this.uniforms.uWindGust.value = 0;
  }
}

/* ---------- Per-model response ---------- */

/** Response with every field resolved. */
export type WindResponse = Required<ModelWindSettings>;

/** The lab's tree defaults. */
export const DEFAULT_WIND_RESPONSE: WindResponse = { sway: 0.7, branches: 0.55, leaves: 0.32, stiffness: 1, weightSource: "color_1-r" };

export function resolveWindResponse(modelDefaults: ModelWindSettings | undefined, mapOverrides: ModelWindSettings | undefined): WindResponse {
  return { ...DEFAULT_WIND_RESPONSE, ...modelDefaults, ...mapOverrides };
}

/** glTF attribute -> three.js attribute name and weight sources it offers. */
const SOURCE_ATTRIBUTES: Array<{ gltf: string; three: string; prefix: string; channels: string }> = [
  { gltf: "COLOR_1", three: "color_1", prefix: "color_1", channels: "rgba" },
  { gltf: "TEXCOORD_0", three: "uv", prefix: "uv", channels: "xy" },
  { gltf: "TEXCOORD_1", three: "uv1", prefix: "uv1", channels: "xy" },
  { gltf: "TEXCOORD_2", three: "uv2", prefix: "uv2", channels: "xy" },
];

/** Weight sources a model with these glTF attributes can use; "height" always works. */
export function windWeightSources(attributes: readonly string[]) {
  const sources: string[] = [];
  for (const source of SOURCE_ATTRIBUTES) {
    if (attributes.includes(source.gltf)) for (const channel of source.channels) sources.push(`${source.prefix}-${channel}`);
  }
  sources.push("height");
  return sources;
}

export type WindResponseUniforms = {
  uTreeSwayResponse: { value: number };
  uBranchResponse: { value: number };
  uLeafResponse: { value: number };
  uTreeStiffness: { value: number };
  /** The model's height range in its own units, for the "height" source. */
  uTreeMinY: { value: number };
  uTreeMaxY: { value: number };
};

export function createWindResponseUniforms(response: WindResponse, bounds: { min: readonly number[]; max: readonly number[] }): WindResponseUniforms {
  const uniforms: WindResponseUniforms = {
    uTreeSwayResponse: { value: 0 },
    uBranchResponse: { value: 0 },
    uLeafResponse: { value: 0 },
    uTreeStiffness: { value: 1 },
    uTreeMinY: { value: bounds.min[1] },
    uTreeMaxY: { value: bounds.max[1] },
  };
  applyWindResponse(uniforms, response);
  return uniforms;
}

export function applyWindResponse(uniforms: WindResponseUniforms, response: WindResponse) {
  uniforms.uTreeSwayResponse.value = response.sway;
  uniforms.uBranchResponse.value = response.branches;
  uniforms.uLeafResponse.value = response.leaves;
  uniforms.uTreeStiffness.value = Math.max(response.stiffness, 0.1);
}

/** GLSL expression for a weight source, given which attributes the model has. */
function weightExpression(source: string, attributes: readonly string[]) {
  if (source === "height") return "smoothstep(uTreeMinY, uTreeMaxY, localPosition.y)";
  const [prefix, channel] = source.split("-");
  const attribute = SOURCE_ATTRIBUTES.find((candidate) => candidate.prefix === prefix);
  if (!attribute || !attributes.includes(attribute.gltf) || !attribute.channels.includes(channel)) return "smoothstep(uTreeMinY, uTreeMaxY, localPosition.y)";
  return `${attribute.three}.${channel}`;
}

/**
 * The vertex code for a model: declarations and `windOffset(localPosition)`,
 * which returns the displacement in the model's own space. The motion is the
 * lab's: a slow pendulum for the whole tree, branches at their own phase
 * (COLOR_1 green when the model has it) and a fast flutter, all scaled by
 * strength and gusts, and turned into the instance's frame so rotated and
 * mirrored instances bend with the wind, not with their own axes.
 */
export function windVertexChunk(source: string, attributes: readonly string[]) {
  const hasColor1 = attributes.includes("COLOR_1");
  const declarations = [
    hasColor1 ? "attribute vec4 color_1;" : "",
    attributes.includes("TEXCOORD_1") && source.startsWith("uv1") ? "#ifndef USE_UV1\nattribute vec2 uv1;\n#endif" : "",
    attributes.includes("TEXCOORD_2") && source.startsWith("uv2") ? "#ifndef USE_UV2\nattribute vec2 uv2;\n#endif" : "",
  ].filter(Boolean).join("\n");
  return /* glsl */ `
uniform float uWindTime;
uniform vec2 uWindDirection;
uniform float uWindStrength;
uniform float uWindSpeed;
uniform float uWindGust;
uniform float uWindTurbulence;
uniform float uTreeSwayResponse;
uniform float uBranchResponse;
uniform float uLeafResponse;
uniform float uTreeStiffness;
uniform float uTreeMinY;
uniform float uTreeMaxY;
${declarations}

vec3 windOffset(vec3 localPosition) {
  float weight = clamp(${weightExpression(source, attributes)}, 0.0, 1.0);
  float upperWeight = weight * weight;
  mat3 objectToWorld = mat3(modelMatrix);
  vec4 objectPosition = vec4(localPosition, 1.0);
  #ifdef USE_INSTANCING
    objectToWorld *= mat3(instanceMatrix);
    objectPosition = instanceMatrix * objectPosition;
  #endif
  vec3 worldDirection = vec3(uWindDirection.x, 0.0, uWindDirection.y);
  vec2 direction = normalize(vec2(dot(worldDirection, normalize(objectToWorld[0])), dot(worldDirection, normalize(objectToWorld[2]))) + vec2(0.0001));
  vec2 perpendicular = vec2(-direction.y, direction.x);
  vec2 worldXZ = (modelMatrix * objectPosition).xz;
  float objectPhase = dot(worldXZ, vec2(0.73, 1.17));
  float spatialPhase = dot(worldXZ, vec2(0.81, -0.57));
  float branchPhase = ${hasColor1 ? "color_1.g * 6.2831853" : "0.0"} + spatialPhase;
  float pendulum = sin(uWindTime * uWindSpeed * 0.34 + objectPhase + localPosition.y * 0.16);
  float branch = sin(uWindTime * uWindSpeed * 1.08 + branchPhase);
  float flutter = sin(uWindTime * uWindSpeed * (4.7 + uWindTurbulence * 0.9) + branchPhase * 1.91 + dot(localPosition, vec3(2.3, 1.1, -1.7)));
  float lateralFlutter = cos(uWindTime * uWindSpeed * (5.6 + uWindTurbulence * 1.1) + branchPhase * 1.37 + spatialPhase * 2.0);
  float inverseStiffness = 1.0 / max(uTreeStiffness, 0.1);
  float coherentForce = uWindStrength * (1.0 + uWindGust);
  float fineMotion = 1.0 + uWindTurbulence * (0.45 + 0.55 * abs(lateralFlutter));
  vec2 sway = direction * pendulum * upperWeight * uTreeSwayResponse * 0.16 * inverseStiffness;
  sway += direction * branch * weight * uBranchResponse * 0.07 * inverseStiffness;
  sway += (direction * flutter + perpendicular * lateralFlutter * 0.45) * weight * uLeafResponse * fineMotion * 0.022;
  sway *= coherentForce;
  return vec3(sway.x, abs(branch) * weight * uBranchResponse * coherentForce * inverseStiffness * 0.006, sway.y);
}
`;
}
