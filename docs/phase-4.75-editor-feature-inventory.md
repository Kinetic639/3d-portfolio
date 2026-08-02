# Phase 4.75 Editor Feature Inventory

This checklist records where each legacy scrolling-panel control moved during the professional editor-shell refactor.

| Legacy control | Previous component | State source | Command/callback | Conditions | Shortcut | New destination | Contextual | Data type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Collapse editor | `MapEditorToolbar` | local React state | local collapse toggle | editor open | none | menu bar window control / restore dock | no | editor preference |
| Close editor | `MapEditorToolbar` | parent editor request | `onClose` | editor open | `Escape` when nothing selected | menu bar window control | no | editor preference |
| Tool selection | `MapEditorToolbar` | `tool` | `onToolChange` | editor open | `Q/W/E/R` reserved, tool buttons | vertical tool shelf | yes | editor preference |
| Current map name/id | `MapEditorToolbar` | `currentMap` | read-only | editor open | none | main toolbar and inspector | no | map data |
| Load map | `MapEditorToolbar` | registry entries | `onMapChange` | editor open | menu access | File menu / Map Library bottom tab | yes | map data |
| New map | `MapEditorToolbar` | callbacks | `onNewMap` | editor open | none | File menu / Map Library | no | map data |
| Duplicate map | `MapEditorToolbar` | callbacks | `onDuplicateMap` | editor open | none | File menu / Map Library | no | map data |
| Save draft | `MapEditorToolbar` | callbacks | `onSaveDraft` | editor open | `Ctrl/Cmd+S` planned | main toolbar / File menu / Map Library | no | map data |
| Rename map | `MapEditorToolbar` | callbacks | `onRenameMap` | editor open | none | File menu / Inspector map summary | no | map data |
| Clear draft | `MapEditorToolbar` | callbacks | `onClearDraft` | editor open | none | Map Library | no | local draft data |
| Import map | `MapEditorToolbar` | file input | `onImport` | editor open | none | File menu / Map Library | no | map data |
| Export map | `MapEditorToolbar` | callbacks | `onExport` | editor open | none | File menu / Map Library | no | map data |
| Reset unsaved | `MapEditorToolbar` | session saved doc | `onResetUnsaved` | editor open | none | File menu / Map Library | no | map data |
| Reset flat | `MapEditorToolbar` | editor session | `onResetFlat` | editor open | none | Map Library / Terrain palette | no | terrain data |
| Preset selector | `MapEditorToolbar` | `presetId` | `onPresetChange` | editor open | none | Map Library | yes | terrain data |
| Block selector | `MapEditorToolbar` | `paintBlockId` | `onPaintBlockChange` | editor open | none | Terrain palette | yes | editor preference |
| Renderer selector | `MapEditorToolbar` | `renderMode` | `onRenderModeChange` | editor open | none | Review workspace / Performance tab | yes | editor preference |
| Zone selector | `MapEditorToolbar` | `zoneId` | `onZoneChange` | editor open | none | Terrain palette / Zones workspace | yes | editor preference |
| Brush shape | `MapEditorToolbar` | `brushSettings` | `onBrushShapeChange` | editor open | none | Terrain palette | yes | editor preference |
| Brush size | `MapEditorToolbar` | `brushSettings` | `onBrushSizeChange` | editor open | none | Terrain palette | yes | editor preference |
| Path width | `MapEditorToolbar` | `brushSettings` | `onPathWidthChange` | editor open | none | Terrain palette | yes | editor preference |
| Flatten height | `MapEditorToolbar` | `brushSettings` | `onFlattenHeightChange` | editor open | none | Terrain palette | yes | editor preference |
| Primitive type | `MapEditorToolbar` | `primitiveType` | `onPrimitiveTypeChange` | editor open | none | Objects palette | yes | editor preference |
| Collision mode | `MapEditorToolbar` | `collisionMode` | `onCollisionModeChange` | editor open | none | Objects palette / Inspector | yes | map data when applied |
| Entity name | `MapEditorToolbar` | `entityName` | `onEntityNameChange` | editor open | none | Objects palette / Inspector | yes | editor preference |
| Entity colour | `MapEditorToolbar` | `entityColor` | `onEntityColorChange` | editor open | none | Objects palette / Inspector | yes | editor preference |
| Place entity | `MapEditorToolbar` | selected cell + entity draft | `onPlaceEntity` | entity layer unlocked | none | Objects palette / tool shelf | yes | map data |
| Duplicate entity | `MapEditorToolbar` | selected entity IDs | `onDuplicateEntity` | entity selected | `Ctrl/Cmd+D` | toolbar / outliner context | yes | map data |
| Delete entity | `MapEditorToolbar` | selected entity IDs | `onDeleteEntity` | entity selected | `Delete` | toolbar / outliner context | yes | map data |
| Group entity | `MapEditorToolbar` | selected entity IDs | `onGroupEntity` | multi-select | none | Objects toolbar / outliner context | yes | map data |
| Ungroup entity | `MapEditorToolbar` | selected entity | `onUngroupEntity` | grouped entity selected | none | Objects toolbar / outliner context | yes | map data |
| Lock entity | `MapEditorToolbar` | selected entity | `onToggleEntityLocked` | entity selected | none | Inspector / outliner context | yes | map data |
| Hide entity | `MapEditorToolbar` | selected entity | `onToggleEntityHidden` | entity selected | none | Inspector / outliner context | yes | map data |
| Navigation node type | `MapEditorToolbar` | `navigationNodeType` | `onNavigationNodeTypeChange` | editor open | none | Navigation palette | yes | editor preference |
| Place navigation node | `MapEditorToolbar` | selected cell | `onPlaceNavigationNode` | navigation unlocked | none | Navigation palette / tool shelf | yes | map data |
| Connect navigation nodes | `MapEditorToolbar` | latest nodes | `onConnectNavigationNodes` | at least two nodes | none | Navigation palette | yes | map data |
| Create route | `MapEditorToolbar` | navigation nodes | `onCreateRoute` | at least two nodes | none | Navigation palette / bottom Validation | yes | map data |
| Layer visibility | `MapEditorToolbar` | `layerStates` | `onLayerVisibilityChange` | editor open | menu access | View menu / outliner rows | yes | editor preference |
| Layer lock | `MapEditorToolbar` | `layerStates` | `onLayerLockChange` | editor open | menu access | View menu / outliner rows | yes | editor preference |
| Clean preview | `MapEditorToolbar` | `cleanPreview` | `onCleanPreviewChange` | editor open | `Shift+Space` planned | main toolbar / View menu | no | editor preference |
| Selected terrain info | `MapEditorToolbar` | selected cell/session | read-only | terrain selected | none | Inspector | yes | map data |
| Selected marker info | `MapEditorToolbar` | browsing/editor selection | read-only/remove | marker selected | none | Outliner / Inspector | yes | map data |
| Selected entity info | `MapEditorToolbar` | selected entity IDs | read-only/actions | entity selected | none | Outliner / Inspector | yes | map data |
| Undo | `MapEditorToolbar` | editor/map history | `onUndo` | undo available | `Ctrl/Cmd+Z` | main toolbar / Edit menu / History tab | no | command history |
| Redo | `MapEditorToolbar` | editor/map history | `onRedo` | redo available | `Ctrl/Cmd+Shift+Z` | main toolbar / Edit menu / History tab | no | command history |
| Validation summary | `MapEditorToolbar` | validation messages | read-only | editor open | none | bottom Validation tab / toolbar badge | no | derived data |
| Performance metrics | diagnostics panel | renderer info | read-only | metrics enabled | none | bottom Performance tab | no | runtime diagnostic |

The old monolithic panel is replaced by `MapEditorToolbar` acting as an editor shell. Business actions remain supplied by `PortfolioExperience`, so menu items, toolbar buttons, shelves and panels call the same callbacks.
