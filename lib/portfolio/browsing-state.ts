export type BrowsingState =
  | { mode: "overview"; mapId: string }
  | { mode: "zoneSelected"; mapId: string; zoneId: string }
  | { mode: "zoneFocused"; mapId: string; zoneId: string; previousViewId?: string }
  | { mode: "itemSelected"; mapId: string; zoneId?: string; markerId: string; itemId: string; previousViewId?: string }
  | { mode: "contentOpen"; mapId: string; zoneId?: string; markerId: string; itemId: string; previousViewId?: string }
  | { mode: "returningToOverview"; mapId: string; previousViewId?: string };

export type BrowsingAction =
  | { type: "selectZone"; zoneId: string }
  | { type: "focusZone"; previousViewId?: string }
  | { type: "selectItem"; markerId: string; itemId: string; zoneId?: string; previousViewId?: string }
  | { type: "openContent" }
  | { type: "closeContent" }
  | { type: "returnToOverview"; previousViewId?: string }
  | { type: "settleOverview" }
  | { type: "changeMap"; mapId: string }
  | { type: "escape" };

export function createBrowsingState(mapId: string): BrowsingState {
  return { mode: "overview", mapId };
}

export function reduceBrowsingState(state: BrowsingState, action: BrowsingAction): BrowsingState {
  switch (action.type) {
    case "selectZone":
      return { mode: "zoneSelected", mapId: state.mapId, zoneId: action.zoneId };
    case "focusZone":
      if (state.mode === "zoneSelected" || state.mode === "zoneFocused") {
        return { mode: "zoneFocused", mapId: state.mapId, zoneId: state.zoneId, previousViewId: action.previousViewId };
      }
      return state;
    case "selectItem":
      return {
        mode: "itemSelected",
        mapId: state.mapId,
        zoneId: action.zoneId,
        markerId: action.markerId,
        itemId: action.itemId,
        previousViewId: action.previousViewId,
      };
    case "openContent":
      if (state.mode !== "itemSelected") {
        return state;
      }
      return { ...state, mode: "contentOpen" };
    case "closeContent":
      if (state.mode !== "contentOpen") {
        return state;
      }
      return {
        mode: "itemSelected",
        mapId: state.mapId,
        zoneId: state.zoneId,
        markerId: state.markerId,
        itemId: state.itemId,
        previousViewId: state.previousViewId,
      };
    case "returnToOverview":
      return { mode: "returningToOverview", mapId: state.mapId, previousViewId: action.previousViewId };
    case "settleOverview":
      return settleOverview(state);
    case "changeMap":
      return { mode: "overview", mapId: action.mapId };
    case "escape":
      return escapeBrowsingState(state);
    default:
      return state;
  }
}

export function settleOverview(state: BrowsingState): BrowsingState {
  if (state.mode !== "returningToOverview") {
    return state;
  }
  return { mode: "overview", mapId: state.mapId };
}

function escapeBrowsingState(state: BrowsingState): BrowsingState {
  switch (state.mode) {
    case "contentOpen":
      return {
        mode: "itemSelected",
        mapId: state.mapId,
        zoneId: state.zoneId,
        markerId: state.markerId,
        itemId: state.itemId,
        previousViewId: state.previousViewId,
      };
    case "itemSelected":
      return state.zoneId
        ? { mode: "zoneFocused", mapId: state.mapId, zoneId: state.zoneId, previousViewId: state.previousViewId }
        : { mode: "overview", mapId: state.mapId };
    case "zoneFocused":
      return { mode: "zoneSelected", mapId: state.mapId, zoneId: state.zoneId };
    case "zoneSelected":
    case "returningToOverview":
      return { mode: "overview", mapId: state.mapId };
    case "overview":
    default:
      return state;
  }
}
