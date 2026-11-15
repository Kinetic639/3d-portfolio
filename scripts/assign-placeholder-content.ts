/**
 * One-off helper used during the rebuild: links objects and zones of the
 * default map to placeholder content so interaction can be exercised before
 * the editor exists. Safe to re-run; safe to delete once the editor ships.
 */
import { readMap, readMapIndex, writeMap } from "@/lib/maps/map-store";
import type { MapContentReference } from "@/lib/maps/map-definition";

const entityContent: Record<string, MapContentReference> = {
  "communication-station": { contentType: "contact", contentId: "contact" },
  "portfolio-workshop-compound": { contentType: "project", contentId: "project-placeholder-1" },
};
const zoneContent: Record<string, MapContentReference> = {
  "zone-2": { contentType: "skillGroup", contentId: "frontend" },
  "zone-3": { contentType: "project", contentId: "project-placeholder-2" },
  "zone-4": { contentType: "experience", contentId: "experience-placeholder-1" },
  "zone-5": { contentType: "about", contentId: "about" },
};

const map = readMap(readMapIndex().defaultMapId);
for (const entity of map.entities) {
  if (entityContent[entity.id]) entity.contentReference = entityContent[entity.id];
}
for (const zone of map.zones) {
  if (zoneContent[zone.id]) zone.contentReference = zoneContent[zone.id];
}
const saved = writeMap(map);
console.log(`Linked ${Object.keys(entityContent).length} entities and ${Object.keys(zoneContent).length} zones on ${saved.id}.`);
