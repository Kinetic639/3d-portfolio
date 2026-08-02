import { describe, expect, it } from "vitest";
import { createBlankMapDefinition, validateMapDefinition } from "@/lib/maps/map-definition";
import { addNavigationEdge, addNavigationNode, addNavigationRoute, validateNavigationReferences } from "./navigation-authoring";

describe("navigation authoring", () => {
  it("adds nodes, edges and ordered routes as serialized map data", () => {
    let map = createBlankMapDefinition({ id: "nav-test", name: "Nav Test" });
    map = addNavigationNode(map, { id: "walk-a", type: "walk", label: "Walk A", position: { x: 0, y: 1, z: 0 }, tags: [], locked: false });
    map = addNavigationNode(map, { id: "junction-a", type: "route-junction", label: "Junction A", position: { x: 2, y: 1, z: 0 }, tags: [], locked: false });
    map = addNavigationEdge(map, { id: "edge-a", fromNodeId: "walk-a", toNodeId: "junction-a", bidirectional: true, cost: 1, locked: false });
    map = addNavigationRoute(map, { id: "route-a", name: "Route A", nodeIds: ["walk-a", "junction-a"], tags: ["test"] });

    expect(validateNavigationReferences(map)).toEqual({ ok: true });
    expect(validateMapDefinition(map).ok).toBe(true);
    expect(map.navigation.routes[0].nodeIds).toEqual(["walk-a", "junction-a"]);
  });

  it("rejects missing-node edges and invalid route references", () => {
    let map = createBlankMapDefinition({ id: "bad-nav-test", name: "Bad Nav Test" });
    map = addNavigationNode(map, { id: "walk-a", type: "walk", label: "Walk A", position: { x: 0, y: 1, z: 0 }, tags: [], locked: false });
    map = addNavigationEdge(map, { id: "edge-a", fromNodeId: "walk-a", toNodeId: "missing", bidirectional: true, locked: false });
    map = addNavigationRoute(map, { id: "route-a", name: "Route A", nodeIds: ["missing"], tags: [] });

    const result = validateNavigationReferences(map);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.errors.join("\n")).toContain("missing");
  });
});
