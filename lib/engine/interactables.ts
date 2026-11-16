import * as THREE from "three";
import type { RuntimeMap } from "@/lib/bake/baked-format";
import { isInsidePlayableBounds, type MapContentReference } from "@/lib/maps/map-definition";
import { getMinigame } from "@/lib/minigames/registry";
import type { EntityLayer } from "./entity-meshes";
import type { WorldQuery } from "./world-query";

/**
 * Everything a visitor can click: objects, markers and zones that reference
 * portfolio content, and zones that run a mini-game. Built once per map.
 *
 * Each interactable shows a small icon floating above it. Icons ignore depth,
 * so they stay visible and clickable even when something stands in front of
 * the object; objects that hide the hovered or focused interactable are
 * faded (see `updateOccluders`).
 */
export type Interactable = {
  id: string;
  kind: "entity" | "marker" | "zone";
  label: string;
  /** What it opens; null for a mini-game zone. */
  content: MapContentReference | null;
  /** The game a mini-game zone runs; null otherwise. */
  minigame: { gameId: string } | null;
  /** Where the icon floats. */
  anchor: THREE.Vector3;
  /** Point on the ground the camera centres on when focusing. */
  focus: THREE.Vector3;
  /** Solid pick volume; zones have none and are picked through the terrain. */
  box: THREE.Box3 | null;
  entityId: string | null;
  zoneNumericId: number | null;
};

export type InteractionLayerOptions = {
  map: RuntimeMap;
  /** Terrain questions, answered by the voxel world or by a baked world's grids. */
  query: WorldQuery;
  entities: EntityLayer;
  /** Display title for a content reference, or null when the content does not exist. */
  describeContent: (reference: MapContentReference) => string | null;
};

const ICON_RADIUS = 0.85;
const ICON_COLOR = "#f2a93b";
const ICON_HOVER_COLOR = "#ffffff";

function createIconTexture(glyph: "info" | "play") {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  // White disc with a dark rim; tinted per sprite through the material colour.
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.lineWidth = size * 0.08;
  context.strokeStyle = "#1b2420";
  context.stroke();
  context.fillStyle = "#1b2420";
  if (glyph === "play") {
    // A triangle, drawn rather than typed, so it does not depend on a font having the glyph.
    context.beginPath();
    context.moveTo(size * 0.4, size * 0.3);
    context.lineTo(size * 0.72, size * 0.5);
    context.lineTo(size * 0.4, size * 0.7);
    context.closePath();
    context.fill();
  } else {
    context.font = `700 ${size * 0.56}px Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("i", size / 2, size / 2 + size * 0.03);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class InteractionLayer {
  readonly group = new THREE.Group();
  readonly items: Interactable[] = [];
  private readonly query: WorldQuery;
  private readonly map: RuntimeMap;
  private readonly entities: EntityLayer;
  private readonly sprites = new Map<string, THREE.Sprite>();
  private readonly zoneItems = new Map<number, Interactable>();
  private readonly texture = createIconTexture("info");
  private readonly playTexture = createIconTexture("play");
  private readonly ray = new THREE.Ray();
  private readonly scratch = new THREE.Vector3();
  private readonly sphere = new THREE.Sphere(new THREE.Vector3(), ICON_RADIUS);
  private hoveredId: string | null = null;
  private focusedId: string | null = null;

  constructor(options: InteractionLayerOptions) {
    this.query = options.query;
    this.map = options.map;
    this.entities = options.entities;
    this.group.name = "interactables";
    this.collect(options);
    for (const item of this.items) this.addIcon(item);
  }

  get(id: string | null) {
    return id ? this.items.find((item) => item.id === id) ?? null : null;
  }

  findByContent(reference: MapContentReference) {
    return this.items.find((item) => item.content?.contentType === reference.contentType && item.content.contentId === reference.contentId) ?? null;
  }

  get hovered() {
    return this.get(this.hoveredId);
  }

  get focused() {
    return this.get(this.focusedId);
  }

  /** Returns true when the hovered interactable changed. */
  setHovered(id: string | null) {
    if (id === this.hoveredId) return false;
    this.hoveredId = id;
    this.refreshIcons();
    return true;
  }

  setFocused(id: string | null) {
    if (id === this.focusedId) return false;
    this.focusedId = id;
    this.refreshIcons();
    return true;
  }

  /** What is under a pointer, given a ray from the camera. */
  pick(camera: THREE.Camera, ndcX: number, ndcY: number): Interactable | null {
    this.ray.origin.setFromMatrixPosition(camera.matrixWorld);
    this.ray.direction.set(ndcX, ndcY, 0.5).unproject(camera).sub(this.ray.origin).normalize();

    // Icons first: they are drawn over everything, so they win regardless of depth.
    let best: Interactable | null = null;
    let bestDistance = Infinity;
    for (const item of this.items) {
      this.sphere.center.copy(item.anchor);
      const hit = this.ray.intersectSphere(this.sphere, this.scratch);
      if (!hit) continue;
      const distance = hit.distanceTo(this.ray.origin);
      if (distance < bestDistance) {
        best = item;
        bestDistance = distance;
      }
    }
    if (best) return best;

    const terrain = this.query.raycast(this.ray.origin, this.ray.direction);
    const terrainDistance = terrain?.distance ?? Infinity;
    for (const item of this.items) {
      if (!item.box) continue;
      const hit = this.ray.intersectBox(item.box, this.scratch);
      if (!hit) continue;
      const distance = hit.distanceTo(this.ray.origin);
      // A hill in front of the object blocks it; the half-cell slack tolerates objects sunk into the ground.
      if (distance < bestDistance && distance < terrainDistance + 0.5) {
        best = item;
        bestDistance = distance;
      }
    }
    if (best) return best;

    if (terrain && isInsidePlayableBounds(this.map, terrain.x, terrain.z)) {
      return this.zoneItems.get(this.query.columnZone(terrain.x, terrain.z)) ?? null;
    }
    return null;
  }

  /**
   * Fades objects standing between the camera and the hovered or focused
   * interactable. Returns true when the set of faded objects changed.
   */
  updateOccluders(camera: THREE.Camera) {
    const faded = new Set<string>();
    const targets = [this.focused, this.hovered].filter((item): item is Interactable => item !== null);
    for (const target of targets) {
      const point = target.box ? target.box.getCenter(this.scratch) : this.scratch.copy(target.focus);
      this.ray.origin.setFromMatrixPosition(camera.matrixWorld);
      const reach = point.distanceTo(this.ray.origin);
      this.ray.direction.copy(point).sub(this.ray.origin).normalize();
      for (const [entityId, box] of this.entities.bounds) {
        if (entityId === target.entityId) continue;
        const hit = this.ray.intersectBox(box, this.scratch);
        if (hit && hit.distanceTo(this.ray.origin) < reach) faded.add(entityId);
      }
    }
    return this.entities.setFaded(faded);
  }

  dispose() {
    this.sprites.forEach((sprite) => sprite.material.dispose());
    this.sprites.clear();
    this.texture.dispose();
    this.playTexture.dispose();
    this.group.clear();
  }

  private collect({ map, query, entities, describeContent }: InteractionLayerOptions) {
    for (const entity of map.entities) {
      const box = entities.bounds.get(entity.id);
      if (!entity.contentReference || !box) continue;
      const label = describeContent(entity.contentReference);
      if (!label) continue;
      const center = box.getCenter(new THREE.Vector3());
      this.items.push({
        id: `entity:${entity.id}`,
        kind: "entity",
        label,
        content: { ...entity.contentReference },
        minigame: null,
        anchor: new THREE.Vector3(center.x, box.max.y + 1.4, center.z),
        focus: new THREE.Vector3(center.x, 0, center.z),
        box,
        entityId: entity.id,
        zoneNumericId: null,
      });
    }

    for (const marker of map.markers) {
      if (!marker.contentReference || !marker.runtimeVisible) continue;
      const label = describeContent(marker.contentReference);
      if (!label) continue;
      const base = query.cellToWorld(marker.gridPosition.x, marker.gridPosition.y, marker.gridPosition.z);
      const radius = Math.max(0.5, marker.interactionRadius);
      const center = new THREE.Vector3(base.x + (marker.offset?.x ?? 0), base.y + (marker.offset?.y ?? 0), base.z + (marker.offset?.z ?? 0));
      this.items.push({
        id: `marker:${marker.id}`,
        kind: "marker",
        label,
        content: { ...marker.contentReference },
        minigame: null,
        anchor: new THREE.Vector3(center.x, center.y + radius + 1.2, center.z),
        focus: new THREE.Vector3(center.x, 0, center.z),
        box: new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(radius * 2, radius * 2, radius * 2)),
        entityId: null,
        zoneNumericId: null,
      });
    }

    // Reachable columns of each zone, read from the terrain rather than from the map file.
    const zoneColumns = new Map<number, Array<{ x: number; z: number }>>();
    for (let z = map.playableBounds.minZ; z <= map.playableBounds.maxZ; z += 1) {
      for (let x = map.playableBounds.minX; x <= map.playableBounds.maxX; x += 1) {
        const zoneId = query.columnZone(x, z);
        if (zoneId === 0) continue;
        const list = zoneColumns.get(zoneId);
        if (list) list.push({ x, z });
        else zoneColumns.set(zoneId, [{ x, z }]);
      }
    }

    for (const zone of map.zones) {
      const game = zone.kind === "minigame" ? getMinigame(zone.minigame?.gameId) : null;
      const label = game ? game.title : zone.contentReference ? describeContent(zone.contentReference) : null;
      if (!label) continue;
      const columns = zoneColumns.get(zone.numericId);
      if (!columns) continue;
      const meanX = columns.reduce((sum, column) => sum + column.x, 0) / columns.length;
      const meanZ = columns.reduce((sum, column) => sum + column.z, 0) / columns.length;
      // The centroid of an L-shaped zone can fall outside it; use the member column nearest to it.
      const nearest = columns.reduce((best, column) =>
        (column.x - meanX) ** 2 + (column.z - meanZ) ** 2 < (best.x - meanX) ** 2 + (best.z - meanZ) ** 2 ? column : best);
      // The cell whose top face is the ground: its centre is half a cell below the surface.
      const position = query.cellToWorld(nearest.x, query.surfaceHeight(nearest.x, nearest.z) - 1, nearest.z);
      const item: Interactable = {
        id: `zone:${zone.id}`,
        kind: "zone",
        label,
        content: game || !zone.contentReference ? null : { ...zone.contentReference },
        minigame: game ? { gameId: game.id } : null,
        anchor: new THREE.Vector3(position.x, position.y + 3, position.z),
        focus: new THREE.Vector3(position.x, 0, position.z),
        box: null,
        entityId: null,
        zoneNumericId: zone.numericId,
      };
      this.items.push(item);
      this.zoneItems.set(zone.numericId, item);
    }
  }

  private addIcon(item: Interactable) {
    const material = new THREE.SpriteMaterial({ map: item.minigame ? this.playTexture : this.texture, color: ICON_COLOR, depthTest: false, depthWrite: false, fog: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(item.anchor);
    sprite.scale.setScalar(ICON_RADIUS * 2);
    sprite.renderOrder = 10;
    this.sprites.set(item.id, sprite);
    this.group.add(sprite);
  }

  private refreshIcons() {
    for (const [id, sprite] of this.sprites) {
      const active = id === this.hoveredId || id === this.focusedId;
      sprite.material.color.set(active ? ICON_HOVER_COLOR : ICON_COLOR);
      sprite.scale.setScalar(ICON_RADIUS * 2 * (active ? 1.35 : 1));
    }
  }
}
