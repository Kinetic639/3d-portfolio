export type EditorCommandCategory = "file" | "edit" | "view" | "map" | "tool" | "settings" | "help";
export type EditorIconName =
  | "new"
  | "open"
  | "save"
  | "import"
  | "export"
  | "undo"
  | "redo"
  | "duplicate"
  | "delete"
  | "select"
  | "paint"
  | "object"
  | "zone"
  | "navigation"
  | "search"
  | "layout"
  | "preview"
  | "validate"
  | "help";

export type EditorCommand = {
  id: string;
  label: string;
  description?: string;
  icon?: EditorIconName;
  shortcut?: string;
  category: EditorCommandCategory;
  isEnabled: () => boolean;
  isVisible?: () => boolean;
  execute: () => void;
};

export type EditorCommandContext = {
  hasUndo: boolean;
  hasRedo: boolean;
  hasSelection: boolean;
  hasEntitySelection: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  canPlaceNavigationEdge: boolean;
  actions: {
    newMap: () => void;
    loadMap: () => void;
    saveDraft: () => void;
    duplicateMap: () => void;
    renameMap: () => void;
    importMap: () => void;
    exportMap: () => void;
    revertMap: () => void;
    resetFlat: () => void;
    undo: () => void;
    redo: () => void;
    duplicate: () => void;
    deleteSelection: () => void;
    group: () => void;
    ungroup: () => void;
    deselect: () => void;
    setTool: (tool: string) => void;
    setWorkspace: (workspace: string) => void;
    toggleCleanPreview: () => void;
    resetLayout: () => void;
    openCommandSearch: () => void;
    openShortcuts: () => void;
    validateMap: () => void;
    placeEntity: () => void;
    placeNavigationNode: () => void;
    connectNavigationNodes: () => void;
    createRoute: () => void;
  };
};

export function createEditorCommands(context: EditorCommandContext): EditorCommand[] {
  const always = () => true;
  return [
    command("file.new-map", "New Map", "Create a blank authoring map.", "file", context.actions.newMap, { icon: "new", shortcut: "Ctrl+N" }),
    command("file.load-map", "Open/Load Map", "Load a registered map or local draft.", "file", context.actions.loadMap, { icon: "open" }),
    command("file.save-draft", "Save Draft", "Persist the current map definition to local storage.", "file", context.actions.saveDraft, { icon: "save", shortcut: "Ctrl+S" }),
    command("file.duplicate-map", "Duplicate Map", "Create an independent copy of the current map.", "file", context.actions.duplicateMap, { icon: "duplicate" }),
    command("file.rename-map", "Rename Map", "Rename the current map.", "file", context.actions.renameMap),
    command("file.import-map", "Import Map", "Import a map definition JSON file.", "file", context.actions.importMap, { icon: "import" }),
    command("file.export-map", "Export Map", "Export the current map definition.", "file", context.actions.exportMap, { icon: "export" }),
    command("file.revert", "Revert to Saved", "Restore the last saved draft/export state.", "file", context.actions.revertMap),
    command("file.reset-flat", "Reset Flat Terrain", "Replace terrain with the flat base map.", "file", context.actions.resetFlat),
    command("edit.undo", "Undo", "Undo the previous authoring command.", "edit", context.actions.undo, { icon: "undo", shortcut: "Ctrl+Z", isEnabled: () => context.hasUndo }),
    command("edit.redo", "Redo", "Redo the previous authoring command.", "edit", context.actions.redo, { icon: "redo", shortcut: "Ctrl+Shift+Z", isEnabled: () => context.hasRedo }),
    command("edit.duplicate", "Duplicate", "Duplicate the selected entity.", "edit", context.actions.duplicate, { icon: "duplicate", shortcut: "Ctrl+D", isEnabled: () => context.hasEntitySelection }),
    command("edit.delete", "Delete", "Delete the current selection.", "edit", context.actions.deleteSelection, { icon: "delete", shortcut: "Delete", isEnabled: () => context.hasSelection }),
    command("edit.group", "Group", "Group selected entities.", "edit", context.actions.group, { isEnabled: () => context.canGroup }),
    command("edit.ungroup", "Ungroup", "Ungroup the selected entity group.", "edit", context.actions.ungroup, { isEnabled: () => context.canUngroup }),
    command("edit.deselect", "Deselect", "Clear current selection.", "edit", context.actions.deselect, { shortcut: "Escape", isEnabled: () => context.hasSelection }),
    command("tool.select", "Select", "Select map content.", "tool", () => context.actions.setTool("select"), { icon: "select", shortcut: "Q" }),
    command("tool.paint", "Paint", "Paint terrain blocks.", "tool", () => context.actions.setTool("paint"), { icon: "paint" }),
    command("tool.erase", "Erase", "Erase terrain blocks.", "tool", () => context.actions.setTool("erase"), { icon: "delete" }),
    command("tool.raise", "Raise", "Raise terrain columns.", "tool", () => context.actions.setTool("raise")),
    command("tool.lower", "Lower", "Lower terrain columns.", "tool", () => context.actions.setTool("lower")),
    command("tool.flatten", "Flatten", "Flatten terrain to a target height.", "tool", () => context.actions.setTool("flatten")),
    command("tool.entity-place", "Place Entity", "Place the selected primitive.", "tool", context.actions.placeEntity, { icon: "object" }),
    command("tool.nav-node", "Place Navigation Node", "Place a navigation node.", "tool", context.actions.placeNavigationNode, { icon: "navigation" }),
    command("tool.nav-connect", "Connect Navigation Nodes", "Connect the latest navigation nodes.", "tool", context.actions.connectNavigationNodes, { icon: "navigation", isEnabled: () => context.canPlaceNavigationEdge }),
    command("tool.nav-route", "Create Route", "Create a route from current nodes.", "tool", context.actions.createRoute, { icon: "navigation", isEnabled: () => context.canPlaceNavigationEdge }),
    command("view.workspace-map", "Map Workspace", "Switch to map authoring.", "view", () => context.actions.setWorkspace("map")),
    command("view.workspace-terrain", "Terrain Workspace", "Switch to terrain authoring.", "view", () => context.actions.setWorkspace("terrain")),
    command("view.workspace-objects", "Objects Workspace", "Switch to object authoring.", "view", () => context.actions.setWorkspace("objects")),
    command("view.workspace-zones", "Zones Workspace", "Switch to zone authoring.", "view", () => context.actions.setWorkspace("zones")),
    command("view.workspace-navigation", "Navigation Workspace", "Switch to navigation authoring.", "view", () => context.actions.setWorkspace("navigation")),
    command("view.workspace-review", "Review Workspace", "Switch to review tools.", "view", () => context.actions.setWorkspace("review")),
    command("view.clean-preview", "Clean Preview", "Hide editor docks and helper overlays.", "view", context.actions.toggleCleanPreview, { icon: "preview", shortcut: "Shift+Space" }),
    command("view.reset-layout", "Reset Editor Layout", "Restore default dock sizes and collapsed states.", "view", context.actions.resetLayout, { icon: "layout" }),
    command("map.validate", "Validate Map", "Run map-definition validation.", "map", context.actions.validateMap, { icon: "validate" }),
    command("help.command-search", "Command Search", "Search editor commands.", "help", context.actions.openCommandSearch, { icon: "search", shortcut: "Ctrl+P" }),
    command("help.shortcuts", "Keyboard Shortcuts", "Show keyboard shortcuts.", "help", context.actions.openShortcuts, { icon: "help" }),
  ].filter((item) => item.isVisible?.() ?? always());
}

export function findEditorCommands(commands: EditorCommand[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return commands;
  return commands.filter((command) => (
    command.label.toLowerCase().includes(normalized) ||
    command.category.toLowerCase().includes(normalized) ||
    command.id.toLowerCase().includes(normalized)
  ));
}

function command(
  id: string,
  label: string,
  description: string,
  category: EditorCommandCategory,
  execute: () => void,
  options: Partial<Pick<EditorCommand, "icon" | "shortcut" | "isEnabled" | "isVisible">> = {},
): EditorCommand {
  return {
    id,
    label,
    description,
    category,
    execute,
    icon: options.icon,
    shortcut: options.shortcut,
    isEnabled: options.isEnabled ?? (() => true),
    isVisible: options.isVisible,
  };
}
