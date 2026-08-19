import { describe, expect, it } from "vitest";
import {
  EDITOR_LAYOUT_STORAGE_KEY,
  clampEditorLayout,
  createDefaultEditorLayout,
  loadEditorLayout,
  parseEditorLayout,
  resetEditorLayout,
  resizeEditorPanel,
  saveEditorLayout,
} from "./editor-layout-store";

describe("editor layout store", () => {
  it("creates compact defaults and clamps resize bounds", () => {
    const layout = createDefaultEditorLayout();
    expect(layout.activeWorkspace).toBe("terrain");
    expect(layout.collapsed.left).toBe(false);

    const resized = resizeEditorPanel(layout, "leftWidth", 9999, { width: 1366, height: 768 });
    expect(resized.dimensions.leftWidth).toBeLessThanOrEqual(Math.floor(1366 * 0.34));

    const tiny = clampEditorLayout({ ...layout, dimensions: { ...layout.dimensions, bottomHeight: -10 } }, { width: 1366, height: 768 });
    expect(tiny.dimensions.bottomHeight).toBe(120);
  });

  it("persists, migrates and resets without map data", () => {
    const backing = new Map<string, string>();
    const storage = {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => void backing.set(key, value),
    };

    const layout = createDefaultEditorLayout();
    layout.activeWorkspace = "objects";
    layout.collapsed.bottom = true;
    saveEditorLayout(storage, layout);

    expect(backing.has(EDITOR_LAYOUT_STORAGE_KEY)).toBe(true);
    expect(loadEditorLayout(storage).activeWorkspace).toBe("objects");
    expect(parseEditorLayout({ version: 99 }).activeWorkspace).toBe("terrain");
    expect(parseEditorLayout({ version: 1, activeBottomTab: "library" }).activeBottomTab).toBe("overview");
    expect(resetEditorLayout().collapsed.bottom).toBe(false);
  });
});
