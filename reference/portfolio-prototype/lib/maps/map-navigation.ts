import type { SerializableVector3 } from "./map-entities";

export type NavigationNodeType = "walk" | "route-junction" | "wait-point" | "look-at" | "character-spawn" | "bird-perch";

export type NavigationNode = {
  id: string;
  type: NavigationNodeType;
  label: string;
  position: SerializableVector3;
  zoneId?: string;
  tags: string[];
  locked: boolean;
};

export type NavigationEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  bidirectional: boolean;
  cost?: number;
  routeTag?: string;
  locked: boolean;
};

export type NavigationRoute = {
  id: string;
  name: string;
  nodeIds: string[];
  tags: string[];
};

export type MapNavigationDefinition = {
  nodes: NavigationNode[];
  edges: NavigationEdge[];
  routes: NavigationRoute[];
};

export function createEmptyNavigationDefinition(): MapNavigationDefinition {
  return {
    nodes: [],
    edges: [],
    routes: [],
  };
}

export function cloneNavigationDefinition(navigation: MapNavigationDefinition): MapNavigationDefinition {
  return {
    nodes: (Array.isArray(navigation.nodes) ? navigation.nodes : []).map((node) => ({
      ...node,
      position: node.position ? { ...node.position } : { x: 0, y: 0, z: 0 },
      tags: Array.isArray(node.tags) ? [...node.tags] : [],
    })),
    edges: (Array.isArray(navigation.edges) ? navigation.edges : []).map((edge) => ({ ...edge })),
    routes: (Array.isArray(navigation.routes) ? navigation.routes : []).map((route) => ({
      ...route,
      nodeIds: Array.isArray(route.nodeIds) ? [...route.nodeIds] : [],
      tags: Array.isArray(route.tags) ? [...route.tags] : [],
    })),
  };
}
