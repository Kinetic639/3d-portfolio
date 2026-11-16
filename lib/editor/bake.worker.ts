import { bakeMap } from "@/lib/bake/bake-map";
import type { MapDefinition } from "@/lib/maps/map-definition";

/**
 * Bakes a map in the editor without blocking it: map definition in, baked
 * world file out (transferred). Used for the baked preview; nothing is saved.
 */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<MapDefinition>) => void) | null;
  postMessage: (message: { file?: ArrayBuffer; error?: string }, transfer?: Transferable[]) => void;
};

scope.onmessage = (event) => {
  bakeMap(event.data).then(
    ({ file }) => {
      const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
      scope.postMessage({ file: buffer }, [buffer]);
    },
    (error: unknown) => scope.postMessage({ error: error instanceof Error ? error.message : String(error) }),
  );
};
