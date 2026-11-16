export type Unsubscribe = () => void;
export type WorldPhase =
  | "created"
  | "preparing"
  | "ready"
  | "running"
  | "paused"
  | "failed"
  | "disposed";
export interface RuntimeWorldManifest {
  readonly formatVersion: 1;
  readonly mapId: string;
  readonly revision: string;
}
export interface WorldSnapshot {
  readonly phase: WorldPhase;
  readonly mapId: string | null;
  readonly interaction: {
    readonly entityId: string;
    readonly label: string;
  } | null;
}
export type WorldCommand =
  | { readonly type: "activate-interaction"; readonly entityId: string }
  | { readonly type: "equip-item"; readonly itemId: string }
  | { readonly type: "travel"; readonly exitId: string }
  | {
      readonly type: "set-input-mode";
      readonly mode: "world" | "document" | "menu";
    }
  | {
      readonly type: "set-quality";
      readonly preset: "low" | "medium" | "high";
    };
export type WorldEvent =
  | { readonly type: "document-requested"; readonly contentId: string }
  | { readonly type: "travel-completed"; readonly mapId: string }
  | {
      readonly type: "failed";
      readonly message: string;
      readonly recoverable: boolean;
    };
export type CommandResult =
  | { readonly status: "completed" }
  | { readonly status: "rejected" | "failed"; readonly reason: string };
export interface WorldRuntime {
  getSnapshot(): WorldSnapshot;
  subscribe(listener: (snapshot: WorldSnapshot) => void): Unsubscribe;
  onEvent(listener: (event: WorldEvent) => void): Unsubscribe;
  prepare(
    manifest: RuntimeWorldManifest,
    options?: { signal?: AbortSignal },
  ): Promise<WorldSnapshot>;
  start(): void;
  pause(): void;
  resume(): void;
  execute(
    command: WorldCommand,
    options?: { signal?: AbortSignal },
  ): Promise<CommandResult>;
  dispose(): Promise<void>;
}
export interface DiagnosticSample {
  readonly runId: string;
  readonly stage: string;
  readonly durationMs: number;
}
