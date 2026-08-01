import { describe, expect, it } from "vitest";
import { createBrowsingState, reduceBrowsingState, settleOverview } from "./browsing-state";

describe("browsing state", () => {
  it("moves through zone, item, content and overview states", () => {
    let state = createBrowsingState("portfolio-phase4");

    state = reduceBrowsingState(state, { type: "selectZone", zoneId: "projects" });
    expect(state).toEqual({ mode: "zoneSelected", mapId: "portfolio-phase4", zoneId: "projects" });

    state = reduceBrowsingState(state, { type: "focusZone", previousViewId: "overview" });
    expect(state.mode).toBe("zoneFocused");

    state = reduceBrowsingState(state, {
      type: "selectItem",
      zoneId: "projects",
      markerId: "project-a",
      itemId: "project-placeholder-1",
      previousViewId: "projects-focus",
    });
    expect(state.mode).toBe("itemSelected");

    state = reduceBrowsingState(state, { type: "openContent" });
    expect(state.mode).toBe("contentOpen");

    state = reduceBrowsingState(state, { type: "closeContent" });
    expect(state.mode).toBe("itemSelected");

    state = reduceBrowsingState(state, { type: "returnToOverview", previousViewId: "projects-focus" });
    expect(settleOverview(state)).toEqual({ mode: "overview", mapId: "portfolio-phase4" });
  });

  it("clears incompatible selection when maps change", () => {
    const selected = reduceBrowsingState(createBrowsingState("portfolio-phase4"), { type: "selectZone", zoneId: "projects" });
    expect(reduceBrowsingState(selected, { type: "changeMap", mapId: "tiny-example" })).toEqual({
      mode: "overview",
      mapId: "tiny-example",
    });
  });

  it("uses Escape to step backward through the hierarchy", () => {
    const open = reduceBrowsingState(
      reduceBrowsingState(createBrowsingState("portfolio-phase4"), {
        type: "selectItem",
        zoneId: "projects",
        markerId: "project-a",
        itemId: "project-placeholder-1",
      }),
      { type: "openContent" },
    );

    const item = reduceBrowsingState(open, { type: "escape" });
    expect(item.mode).toBe("itemSelected");
    const zone = reduceBrowsingState(item, { type: "escape" });
    expect(zone.mode).toBe("zoneFocused");
    const selected = reduceBrowsingState(zone, { type: "escape" });
    expect(selected.mode).toBe("zoneSelected");
    expect(reduceBrowsingState(selected, { type: "escape" }).mode).toBe("overview");
  });
});
