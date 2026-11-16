import type { WorldRuntime, Unsubscribe } from "@portfolio/contracts";
import type { SourceWorld } from "@portfolio/world-authoring/schema";
import type { EditorCommand } from "@portfolio/world-authoring/commands";
export interface EditorSnapshot {
  readonly mode: "closed" | "edit" | "preparing-play" | "play" | "disposed";
  readonly sourceRevision: string | null;
}
export interface PlaySession {
  readonly sourceRevision: string;
  readonly world: WorldRuntime;
  stop(): Promise<void>;
}
/** Facade contract only; editor lifecycle and tools are not implemented yet. */
export interface EditorSession {
  getSnapshot(): EditorSnapshot;
  subscribe(listener: (snapshot: EditorSnapshot) => void): Unsubscribe;
  open(document: SourceWorld): Promise<void>;
  execute(command: EditorCommand): void;
  undo(): void;
  redo(): void;
  setTool(tool: "select" | "transform"): void;
  play(options?: { signal?: AbortSignal }): Promise<PlaySession>;
  stopPlay(): Promise<void>;
  dispose(): Promise<void>;
}
