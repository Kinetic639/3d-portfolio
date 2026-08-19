import type { MapDefinition } from "@/lib/maps/map-definition";
import { cloneNavigationDefinition, type NavigationEdge, type NavigationNode, type NavigationRoute } from "@/lib/maps/map-navigation";

export function addNavigationNode(map: MapDefinition, node: NavigationNode): MapDefinition {
  return {
    ...map,
    navigation: {
      ...cloneNavigationDefinition(map.navigation),
      nodes: [...map.navigation.nodes, cloneNode(node)],
    },
  };
}

export function addNavigationEdge(map: MapDefinition, edge: NavigationEdge): MapDefinition {
  return {
    ...map,
    navigation: {
      ...cloneNavigationDefinition(map.navigation),
      edges: [...map.navigation.edges, { ...edge }],
    },
  };
}

export function addNavigationRoute(map: MapDefinition, route: NavigationRoute): MapDefinition {
  return {
    ...map,
    navigation: {
      ...cloneNavigationDefinition(map.navigation),
      routes: [...map.navigation.routes, { ...route, nodeIds: [...route.nodeIds], tags: [...route.tags] }],
    },
  };
}

export function validateNavigationReferences(map: MapDefinition) {
  const errors: string[] = [];
  const nodeIds = new Set<string>();

  for (const node of map.navigation.nodes) {
    if (nodeIds.has(node.id)) errors.push(`Duplicate navigation node id: ${node.id}.`);
    nodeIds.add(node.id);
  }

  for (const edge of map.navigation.edges) {
    if (!nodeIds.has(edge.fromNodeId)) errors.push(`Navigation edge ${edge.id} references unknown node ${edge.fromNodeId}.`);
    if (!nodeIds.has(edge.toNodeId)) errors.push(`Navigation edge ${edge.id} references unknown node ${edge.toNodeId}.`);
  }

  for (const route of map.navigation.routes) {
    for (const nodeId of route.nodeIds) {
      if (!nodeIds.has(nodeId)) errors.push(`Navigation route ${route.id} references unknown node ${nodeId}.`);
    }
  }

  return errors.length > 0 ? { ok: false as const, errors } : { ok: true as const };
}

function cloneNode(node: NavigationNode): NavigationNode {
  return {
    ...node,
    position: { ...node.position },
    tags: [...node.tags],
  };
}
