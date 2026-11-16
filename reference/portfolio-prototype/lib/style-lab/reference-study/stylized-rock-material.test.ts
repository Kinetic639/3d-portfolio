import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createSmoothedOutlineGeometry } from "./stylized-rock-material";

describe("createSmoothedOutlineGeometry", () => {
  it("gives coincident hard-edge vertices one continuous extrusion normal", () => {
    const source = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const sourcePosition = source.getAttribute("position");
    const sourceNormal = source.getAttribute("normal");
    const outline = createSmoothedOutlineGeometry(source);
    const outlineNormal = outline.getAttribute("outlineNormal");
    const cornerIndices: number[] = [];

    for (let index = 0; index < sourcePosition.count; index += 1) {
      if (
        sourcePosition.getX(index) === 0.5
        && sourcePosition.getY(index) === 0.5
        && sourcePosition.getZ(index) === 0.5
      ) {
        cornerIndices.push(index);
      }
    }

    expect(cornerIndices.length).toBeGreaterThanOrEqual(3);
    const authoredNormals = new Set(cornerIndices.map((index) => (
      `${sourceNormal.getX(index)},${sourceNormal.getY(index)},${sourceNormal.getZ(index)}`
    )));
    expect(authoredNormals.size).toBe(3);

    const expected = new THREE.Vector3(1, 1, 1).normalize();
    for (const index of cornerIndices) {
      const normal = new THREE.Vector3().fromBufferAttribute(outlineNormal, index);
      expect(normal.dot(expected)).toBeGreaterThan(0.999);
    }
  });

  it("preserves skinning attributes required by animated outline meshes", () => {
    const source = new THREE.BoxGeometry();
    const count = source.getAttribute("position").count;
    source.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    source.setAttribute("skinWeight", new THREE.Float32BufferAttribute(new Float32Array(count * 4), 4));

    const outline = createSmoothedOutlineGeometry(source);

    expect(outline.getAttribute("skinIndex").count).toBe(count);
    expect(outline.getAttribute("skinWeight").count).toBe(count);
  });

  it("keeps seam vertices connected after extrusion", () => {
    const source = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const sourcePosition = source.getAttribute("position");
    const outline = createSmoothedOutlineGeometry(source);
    const outlineNormal = outline.getAttribute("outlineNormal");
    const extrudedPositions: THREE.Vector3[] = [];

    for (let index = 0; index < sourcePosition.count; index += 1) {
      if (
        sourcePosition.getX(index) === 0.5
        && sourcePosition.getY(index) === 0.5
        && sourcePosition.getZ(index) === 0.5
      ) {
        const extruded = new THREE.Vector3().fromBufferAttribute(sourcePosition, index);
        extruded.addScaledVector(new THREE.Vector3().fromBufferAttribute(outlineNormal, index), 0.2);
        extrudedPositions.push(extruded);
      }
    }

    expect(extrudedPositions.length).toBeGreaterThanOrEqual(3);
    for (const extruded of extrudedPositions.slice(1)) {
      expect(extrudedPositions[0].distanceTo(extruded)).toBeLessThan(1e-7);
    }
  });
});
