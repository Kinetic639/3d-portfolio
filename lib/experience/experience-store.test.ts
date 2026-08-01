import { beforeEach, describe, expect, it } from "vitest";
import { isInteractivePhase, useExperienceStore } from "./experience-store";

describe("experience store", () => {
  beforeEach(() => {
    useExperienceStore.getState().reset();
  });

  it("tracks the proof-of-concept phase sequence", () => {
    const store = useExperienceStore.getState();

    store.markLoading();
    expect(useExperienceStore.getState().phase).toBe("loading");

    useExperienceStore.getState().markReady();
    expect(useExperienceStore.getState().phase).toBe("ready");

    useExperienceStore.getState().startExpansion();
    expect(useExperienceStore.getState().phase).toBe("expanding");

    useExperienceStore.getState().markExplore();
    expect(useExperienceStore.getState().phase).toBe("explore");
  });

  it("does not move backward through runtime phases", () => {
    useExperienceStore.getState().markLoading();
    useExperienceStore.getState().markReady();
    useExperienceStore.getState().markLoading();

    expect(useExperienceStore.getState().phase).toBe("ready");
  });

  it("only treats explore as the interactive map phase", () => {
    expect(isInteractivePhase("ready")).toBe(false);
    expect(isInteractivePhase("explore")).toBe(true);
  });
});
