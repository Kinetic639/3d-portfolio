import * as THREE from "three";
import type { LightingState } from "./surface-style";

/**
 * Day and night as one number: 0 is the map's own day lighting, 1 is night.
 * Everything the world shows is a pure function of it (and of which way time
 * runs), so the switch is an animation of that number and nothing else: no
 * light is added or removed, no shader changes, nothing is compiled.
 *
 * The sun and the moon move as they do in the sky: along daily circles about
 * a polar axis tilted for a mid-northern latitude, so as they go down they
 * also move sideways and shadows turn as they lengthen. The sun's circle
 * passes through the map's own sun position, so day looks exactly as set in
 * the editor. Time only runs forward:
 *
 * - "dusk" (day to night): the sun sets in the west, then the moon (full, so
 *   opposite the sun) rises in the east and climbs;
 * - "dawn" (night to day): the moon sets in the west, then the sun rises in
 *   the east and climbs back to its place.
 *
 * The one directional light of the scene is the sun and then the moon; at
 * the horizon its intensity is zero, so the hand-over is invisible. Sky
 * light, background and the terrain's own light pass through a dusk palette.
 */

/** Seconds of a switch between day and night. */
export const DAY_NIGHT_SECONDS = 2;

/** Which way time runs through a switch: towards night, or towards day. */
export type SkyPath = "dusk" | "dawn";

const DUSK = { sky: new THREE.Color("#ffb488"), ground: new THREE.Color("#5a4a52"), skyIntensity: 0.75, background: new THREE.Color("#e9b593"), tint: new THREE.Color(1.0, 0.8, 0.66) };
const NIGHT = { sky: new THREE.Color("#5c6fa8"), ground: new THREE.Color("#1c2333"), skyIntensity: 0.55, background: new THREE.Color("#0f1724"), tint: new THREE.Color(0.3, 0.36, 0.6) };
const SUNSET_COLOUR = new THREE.Color("#ff9a52");
const MOON_COLOUR = new THREE.Color("#a9c0ff");
const MOON_INTENSITY = 0.55;
/** How far below the horizon a body goes before the other takes over, in radians. */
const BELOW = THREE.MathUtils.degToRad(-8);
/** Constant the terrain shader adds to every pixel by day (the original's), and by night. */
const DAY_GLOW = new THREE.Color(0.035, 0.028, 0.018);
const NIGHT_GLOW = new THREE.Color(0.008, 0.012, 0.026);

/** Latitude of the sky: the polar axis points north (world -z), this far above the horizon. */
const LATITUDE = THREE.MathUtils.degToRad(50);
/** Unit vectors of the sky's frame: the pole, the meridian's high point (south and up), and west. */
const POLE = new THREE.Vector3(0, Math.sin(LATITUDE), -Math.cos(LATITUDE));
const MERIDIAN = new THREE.Vector3(0, Math.cos(LATITUDE), Math.sin(LATITUDE));
const WEST = new THREE.Vector3().crossVectors(MERIDIAN, POLE);
/** The moon's circle: on the celestial equator (rises due east, sets due west), and where it is at night. */
const MOON_DECLINATION = 0;
const MOON_NIGHT_HOUR = THREE.MathUtils.degToRad(-20);

export type SkyState = {
  /** Unit vector towards the light (the sun, then the moon). */
  lightDirection: THREE.Vector3;
  lightColor: THREE.Color;
  lightIntensity: number;
  /** 0-1: how strong shadows are, falling to nothing as the light reaches the horizon. */
  shadowFactor: number;
  skyColor: THREE.Color;
  groundColor: THREE.Color;
  skyIntensity: number;
  background: THREE.Color;
  /** Multiplies the terrain's colour; white by day. */
  terrainTint: THREE.Color;
  /** Added to the terrain's colour. */
  terrainGlow: THREE.Color;
  /**
   * Where the sun and the moon are (unit vectors): the light's own directions, the moon opposite the sun.
   * Their discs are drawn far beyond the map, so they show only where the sky is in frame (the lowest,
   * closest views); during a switch they travel to and from the horizon.
   */
  sunDisc: THREE.Vector3;
  moonDisc: THREE.Vector3;
};

export function createSkyState(): SkyState {
  return {
    lightDirection: new THREE.Vector3(0, 1, 0),
    lightColor: new THREE.Color(),
    lightIntensity: 0,
    shadowFactor: 1,
    skyColor: new THREE.Color(),
    groundColor: new THREE.Color(),
    skyIntensity: 0,
    background: new THREE.Color(),
    terrainTint: new THREE.Color(),
    terrainGlow: new THREE.Color(),
    sunDisc: new THREE.Vector3(1, 0, 0),
    moonDisc: new THREE.Vector3(-1, 0, 0),
  };
}

const scratch = new THREE.Color();

/** Direction of a body on its daily circle: declination (radians) and hour angle (radians, negative east of the meridian). */
export function onCircle(out: THREE.Vector3, declination: number, hour: number) {
  const across = Math.cos(declination);
  return out.copy(MERIDIAN).multiplyScalar(across * Math.cos(hour))
    .addScaledVector(WEST, across * Math.sin(hour))
    .addScaledVector(POLE, Math.sin(declination));
}

/** Hour angle (western, positive) at which a body of this declination is at this elevation; clamped where it never gets there. */
function hourAt(declination: number, elevation: number) {
  const cosine = (Math.sin(elevation) - Math.sin(declination) * POLE.y) / Math.max(1e-6, Math.cos(declination) * MERIDIAN.y);
  return Math.acos(THREE.MathUtils.clamp(cosine, -1, 1));
}

/** Three-stop blend: day at 0, dusk at 0.5, night at 1. */
function threeStop(out: THREE.Color, day: THREE.Color, dusk: THREE.Color, night: THREE.Color, t: number) {
  return t < 0.5 ? out.copy(day).lerp(dusk, t * 2) : out.copy(dusk).lerp(night, t * 2 - 1);
}

/**
 * Fills `out` with what the world looks like at `night` (0 day, 1 night),
 * from the map's day lighting and the day background colour. `path` says
 * which way time runs, so the sun sets in the west and rises in the east.
 */
export function sampleSky(night: number, day: LightingState, dayBackground: THREE.Color, out: SkyState, path: SkyPath = "dusk") {
  const t = THREE.MathUtils.clamp(night, 0, 1);
  // The sun's circle through the map's own sun position.
  const sun = new THREE.Vector3(day.sunPosition.x, day.sunPosition.y, day.sunPosition.z).normalize();
  const sunDeclination = Math.asin(THREE.MathUtils.clamp(sun.dot(POLE), -1, 1));
  const sunHour = Math.atan2(sun.dot(WEST), sun.dot(MERIDIAN));
  const sunBelow = hourAt(sunDeclination, BELOW);
  const moonBelow = hourAt(MOON_DECLINATION, BELOW);
  // Hour angles over the switch: setting goes on west down to `below`, rising comes up from `-below` (east).
  // A sun above the horizon is always between the two, so time only runs forward.
  let sunAt: number;
  let moonAt: number;
  if (path === "dusk") {
    sunAt = THREE.MathUtils.lerp(sunHour, sunBelow, Math.min(1, t * 2));
    moonAt = THREE.MathUtils.lerp(-moonBelow, MOON_NIGHT_HOUR, Math.max(0, t * 2 - 1));
  } else {
    const toDay = 1 - t;
    moonAt = THREE.MathUtils.lerp(MOON_NIGHT_HOUR, moonBelow, Math.min(1, toDay * 2));
    sunAt = THREE.MathUtils.lerp(-sunBelow, sunHour, Math.max(0, toDay * 2 - 1));
  }
  onCircle(out.sunDisc, sunDeclination, sunAt);
  onCircle(out.moonDisc, MOON_DECLINATION, moonAt);

  const dayElevation = Math.asin(THREE.MathUtils.clamp(sun.y, -1, 1));
  if (t < 0.5) {
    // The sun's light: warmer and dimmer as it nears the horizon.
    out.lightDirection.copy(out.sunDisc);
    const height = THREE.MathUtils.smoothstep(out.sunDisc.y, 0, Math.sin(Math.min(dayElevation, THREE.MathUtils.degToRad(30))));
    out.lightIntensity = day.sunIntensity * height;
    out.lightColor.set(day.sunColor).lerp(SUNSET_COLOUR, 1 - height);
    out.shadowFactor = height;
  } else {
    // The moon's: cool and dim.
    out.lightDirection.copy(out.moonDisc);
    const nightElevation = onCircle(new THREE.Vector3(), MOON_DECLINATION, MOON_NIGHT_HOUR).y;
    const height = THREE.MathUtils.smoothstep(out.moonDisc.y, 0, nightElevation);
    out.lightIntensity = MOON_INTENSITY * height;
    out.lightColor.copy(MOON_COLOUR);
    out.shadowFactor = height * 0.7;
  }

  threeStop(out.skyColor, scratch.set(day.skyColor), DUSK.sky, NIGHT.sky, t);
  threeStop(out.groundColor, scratch.set(day.groundColor), DUSK.ground, NIGHT.ground, t);
  out.skyIntensity = t < 0.5 ? THREE.MathUtils.lerp(day.skyIntensity, DUSK.skyIntensity, t * 2) : THREE.MathUtils.lerp(DUSK.skyIntensity, NIGHT.skyIntensity, t * 2 - 1);
  threeStop(out.background, dayBackground, DUSK.background, NIGHT.background, t);
  threeStop(out.terrainTint, scratch.set(1, 1, 1), DUSK.tint, NIGHT.tint, t);
  out.terrainGlow.copy(DAY_GLOW).lerp(NIGHT_GLOW, t);
  return out;
}
