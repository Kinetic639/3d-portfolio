import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { EnvironmentController } from "@/lib/environment/environment-controller";
import {
  addTreeWindToMaterial,
  DEFAULT_TREE_WIND_RESPONSE,
  getAvailableTreeWindSources,
  getTreeDebugModes,
  TreeWindResponseController,
} from "./tree-wind";

describe("tree wind foundation", () => {
  it("uses the preserved secondary color red channel by default", () => {
    expect(DEFAULT_TREE_WIND_RESPONSE.weightSource).toBe("color_1-r");
  });

  it("only offers weight channels supported by the geometry", () => {
    expect(getAvailableTreeWindSources(["position", "uv", "color_1"])).toEqual([
      "color_1-r", "color_1-g", "color_1-b", "color_1-a", "uv-x", "uv-y", "height",
    ]);
  });

  it("offers every preserved UV set to the visual inspector", () => {
    const modes = getTreeDebugModes(["position", "uv", "uv1", "uv2", "uv3", "texcoord_4", "texcoord_5", "texcoord_6", "texcoord_7"]);
    expect(modes).toEqual(expect.arrayContaining(["uv", "uv1", "uv2", "uv3", "texcoord_4", "texcoord_5", "texcoord_6", "texcoord_7"]));
  });

  it("keeps asset response independent from global weather", () => {
    const controller = new TreeWindResponseController({
      ...DEFAULT_TREE_WIND_RESPONSE,
      treeSwayResponse: 0.35,
      stiffness: 1.8,
    });

    expect(controller.uniforms.uTreeSwayResponse.value).toBe(0.35);
    expect(controller.uniforms.uTreeStiffness.value).toBe(1.8);
    expect(controller.uniforms).not.toHaveProperty("uWindStrength");
  });

  it("binds shared global uniform references without copying them per material", () => {
    const environment = new EnvironmentController();
    const response = new TreeWindResponseController();
    const first = addTreeWindToMaterial(
      new THREE.MeshBasicMaterial(),
      environment.windUniforms,
      response.uniforms,
      "first",
    );
    const second = addTreeWindToMaterial(
      new THREE.MeshBasicMaterial(),
      environment.windUniforms,
      response.uniforms,
      "second",
    );
    const firstShader = {
      uniforms: {},
      vertexShader: "#include <begin_vertex>",
      fragmentShader: "",
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    const secondShader = {
      uniforms: {},
      vertexShader: "#include <begin_vertex>",
      fragmentShader: "",
    } as unknown as THREE.WebGLProgramParametersWithUniforms;

    first.onBeforeCompile(firstShader, null as never);
    second.onBeforeCompile(secondShader, null as never);

    expect(firstShader.uniforms.uWindTime).toBe(environment.windUniforms.uWindTime);
    expect(secondShader.uniforms.uWindTime).toBe(environment.windUniforms.uWindTime);
    expect(firstShader.uniforms.uWindGust).toBe(secondShader.uniforms.uWindGust);
  });
});
