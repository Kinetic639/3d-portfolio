/**
 * Everything that draws with WebGL, behind one dynamic import: the world's
 * engine and the living portrait's scene. Turbopack gives each dynamic
 * import its own copy of what it needs, so separate imports of the two would
 * download and parse three.js twice (about 670 KB each); through this module
 * they share one chunk, loaded once by whichever asks first.
 */
export { WorldEngine } from "./world-engine";
export { PortraitScene } from "@/lib/portrait/portrait-scene";
