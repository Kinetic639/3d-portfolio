import type { SourceWorld } from "./schema.js";
export function isSourceWorld(value: unknown): value is SourceWorld {
  if (typeof value !== "object" || value === null) return false;
  const source = value as Record<string, unknown>;
  return (
    source.schemaVersion === 1 &&
    typeof source.id === "string" &&
    source.id.trim().length > 0 &&
    typeof source.revision === "string" &&
    source.revision.trim().length > 0
  );
}
