import { describe, expect, it, vi } from "vitest";
import { createEditorCommands, findEditorCommands, type EditorCommandContext } from "./editor-commands";

describe("editor command registry", () => {
  it("centralizes command enablement and execution", () => {
    const saveDraft = vi.fn();
    const duplicate = vi.fn();
    const context = createContext({ saveDraft, duplicate }, { hasEntitySelection: false });
    const commands = createEditorCommands(context);

    const save = commands.find((command) => command.id === "file.save-draft");
    const duplicateCommand = commands.find((command) => command.id === "edit.duplicate");
    save?.execute();
    duplicateCommand?.execute();

    expect(saveDraft).toHaveBeenCalledOnce();
    expect(duplicate).toHaveBeenCalledOnce();
    expect(duplicateCommand?.isEnabled()).toBe(false);
  });

  it("searches labels, categories and IDs", () => {
    const commands = createEditorCommands(createContext());
    expect(findEditorCommands(commands, "save").map((command) => command.id)).toContain("file.save-draft");
    expect(findEditorCommands(commands, "navigation").map((command) => command.id)).toContain("view.workspace-navigation");
    expect(findEditorCommands(commands, "map.validate").map((command) => command.id)).toEqual(["map.validate"]);
  });
});

function createContext(
  actions: Partial<EditorCommandContext["actions"]> = {},
  state: Partial<Omit<EditorCommandContext, "actions">> = {},
): EditorCommandContext {
  const noop = vi.fn();
  return {
    hasUndo: true,
    hasRedo: true,
    hasSelection: true,
    hasEntitySelection: true,
    canGroup: true,
    canUngroup: true,
    canPlaceNavigationEdge: true,
    ...state,
    actions: {
      newMap: noop,
      loadMap: noop,
      saveDraft: noop,
      duplicateMap: noop,
      renameMap: noop,
      importMap: noop,
      exportMap: noop,
      revertMap: noop,
      resetFlat: noop,
      undo: noop,
      redo: noop,
      duplicate: noop,
      deleteSelection: noop,
      group: noop,
      ungroup: noop,
      deselect: noop,
      setTool: noop,
      setWorkspace: noop,
      toggleCleanPreview: noop,
      resetLayout: noop,
      openCommandSearch: noop,
      openShortcuts: noop,
      validateMap: noop,
      placeEntity: noop,
      placeNavigationNode: noop,
      connectNavigationNodes: noop,
      createRoute: noop,
      ...actions,
    },
  };
}
