import type { WorldLayoutDefinition } from "./world-layout-types";
import { validateWorldLayoutDefinition } from "./world-region";

export const WORLD_LAYOUT_DRAFT_STORAGE_PREFIX = "portfolio-world-layout-draft.v1:";

export function saveWorldLayoutDraft(storage: Storage, layout: WorldLayoutDefinition): WorldLayoutDefinition {
  const validation = validateWorldLayoutDefinition(layout);
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  storage.setItem(getWorldLayoutDraftStorageKey(validation.layout.id), JSON.stringify(validation.layout));
  return validation.layout;
}

export function loadWorldLayoutDraft(storage: Storage, layoutId: string): WorldLayoutDefinition | null {
  const raw = storage.getItem(getWorldLayoutDraftStorageKey(layoutId));
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`World layout draft ${layoutId} is not valid JSON.`);
  }

  const validation = validateWorldLayoutDefinition(parsed);
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  return validation.layout;
}

export function deleteWorldLayoutDraft(storage: Storage, layoutId: string) {
  storage.removeItem(getWorldLayoutDraftStorageKey(layoutId));
}

export function getWorldLayoutDraftStorageKey(layoutId: string) {
  return `${WORLD_LAYOUT_DRAFT_STORAGE_PREFIX}${layoutId}`;
}

