import type { MapDefinition } from "@/lib/maps/map-definition";
import { resolveContentReference, type MapLocationReference, type PortfolioContent } from "./content";

export function validatePortfolioContentReferences(maps: MapDefinition[], content: PortfolioContent) {
  const errors: string[] = [];
  const mapById = new Map(maps.map((map) => [map.id, map]));

  validateUnique(content.projects.map((project) => project.id), "project id", errors);
  validateUnique(content.projects.map((project) => project.slug), "project slug", errors);
  validateUnique(content.experience.map((entry) => entry.id), "experience id", errors);
  validateUnique(content.skills.map((group) => group.id), "skill group id", errors);

  for (const project of content.projects) validateLocation(project.mapLocation, mapById, `project ${project.id}`, errors);
  for (const entry of content.experience) validateLocation(entry.mapLocation, mapById, `experience ${entry.id}`, errors);
  validateLocation(content.about.mapLocation, mapById, `about ${content.about.id}`, errors);
  for (const group of content.skills) validateLocation(group.mapLocation, mapById, `skill group ${group.id}`, errors);
  validateLocation(content.contact.mapLocation, mapById, `contact ${content.contact.id}`, errors);

  for (const map of maps) {
    for (const marker of map.markers) {
      if (!marker.contentReference) {
        continue;
      }
      if (!resolveContentReference(marker.contentReference.contentType, marker.contentReference.contentId, content)) {
        errors.push(`Marker ${marker.id} references unresolved ${marker.contentReference.contentType} content ${marker.contentReference.contentId}.`);
      }
    }
  }

  return errors.length > 0 ? { ok: false as const, errors } : { ok: true as const };
}

function validateLocation(reference: MapLocationReference, mapById: Map<string, MapDefinition>, label: string, errors: string[]) {
  const map = mapById.get(reference.mapId);
  if (!map) {
    errors.push(`${label} references unknown map ${reference.mapId}.`);
    return;
  }
  if (reference.zoneId && !map.zones.some((zone) => zone.id === reference.zoneId)) {
    errors.push(`${label} references unknown zone ${reference.zoneId} on ${reference.mapId}.`);
  }
  if (reference.markerId && !map.markers.some((marker) => marker.id === reference.markerId)) {
    errors.push(`${label} references unknown marker ${reference.markerId} on ${reference.mapId}.`);
  }
  if (reference.spawnId && !map.spawnPoints.some((spawn) => spawn.id === reference.spawnId)) {
    errors.push(`${label} references unknown spawn ${reference.spawnId} on ${reference.mapId}.`);
  }
}

function validateUnique(values: string[], label: string, errors: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      errors.push(`Duplicate ${label}: ${value}.`);
    }
    seen.add(value);
  }
}
