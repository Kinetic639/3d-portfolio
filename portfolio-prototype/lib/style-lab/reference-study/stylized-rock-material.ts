import * as THREE from "three";

export type HatchMode = "uv" | "screen";

export type StylizedRockUniforms = {
  hatchStrength: { value: number };
  hatchScale: { value: number };
  hatchMode: { value: number };
};

const OUTLINE_NORMAL_ATTRIBUTE = "outlineNormal";
const POSITION_KEY_SCALE = 100_000;

/**
 * Builds an outline-only geometry whose coincident seam vertices share one
 * area-weighted extrusion normal. The source normals remain untouched so the
 * painted rock keeps its authored hard-edge lighting.
 */
export function createSmoothedOutlineGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const sourcePosition = source.getAttribute("position");
  if (!sourcePosition) {
    throw new Error("Outline geometry requires a position attribute.");
  }

  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    geometry.setAttribute(name, attribute.clone());
  }
  if (source.index) geometry.setIndex(source.index.clone());
  geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
  for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);

  const positionKeys = new Array<string>(sourcePosition.count);
  const accumulatedNormals = new Map<string, THREE.Vector3>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edgeAB = new THREE.Vector3();
  const edgeAC = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const cornerEdgeA = new THREE.Vector3();
  const cornerEdgeB = new THREE.Vector3();
  const weightedNormal = new THREE.Vector3();

  const getPositionKey = (index: number) => {
    const existing = positionKeys[index];
    if (existing) return existing;
    const key = `${Math.round(sourcePosition.getX(index) * POSITION_KEY_SCALE)},${Math.round(sourcePosition.getY(index) * POSITION_KEY_SCALE)},${Math.round(sourcePosition.getZ(index) * POSITION_KEY_SCALE)}`;
    positionKeys[index] = key;
    return key;
  };

  const addCornerNormal = (
    index: number,
    corner: THREE.Vector3,
    neighborA: THREE.Vector3,
    neighborB: THREE.Vector3,
  ) => {
    const key = getPositionKey(index);
    cornerEdgeA.subVectors(neighborA, corner).normalize();
    cornerEdgeB.subVectors(neighborB, corner).normalize();
    const cornerAngle = Math.acos(THREE.MathUtils.clamp(cornerEdgeA.dot(cornerEdgeB), -1, 1));
    weightedNormal.copy(faceNormal).multiplyScalar(cornerAngle);
    const accumulated = accumulatedNormals.get(key);
    if (accumulated) accumulated.add(weightedNormal);
    else accumulatedNormals.set(key, weightedNormal.clone());
  };

  const index = source.index;
  const triangleVertexCount = index?.count ?? sourcePosition.count;
  for (let offset = 0; offset + 2 < triangleVertexCount; offset += 3) {
    const indexA = index ? index.getX(offset) : offset;
    const indexB = index ? index.getX(offset + 1) : offset + 1;
    const indexC = index ? index.getX(offset + 2) : offset + 2;
    a.fromBufferAttribute(sourcePosition, indexA);
    b.fromBufferAttribute(sourcePosition, indexB);
    c.fromBufferAttribute(sourcePosition, indexC);
    edgeAB.subVectors(b, a);
    edgeAC.subVectors(c, a);
    faceNormal.crossVectors(edgeAB, edgeAC).normalize();
    if (faceNormal.lengthSq() === 0) continue;
    addCornerNormal(indexA, a, b, c);
    addCornerNormal(indexB, b, c, a);
    addCornerNormal(indexC, c, a, b);
  }

  const outlineNormals = new Float32Array(sourcePosition.count * 3);
  const fallbackNormal = new THREE.Vector3(0, 1, 0);
  for (let vertexIndex = 0; vertexIndex < sourcePosition.count; vertexIndex += 1) {
    const normal = accumulatedNormals.get(getPositionKey(vertexIndex)) ?? fallbackNormal;
    const normalized = normal.lengthSq() > 0 ? normal.clone().normalize() : fallbackNormal;
    normalized.toArray(outlineNormals, vertexIndex * 3);
  }

  geometry.setAttribute(OUTLINE_NORMAL_ATTRIBUTE, new THREE.BufferAttribute(outlineNormals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createToonGradientMap(bands: number): THREE.DataTexture {
  const bandCount = THREE.MathUtils.clamp(Math.round(bands), 2, 6);
  const data = new Uint8Array(bandCount);

  for (let index = 0; index < bandCount; index += 1) {
    data[index] = Math.round(54 + (201 * index) / (bandCount - 1));
  }

  const texture = new THREE.DataTexture(data, bandCount, 1, THREE.RedFormat);
  texture.name = `reference-toon-gradient-${bandCount}`;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createStylizedRockMaterial(
  diffuseMap: THREE.Texture | null,
  gradientMap: THREE.Texture,
  uniforms: StylizedRockUniforms,
): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    color: 0xffffff,
    map: diffuseMap,
    gradientMap,
  });

  material.name = "Reference rock toon + procedural hatch";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHatchStrength = uniforms.hatchStrength;
    shader.uniforms.uHatchScale = uniforms.hatchScale;
    shader.uniforms.uHatchMode = uniforms.hatchMode;

    shader.vertexShader = `varying vec2 vStyleUv;\n${shader.vertexShader}`.replace(
      "#include <uv_vertex>",
      "#include <uv_vertex>\nvStyleUv = uv;",
    );

    shader.fragmentShader = `
uniform float uHatchStrength;
uniform float uHatchScale;
uniform float uHatchMode;
varying vec2 vStyleUv;

float referenceHatchLine(vec2 point, float direction) {
  float diagonal = direction > 0.0 ? point.x + point.y : point.x - point.y;
  float distanceToLine = abs(fract(diagonal) - 0.5);
  return 1.0 - smoothstep(0.055, 0.12, distanceToLine);
}
${shader.fragmentShader}`.replace(
      "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
      `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;

  float baseLuminance = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.08);
  float litLuminance = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  float relativeLight = clamp(litLuminance / baseLuminance, 0.0, 1.25);
  float shadeAmount = 1.0 - smoothstep(0.28, 0.92, relativeLight);
  vec2 uvPattern = vStyleUv * (9.0 * uHatchScale);
  vec2 screenPattern = gl_FragCoord.xy * (0.075 * uHatchScale);
  vec2 hatchPoint = mix(uvPattern, screenPattern, step(0.5, uHatchMode));
  float firstStroke = referenceHatchLine(hatchPoint, 1.0);
  float crossStroke = referenceHatchLine(hatchPoint * 1.17 + vec2(0.31), -1.0);
  float hatchMask = firstStroke * smoothstep(0.18, 0.52, shadeAmount);
  hatchMask += crossStroke * smoothstep(0.58, 0.9, shadeAmount);
  hatchMask = clamp(hatchMask, 0.0, 1.0) * shadeAmount * uHatchStrength;
  outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.18, 0.21, 0.2), hatchMask);`,
    );
  };

  material.customProgramCacheKey = () => "reference-rock-toon-hatch-v1";
  return material;
}

export function createOutlineMaterial(
  color: THREE.ColorRepresentation,
  options: { alphaMap?: THREE.Texture | null; alphaTest?: number } = {},
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: "Reference rock selective outline",
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uThickness: { value: 0.012 },
      uAlphaMap: { value: options.alphaMap ?? null },
      uAlphaTest: { value: options.alphaTest ?? 0 },
      uUseAlphaMap: { value: options.alphaMap ? 1 : 0 },
    },
    vertexShader: `
      #include <common>
      #include <skinning_pars_vertex>

      uniform float uThickness;
      attribute vec3 ${OUTLINE_NORMAL_ATTRIBUTE};
      varying vec2 vOutlineUv;

      void main() {
        vOutlineUv = uv;
        vec3 objectNormal = ${OUTLINE_NORMAL_ATTRIBUTE};
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>

        vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
        vec3 viewNormal = normalize(normalMatrix * objectNormal);
        viewPosition.xyz += viewNormal * uThickness;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform sampler2D uAlphaMap;
      uniform float uAlphaTest;
      uniform float uUseAlphaMap;
      varying vec2 vOutlineUv;

      void main() {
        if (uUseAlphaMap > 0.5 && texture2D(uAlphaMap, vOutlineUv).a < uAlphaTest) discard;
        gl_FragColor = vec4(uColor, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: true,
    toneMapped: false,
  });
}
