import * as THREE from "three";
import type { MinigameHud } from "@/lib/bridge/world-bridge";
import type { RuntimeMap } from "@/lib/bake/baked-format";
import type { MinigameSession } from "@/lib/minigames/minigame-types";
import { getMinigame } from "@/lib/minigames/registry";
import { getBlockColor } from "@/lib/terrain/surface-faces";
import { DEFAULT_ROTATION, DEFAULT_SHAPE_ID, DEFAULT_STATE } from "@/lib/voxel-shapes/shape-ids";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { raycastVoxels } from "@/lib/world/voxel-raycast";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import type { GridCoordinate } from "@/lib/world/world-config";
import type { WorldQuery } from "./world-query";

/**
 * Runs mini-games: the engine-side half that every game shares.
 *
 * - Picking: the cell under the pointer, from voxels (the whole voxel world,
 *   or for a baked world the voxels kept for its mini-game zones). In a baked
 *   world something outside the zone may stand in front; the heightfield
 *   decides that.
 * - Feedback: an outline on the cell a click would act on, and a short burst
 *   of cubes in the block's colour when it breaks. Both are created once and
 *   compiled during warm-up.
 * - Changes: cells removed by a game are written to the voxels and the
 *   terrain is remeshed once, right after the click, in proportion to the
 *   change (one chunk, or the zone's own mesh in a baked world).
 *
 * Holes last for the page's session; nothing is saved.
 */
export type MinigameHostOptions = {
  map: RuntimeMap;
  /** Voxels that cover every mini-game zone. */
  world: VoxelWorld;
  query: WorldQuery;
  /** Rebuilds what shows the given cells. */
  remesh: (zoneId: number, cells: GridCoordinate[]) => void;
  /** Runs the same meshing a dig triggers and throws the result away, so the first dig is not the first run of that code. */
  rehearse: () => void;
};

const BURST_CUBES = 10;
const BURST_CAPACITY = BURST_CUBES * 4;
const BURST_SECONDS = 0.6;
const GRAVITY = 18;

type Particle = { age: number; position: THREE.Vector3; velocity: THREE.Vector3; spin: THREE.Vector3; color: THREE.Color };

export class MinigameHost {
  readonly group = new THREE.Group();
  private readonly options: MinigameHostOptions;
  private readonly outline: THREE.LineSegments;
  private readonly burst: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private active: { zoneId: number; zoneKey: string; session: MinigameSession; title: string; hint: string; gameId: string } | null = null;
  private target: GridCoordinate | null = null;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3();

  constructor(options: MinigameHostOptions) {
    this.options = options;
    this.group.name = "minigame";
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.05, 1.05, 1.05)),
      new THREE.LineBasicMaterial({ color: "#ffffff", depthTest: false, transparent: true, opacity: 0.95 }),
    );
    this.outline.renderOrder = 20;
    this.outline.visible = false;
    this.burst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: "#ffffff" }), BURST_CAPACITY);
    this.burst.count = 0;
    this.burst.frustumCulled = false;
    this.burst.setColorAt(0, new THREE.Color("#ffffff"));
    this.group.add(this.outline, this.burst);
  }

  get playing() {
    return this.active !== null;
  }

  /** The zones of this map that run a known game. */
  static playableZones(map: RuntimeMap) {
    return map.zones.filter((zone) => zone.kind === "minigame" && getMinigame(zone.minigame?.gameId));
  }

  /** Starts the game of a zone. Returns its HUD, or null when the zone runs no known game. */
  start(zoneNumericId: number): MinigameHud | null {
    const zone = this.options.map.zones.find((candidate) => candidate.numericId === zoneNumericId);
    const game = getMinigame(zone?.minigame?.gameId);
    if (!zone || !game) return null;
    const { world } = this.options;
    const { width, depth } = world.config;
    const inZone = (x: number, z: number) => x >= 0 && z >= 0 && x < width && z < depth && world.zones[x + width * z] === zoneNumericId;
    const session = game.start({
      zoneId: zoneNumericId,
      inZone,
      terrain: {
        floorY: world.config.minY,
        getBlock: (x, y, z) => world.getBlock(x, y, z),
        removeBlock: (x, y, z) => this.removeBlock(zoneNumericId, inZone, x, y, z),
      },
    });
    this.active = { zoneId: zoneNumericId, zoneKey: zone.id, session, title: game.title, hint: game.hint, gameId: game.id };
    return this.hud();
  }

  stop() {
    this.active = null;
    this.setTarget(null);
  }

  hud(): MinigameHud | null {
    const active = this.active;
    if (!active) return null;
    return { gameId: active.gameId, zoneId: active.zoneKey, title: active.title, counters: active.session.counters(), hint: active.hint };
  }

  /** Updates the outline for the pointer's ray. Returns true when it changed. */
  hover(ray: THREE.Ray) {
    return this.setTarget(this.pick(ray));
  }

  /** A click or tap. Returns the new HUD when the game did something. */
  tap(ray: THREE.Ray): MinigameHud | null {
    const active = this.active;
    const cell = this.pick(ray);
    if (!active || !cell) return null;
    const before = JSON.stringify(active.session.counters());
    active.session.act(cell);
    this.setTarget(this.pick(ray));
    const hud = this.hud();
    return hud && JSON.stringify(hud.counters) !== before ? hud : null;
  }

  /** Advances the burst. Returns true while something is moving. */
  update(delta: number) {
    if (this.particles.length === 0) {
      if (this.burst.count !== 0) this.burst.count = 0;
      return false;
    }
    let alive = 0;
    for (const particle of this.particles) {
      particle.age += delta;
      if (particle.age >= BURST_SECONDS) continue;
      particle.velocity.y -= GRAVITY * delta;
      particle.position.addScaledVector(particle.velocity, delta);
      const life = 1 - particle.age / BURST_SECONDS;
      this.euler.set(particle.spin.x * particle.age, particle.spin.y * particle.age, particle.spin.z * particle.age);
      this.matrix.compose(particle.position, this.quaternion.setFromEuler(this.euler), this.scale.setScalar(0.4 + life * 0.6));
      this.burst.setMatrixAt(alive, this.matrix);
      this.burst.setColorAt(alive, particle.color);
      this.particles[alive] = particle;
      alive += 1;
    }
    this.particles.length = alive;
    this.burst.count = alive;
    this.burst.instanceMatrix.needsUpdate = true;
    if (this.burst.instanceColor) this.burst.instanceColor.needsUpdate = true;
    return alive > 0;
  }

  /** Runs the remeshing a dig needs, without changing anything; part of warm-up. */
  rehearseDig() {
    this.options.rehearse();
  }

  /** Makes the outline and a burst drawable, so warm-up compiles and uploads them. `false` hides them again. */
  showForWarmUp(show: boolean) {
    this.outline.visible = show;
    this.burst.count = show ? 1 : 0;
    if (show) {
      this.burst.setMatrixAt(0, this.matrix.identity());
      this.burst.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const object of [this.outline, this.burst]) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
    this.burst.dispose();
    this.group.clear();
  }

  private setTarget(cell: GridCoordinate | null) {
    const same = cell === this.target || (cell && this.target && cell.x === this.target.x && cell.y === this.target.y && cell.z === this.target.z);
    if (same) return false;
    this.target = cell;
    this.outline.visible = cell !== null;
    if (cell) {
      const centre = this.options.world.gridToWorld(cell.x, cell.y, cell.z);
      this.outline.position.set(centre.x, centre.y, centre.z);
    }
    return true;
  }

  private pick(ray: THREE.Ray): GridCoordinate | null {
    const active = this.active;
    if (!active) return null;
    const hit = raycastVoxels(this.options.world, ray.origin, ray.direction, 400);
    if (!hit) return null;
    // In a baked world the voxels hold only the zones: terrain outside them may be in front.
    const ground = this.options.query.raycast(ray.origin, ray.direction);
    if (ground && ground.distance + 0.5 < hit.distance && this.options.world.getColumnZone(ground.x, ground.z) !== active.zoneId) return null;
    return active.session.target(hit.cell);
  }

  private removeBlock(zoneId: number, inZone: (x: number, z: number) => boolean, x: number, y: number, z: number) {
    const world = this.options.world;
    if (!inZone(x, z) || y <= world.config.minY) return false;
    const blockId = world.getBlock(x, y, z);
    if (blockId === BLOCK_IDS.Air) return false;
    world.setBlock(x, y, z, BLOCK_IDS.Air);
    world.setShape(x, y, z, DEFAULT_SHAPE_ID);
    world.setRotation(x, y, z, DEFAULT_ROTATION);
    world.setState(x, y, z, DEFAULT_STATE);
    this.options.remesh(zoneId, [{ x, y, z }]);
    this.spawnBurst(world.gridToWorld(x, y, z), blockId);
    return true;
  }

  private spawnBurst(centre: { x: number; y: number; z: number }, blockId: number) {
    const [r, g, b] = getBlockColor(blockId);
    for (let index = 0; index < BURST_CUBES; index += 1) {
      if (this.particles.length >= BURST_CAPACITY) this.particles.shift();
      const angle = (index / BURST_CUBES) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 2 + Math.random() * 2.5;
      this.particles.push({
        age: 0,
        position: new THREE.Vector3(centre.x + (Math.random() - 0.5) * 0.5, centre.y, centre.z + (Math.random() - 0.5) * 0.5),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, 4 + Math.random() * 3, Math.sin(angle) * speed),
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        color: new THREE.Color(r, g, b),
      });
    }
  }
}
