/** Minimal source envelope; terrain/entity schemas are intentionally deferred. */
export interface SourceWorld {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: string;
}
