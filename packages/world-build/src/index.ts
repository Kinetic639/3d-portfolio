import type { SourceWorld } from "@portfolio/world-authoring/schema";
import type { RuntimeWorldManifest } from "@portfolio/contracts";
/** Build contract only. No compiler or baking implementation exists yet. */
export interface WorldBuildRequest {
  readonly source: SourceWorld;
  readonly target: "preview" | "production";
}
export interface WorldBuildResult {
  readonly manifest: RuntimeWorldManifest;
  readonly sourceRevision: string;
}
