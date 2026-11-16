import type { Document, Primitive } from "@gltf-transform/core";

/**
 * Outline normals, computed when a model is built (the style lab computed
 * them in the browser on every load).
 *
 * An outline is the model drawn again, back faces only, pushed out along a
 * normal. With the model's own normals, faces that meet at a hard edge are
 * pushed apart and the outline cracks there. This normal is the same for
 * every vertex at one position: the average of the faces around it, each
 * weighted by its corner angle. The model's own normals stay as they are,
 * so its lighting keeps its hard edges.
 *
 * Stored as the custom attribute _OUTLINE_NORMAL (three.js: `_outline_normal`).
 */
export const OUTLINE_NORMAL_ATTRIBUTE = "_OUTLINE_NORMAL";
const POSITION_KEY_SCALE = 100_000;

export function addOutlineNormals(document: Document) {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const normals = computeOutlineNormals(primitive);
      if (!normals) continue;
      primitive.setAttribute(OUTLINE_NORMAL_ATTRIBUTE, document.createAccessor().setType("VEC3").setArray(normals).setBuffer(buffer));
    }
  }
}

export function computeOutlineNormals(primitive: Primitive): Float32Array<ArrayBuffer> | null {
  const position = primitive.getAttribute("POSITION");
  if (!position) return null;
  const count = position.getCount();
  const keys: string[] = new Array(count);
  const read = (index: number) => position.getElement(index, [0, 0, 0]);
  for (let index = 0; index < count; index += 1) {
    const [x, y, z] = read(index);
    keys[index] = `${Math.round(x * POSITION_KEY_SCALE)},${Math.round(y * POSITION_KEY_SCALE)},${Math.round(z * POSITION_KEY_SCALE)}`;
  }

  const sums = new Map<string, [number, number, number]>();
  const indices = primitive.getIndices();
  const triangleCount = Math.floor((indices?.getCount() ?? count) / 3);
  const vertexAt = (offset: number) => (indices ? indices.getScalar(offset) : offset);

  const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const length = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
  const normalise = (v: number[]) => {
    const size = length(v);
    return size > 0 ? [v[0] / size, v[1] / size, v[2] / size] : [0, 0, 0];
  };
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const corner = [vertexAt(triangle * 3), vertexAt(triangle * 3 + 1), vertexAt(triangle * 3 + 2)];
    const points = corner.map(read);
    const faceNormal = normalise(cross(sub(points[1], points[0]), sub(points[2], points[0])));
    if (length(faceNormal) === 0) continue;
    for (let at = 0; at < 3; at += 1) {
      const here = points[at];
      const edgeA = normalise(sub(points[(at + 1) % 3], here));
      const edgeB = normalise(sub(points[(at + 2) % 3], here));
      const angle = Math.acos(Math.min(1, Math.max(-1, dot(edgeA, edgeB))));
      const key = keys[corner[at]];
      const sum = sums.get(key) ?? [0, 0, 0];
      sum[0] += faceNormal[0] * angle;
      sum[1] += faceNormal[1] * angle;
      sum[2] += faceNormal[2] * angle;
      sums.set(key, sum);
    }
  }

  const output = new Float32Array(new ArrayBuffer(count * 12));
  for (let index = 0; index < count; index += 1) {
    const normal = normalise(sums.get(keys[index]) ?? [0, 1, 0]);
    const value = length(normal) > 0 ? normal : [0, 1, 0];
    output.set(value, index * 3);
  }
  return output;
}
