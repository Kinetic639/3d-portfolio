import * as THREE from "three";
import type { ModelWindBinding } from "@/lib/engine/entity-meshes";
import { windVertexChunk, type WindUniforms } from "@/lib/engine/wind";

/**
 * The style lab's "tree attribute debug", for the editor: draws a model's
 * vertex data as greys (or a checker for UV sets) so the right wind weight
 * source can be picked by eye. The model keeps moving in the wind while it
 * is shown, as in the lab. Editor only; visitors never compile it.
 *
 * The lab could also show the source game's mask and detail textures; those
 * are not part of the model file and are not shipped.
 */
export type WindDebugView = "normal" | "weight" | "height" | `color-${"r" | "g" | "b" | "a"}` | `color_1-${"r" | "g" | "b" | "a"}` | "uv" | "uv1" | "uv2";

/** Views a model with these glTF attributes can show. */
export function windDebugViews(attributes: readonly string[], windReactive: boolean): WindDebugView[] {
  const views: WindDebugView[] = ["normal"];
  if (windReactive) views.push("weight");
  views.push("height");
  if (attributes.includes("COLOR_0")) views.push("color-r", "color-g", "color-b", "color-a");
  if (attributes.includes("COLOR_1")) views.push("color_1-r", "color_1-g", "color_1-b", "color_1-a");
  if (attributes.includes("TEXCOORD_0")) views.push("uv");
  if (attributes.includes("TEXCOORD_1")) views.push("uv1");
  if (attributes.includes("TEXCOORD_2")) views.push("uv2");
  return views;
}

function valueExpression(view: WindDebugView) {
  if (view === "weight") return "windWeight(position)";
  if (view === "height") return "smoothstep(uTreeMinY, uTreeMaxY, position.y)";
  if (view.startsWith("color_1-")) return `color_1.${view.slice(-1)}`;
  if (view.startsWith("color-")) return `baseColor.${view.slice(-1)}`;
  return "0.0";
}

/**
 * A material that shows `view` for a model. `source` supplies the texture
 * whose alpha cuts out leaves, as the model's own material does.
 */
export function createWindDebugMaterial(
  view: Exclude<WindDebugView, "normal">,
  source: THREE.Material,
  binding: { attributes: readonly string[]; weightSource: string; uniforms: ModelWindBinding["uniforms"] } | null,
  bounds: { min: readonly number[]; max: readonly number[] },
  global: WindUniforms,
) {
  const attributes = binding?.attributes ?? [];
  const sway = binding !== null;
  const uvView = view === "uv" || view === "uv1" || view === "uv2";
  const map = (source as THREE.MeshStandardMaterial).map ?? null;
  const responseUniforms = binding?.uniforms ?? {
    uTreeSwayResponse: { value: 0 }, uBranchResponse: { value: 0 }, uLeafResponse: { value: 0 }, uTreeStiffness: { value: 1 },
    uTreeMinY: { value: bounds.min[1] }, uTreeMaxY: { value: bounds.max[1] },
  };
  const material = new THREE.ShaderMaterial({
    name: `wind-debug:${view}`,
    uniforms: { ...global, ...responseUniforms, uMap: { value: map }, uAlphaTest: { value: source.alphaTest } },
    vertexColors: attributes.includes("COLOR_0"),
    side: source.side,
    defines: { ...(map ? { HAS_MAP: 1 } : {}), ...(uvView ? { UV_VIEW: 1 } : {}) },
    vertexShader: /* glsl */ `
      ${windVertexChunk(binding?.weightSource ?? "height", attributes)}
      ${attributes.includes("COLOR_1") ? "" : "vec4 color_1 = vec4(0.0);"}
      ${view === "uv1" && !binding?.weightSource.startsWith("uv1") ? "#ifndef USE_UV1\nattribute vec2 uv1;\n#endif" : ""}
      ${view === "uv2" && !binding?.weightSource.startsWith("uv2") ? "#ifndef USE_UV2\nattribute vec2 uv2;\n#endif" : ""}
      varying float vValue;
      varying vec2 vUv;
      varying vec2 vDebugUv;
      float windWeight(vec3 localPosition) {
        return clamp(${binding ? (binding.weightSource === "height" ? "smoothstep(uTreeMinY, uTreeMaxY, localPosition.y)" : binding.weightSource.replace(/^color_1-/, "color_1.").replace(/^uv-/, "uv.").replace(/^uv1-/, "uv1.").replace(/^uv2-/, "uv2.")) : "0.0"}, 0.0, 1.0);
      }
      void main() {
        #if defined( USE_COLOR_ALPHA )
          vec4 baseColor = color;
        #elif defined( USE_COLOR )
          vec4 baseColor = vec4(color, 1.0);
        #else
          vec4 baseColor = vec4(1.0);
        #endif
        vValue = ${valueExpression(view)};
        vUv = uv;
        vDebugUv = ${view === "uv1" ? "uv1" : view === "uv2" ? "uv2" : "uv"};
        vec3 transformed = position${sway ? " + windOffset(position)" : ""};
        vec4 local = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          local = instanceMatrix * local;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * local;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uAlphaTest;
      varying float vValue;
      varying vec2 vUv;
      varying vec2 vDebugUv;
      void main() {
        #ifdef HAS_MAP
          if (texture2D(uMap, vUv).a < max(uAlphaTest, 0.01)) discard;
        #endif
        #ifdef UV_VIEW
          vec2 grid = step(vec2(0.5), fract(vDebugUv * 8.0));
          gl_FragColor = vec4(fract(vDebugUv.x), fract(vDebugUv.y), abs(grid.x - grid.y) * 0.22, 1.0);
        #else
          gl_FragColor = vec4(vec3(vValue), 1.0);
        #endif
      }
    `,
  });
  return material;
}
