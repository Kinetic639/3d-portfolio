import * as THREE from "three";
import type { GlobalWindUniforms } from "@/lib/environment/environment-controller";
import {
  createOutlineMaterial,
  createStylizedRockMaterial,
  type StylizedRockUniforms,
} from "./stylized-rock-material";

export type TreeWindWeightSource =
  | "color_1-r"
  | "color_1-g"
  | "color_1-b"
  | "color_1-a"
  | "uv-x"
  | "uv-y"
  | "uv1-x"
  | "uv1-y"
  | "uv2-x"
  | "uv2-y"
  | "height";

export type TreeWindResponseSettings = {
  treeSwayResponse: number;
  branchResponse: number;
  leafResponse: number;
  stiffness: number;
  weightSource: TreeWindWeightSource;
};

export const DEFAULT_TREE_WIND_RESPONSE: TreeWindResponseSettings = {
  treeSwayResponse: 0.7,
  branchResponse: 0.55,
  leafResponse: 0.32,
  stiffness: 1,
  weightSource: "color_1-r",
};

export type TreeWindResponseUniforms = {
  uTreeSwayResponse: { value: number };
  uBranchResponse: { value: number };
  uLeafResponse: { value: number };
  uTreeStiffness: { value: number };
  uWindWeightSource: { value: number };
  uTreeMinY: { value: number };
  uTreeMaxY: { value: number };
};

const WIND_SOURCE_INDEX: Record<TreeWindWeightSource, number> = {
  "color_1-r": 0,
  "color_1-g": 1,
  "color_1-b": 2,
  "color_1-a": 3,
  "uv-x": 4,
  "uv-y": 5,
  "uv1-x": 6,
  "uv1-y": 7,
  "uv2-x": 8,
  "uv2-y": 9,
  height: 10,
};

export class TreeWindResponseController {
  readonly uniforms: TreeWindResponseUniforms;

  constructor(settings: TreeWindResponseSettings = DEFAULT_TREE_WIND_RESPONSE, minY = -0.00454, maxY = 7.71007) {
    this.uniforms = {
      uTreeSwayResponse: { value: 0 },
      uBranchResponse: { value: 0 },
      uLeafResponse: { value: 0 },
      uTreeStiffness: { value: 1 },
      uWindWeightSource: { value: 0 },
      uTreeMinY: { value: minY },
      uTreeMaxY: { value: maxY },
    };
    this.apply(settings);
  }

  apply(settings: TreeWindResponseSettings) {
    this.uniforms.uTreeSwayResponse.value = settings.treeSwayResponse;
    this.uniforms.uBranchResponse.value = settings.branchResponse;
    this.uniforms.uLeafResponse.value = settings.leafResponse;
    this.uniforms.uTreeStiffness.value = Math.max(settings.stiffness, 0.1);
    this.uniforms.uWindWeightSource.value = WIND_SOURCE_INDEX[settings.weightSource];
  }
}

export class TreeStyleUniformController {
  readonly hatchUniforms: StylizedRockUniforms;

  constructor(hatchStrength: number, hatchScale: number, hatchMode: "uv" | "screen") {
    this.hatchUniforms = {
      hatchStrength: { value: hatchStrength },
      hatchScale: { value: hatchScale },
      hatchMode: { value: hatchMode === "screen" ? 1 : 0 },
    };
  }

  apply(hatchStrength: number, hatchScale: number, hatchMode: "uv" | "screen") {
    this.hatchUniforms.hatchStrength.value = hatchStrength;
    this.hatchUniforms.hatchScale.value = hatchScale;
    this.hatchUniforms.hatchMode.value = hatchMode === "screen" ? 1 : 0;
  }
}

export function getAvailableTreeWindSources(attributeNames: readonly string[]): TreeWindWeightSource[] {
  const names = new Set(attributeNames);
  const sources: TreeWindWeightSource[] = [];
  if (names.has("color_1")) sources.push("color_1-r", "color_1-g", "color_1-b", "color_1-a");
  if (names.has("uv")) sources.push("uv-x", "uv-y");
  if (names.has("uv1")) sources.push("uv1-x", "uv1-y");
  if (names.has("uv2")) sources.push("uv2-x", "uv2-y");
  sources.push("height");
  return sources;
}

const TREE_WIND_UNIFORMS = `
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
uniform float uWindWeightSource;
uniform float uTreeMinY;
uniform float uTreeMaxY;
attribute vec4 color_1;
attribute vec2 uv1;
attribute vec2 uv2;

float referenceTreeWindWeight(vec3 localPosition) {
  float source = uWindWeightSource;
  if (source < 0.5) return color_1.r;
  if (source < 1.5) return color_1.g;
  if (source < 2.5) return color_1.b;
  if (source < 3.5) return color_1.a;
  if (source < 4.5) return uv.x;
  if (source < 5.5) return uv.y;
  if (source < 6.5) return uv1.x;
  if (source < 7.5) return uv1.y;
  if (source < 8.5) return uv2.x;
  if (source < 9.5) return uv2.y;
  return smoothstep(uTreeMinY, uTreeMaxY, localPosition.y);
}

vec3 referenceTreeWindOffset(vec3 localPosition) {
  float weight = clamp(referenceTreeWindWeight(localPosition), 0.0, 1.0);
  float upperWeight = weight * weight;
  mat3 referenceObjectToWorld = mat3(modelMatrix);
  vec4 referenceObjectPosition = vec4(localPosition, 1.0);
  #ifdef USE_INSTANCING
    referenceObjectToWorld *= mat3(instanceMatrix);
    referenceObjectPosition = instanceMatrix * referenceObjectPosition;
  #endif
  vec3 referenceWorldDirection = vec3(uWindDirection.x, 0.0, uWindDirection.y);
  vec2 direction = normalize(vec2(
    dot(referenceWorldDirection, normalize(referenceObjectToWorld[0])),
    dot(referenceWorldDirection, normalize(referenceObjectToWorld[2]))
  ) + vec2(0.0001));
  vec2 perpendicular = vec2(-direction.y, direction.x);
  vec2 worldXZ = (modelMatrix * referenceObjectPosition).xz;
  float objectPhase = dot(worldXZ, vec2(0.73, 1.17));
  float spatialPhase = dot(worldXZ, vec2(0.81, -0.57));
  float branchPhase = color_1.g * 6.2831853 + spatialPhase;
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

function bindWindUniforms(
  shader: THREE.WebGLProgramParametersWithUniforms,
  globalUniforms: GlobalWindUniforms,
  responseUniforms: TreeWindResponseUniforms,
) {
  Object.assign(shader.uniforms, globalUniforms, responseUniforms);
}

function injectWindVertexShader(vertexShader: string) {
  return `${TREE_WIND_UNIFORMS}\n${vertexShader}`.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\ntransformed += referenceTreeWindOffset(position);",
  );
}

export function addTreeWindToMaterial<T extends THREE.Material & { onBeforeCompile: THREE.Material["onBeforeCompile"] }>(
  material: T,
  globalUniforms: GlobalWindUniforms,
  responseUniforms: TreeWindResponseUniforms,
  cacheKey: string,
) {
  const previousCompile = material.onBeforeCompile.bind(material);
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer);
    bindWindUniforms(shader, globalUniforms, responseUniforms);
    shader.vertexShader = injectWindVertexShader(shader.vertexShader);
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}-${cacheKey}`;
  return material;
}

export function createTreeToonMaterial(
  diffuseMap: THREE.Texture,
  gradientMap: THREE.Texture,
  hatchUniforms: StylizedRockUniforms,
  globalWindUniforms: GlobalWindUniforms,
  responseUniforms: TreeWindResponseUniforms,
) {
  const material = createStylizedRockMaterial(diffuseMap, gradientMap, hatchUniforms);
  material.name = "Reference tree toon + hatch + GPU wind";
  material.alphaTest = 0.33;
  material.transparent = false;
  material.depthWrite = true;
  material.side = THREE.DoubleSide;
  material.vertexColors = true;
  return addTreeWindToMaterial(material, globalWindUniforms, responseUniforms, "reference-tree-wind-v2");
}

export function createTreeOutlineMaterial(
  diffuseMap: THREE.Texture,
  color: THREE.ColorRepresentation,
  thickness: number,
  globalWindUniforms: GlobalWindUniforms,
  responseUniforms: TreeWindResponseUniforms,
) {
  const material = createOutlineMaterial(color, { alphaMap: diffuseMap, alphaTest: 0.33 });
  material.name = "Reference tree alpha-cutout outline + GPU wind";
  material.uniforms.uThickness.value = thickness;
  return addTreeWindToMaterial(material, globalWindUniforms, responseUniforms, "reference-tree-outline-wind-v2");
}

export function createTreeDepthMaterial(
  diffuseMap: THREE.Texture,
  globalWindUniforms: GlobalWindUniforms,
  responseUniforms: TreeWindResponseUniforms,
) {
  const material = new THREE.MeshDepthMaterial({
    name: "Reference tree alpha-cutout depth + GPU wind",
    depthPacking: THREE.RGBADepthPacking,
    map: diffuseMap,
    alphaTest: 0.33,
    side: THREE.DoubleSide,
  });
  material.vertexColors = true;
  return addTreeWindToMaterial(material, globalWindUniforms, responseUniforms, "reference-tree-depth-wind-v2");
}

export type TreeDebugMode =
  | "normal"
  | "color-r" | "color-g" | "color-b" | "color-a"
  | "color_1-r" | "color_1-g" | "color_1-b" | "color_1-a"
  | "uv" | "uv1" | "uv2" | "uv3" | "texcoord_4" | "texcoord_5" | "texcoord_6" | "texcoord_7"
  | "mask-r" | "mask-g" | "mask-b" | "mask-a"
  | "detail-r" | "detail-g" | "detail-b" | "detail-a";

const DEBUG_MODE_INDEX: Record<Exclude<TreeDebugMode, "normal">, number> = {
  "color-r": 1, "color-g": 2, "color-b": 3, "color-a": 4,
  "color_1-r": 5, "color_1-g": 6, "color_1-b": 7, "color_1-a": 8,
  uv: 9, uv1: 10, uv2: 11, uv3: 12,
  texcoord_4: 13, texcoord_5: 14, texcoord_6: 15, texcoord_7: 16,
  "mask-r": 17, "mask-g": 18, "mask-b": 19, "mask-a": 20,
  "detail-r": 21, "detail-g": 22, "detail-b": 23, "detail-a": 24,
};

export function getTreeDebugModes(attributeNames: readonly string[]): TreeDebugMode[] {
  const names = new Set(attributeNames);
  const modes: TreeDebugMode[] = ["normal"];
  if (names.has("color")) modes.push("color-r", "color-g", "color-b", "color-a");
  if (names.has("color_1")) modes.push("color_1-r", "color_1-g", "color_1-b", "color_1-a");
  for (const uv of ["uv", "uv1", "uv2", "uv3", "texcoord_4", "texcoord_5", "texcoord_6", "texcoord_7"] as const) {
    if (names.has(uv)) modes.push(uv);
  }
  modes.push("mask-r", "mask-g", "mask-b", "mask-a", "detail-r", "detail-g", "detail-b", "detail-a");
  return modes;
}

export function createTreeDebugMaterial(
  diffuseMap: THREE.Texture,
  maskMap: THREE.Texture,
  detailMap: THREE.Texture,
  globalWindUniforms: GlobalWindUniforms,
  responseUniforms: TreeWindResponseUniforms,
) {
  return new THREE.ShaderMaterial({
    name: "Reference tree attribute debug",
    uniforms: {
      ...globalWindUniforms,
      ...responseUniforms,
      uMode: { value: 1 },
      uDiffuseMap: { value: diffuseMap },
      uMaskMap: { value: maskMap },
      uDetailMap: { value: detailMap },
    },
    vertexShader: `${TREE_WIND_UNIFORMS}
      uniform float uMode;
      attribute vec2 uv3;
      attribute vec2 texcoord_4;
      attribute vec2 texcoord_5;
      attribute vec2 texcoord_6;
      attribute vec2 texcoord_7;
      varying vec2 vTreeUv;
      varying vec2 vDebugUv;
      varying vec4 vColor0;
      varying vec4 vColor1;
      void main() {
        vTreeUv = uv;
        vColor0 = color;
        vColor1 = color_1;
        if (uMode < 9.5) vDebugUv = uv;
        else if (uMode < 10.5) vDebugUv = uv1;
        else if (uMode < 11.5) vDebugUv = uv2;
        else if (uMode < 12.5) vDebugUv = uv3;
        else if (uMode < 13.5) vDebugUv = texcoord_4;
        else if (uMode < 14.5) vDebugUv = texcoord_5;
        else if (uMode < 15.5) vDebugUv = texcoord_6;
        else vDebugUv = texcoord_7;
        vec3 transformed = position + referenceTreeWindOffset(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uMode;
      uniform sampler2D uDiffuseMap;
      uniform sampler2D uMaskMap;
      uniform sampler2D uDetailMap;
      varying vec2 vTreeUv;
      varying vec2 vDebugUv;
      varying vec4 vColor0;
      varying vec4 vColor1;
      void main() {
        if (texture2D(uDiffuseMap, vTreeUv).a < 0.33) discard;
        float value = 0.0;
        if (uMode < 4.5) value = uMode < 1.5 ? vColor0.r : uMode < 2.5 ? vColor0.g : uMode < 3.5 ? vColor0.b : vColor0.a;
        else if (uMode < 8.5) value = uMode < 5.5 ? vColor1.r : uMode < 6.5 ? vColor1.g : uMode < 7.5 ? vColor1.b : vColor1.a;
        else if (uMode < 16.5) {
          vec2 grid = step(vec2(0.5), fract(vDebugUv * 8.0));
          float checker = abs(grid.x - grid.y) * 0.22;
          gl_FragColor = vec4(fract(vDebugUv.x), fract(vDebugUv.y), checker, 1.0);
          return;
        } else {
          vec4 sampleValue = uMode < 20.5 ? texture2D(uMaskMap, vTreeUv) : texture2D(uDetailMap, vTreeUv);
          float channel = mod(uMode - 17.0, 4.0);
          value = channel < 0.5 ? sampleValue.r : channel < 1.5 ? sampleValue.g : channel < 2.5 ? sampleValue.b : sampleValue.a;
        }
        gl_FragColor = vec4(vec3(value), 1.0);
      }
    `,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
}

export function setTreeDebugMode(material: THREE.ShaderMaterial, mode: Exclude<TreeDebugMode, "normal">) {
  material.uniforms.uMode.value = DEBUG_MODE_INDEX[mode];
}
