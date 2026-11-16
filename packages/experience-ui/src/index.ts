import type { WorldRuntime } from "@portfolio/runtime";
/** Integration contract only; no runtime is eagerly created or imported as a value. */
export interface ExperienceHost {
  readonly world: WorldRuntime;
  openDocument(contentId: string): Promise<void>;
  dispose(): Promise<void>;
}
