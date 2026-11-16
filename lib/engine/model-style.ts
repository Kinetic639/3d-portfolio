import type { MapSurfaceStyle, ModelSettings } from "@/lib/maps/map-definition";
import type { EntityStyleOptions, ModelStyleBinding } from "./entity-meshes";
import type { ModelLibrary } from "./model-library";
import { resolveModelStyle, resolveSurfaceStyle, SurfaceStyle } from "./surface-style";

/**
 * How each model of a map is drawn: asset.json `style` with the map's
 * `modelSettings[id].style` over it, and one outline-scale uniform per model
 * shared by its batches. The map's surface style (bands, hatching, outline
 * thickness and colour, contact darkness) is shared uniforms in `surface`.
 *
 * Values that are uniforms change live. Shading, outline on/off, contact
 * patch and shadow casting change which batches exist: `update` reports
 * them and the caller rebuilds the entity layer (the editor).
 */
export class ModelStyleRegistry {
  readonly surface = new SurfaceStyle();
  private readonly contactOpacity = { value: 0 };
  private readonly bindings = new Map<string, ModelStyleBinding>();
  private settings: Record<string, ModelSettings> | undefined;

  constructor(private readonly models: ModelLibrary, settings: Record<string, ModelSettings> | undefined, style: MapSurfaceStyle | undefined) {
    this.settings = settings;
    this.applySurface(style);
  }

  options(): EntityStyleOptions {
    return { surface: this.surface, contactOpacity: this.contactOpacity, forModel: (modelId) => this.forModel(modelId) };
  }

  applySurface(style: MapSurfaceStyle | undefined) {
    const resolved = resolveSurfaceStyle(style);
    this.surface.apply(resolved);
    this.contactOpacity.value = resolved.contactShadow;
  }

  forModel(modelId: string): ModelStyleBinding {
    let binding = this.bindings.get(modelId);
    if (!binding) {
      const style = resolveModelStyle(this.models.entry(modelId)?.style, this.settings?.[modelId]?.style);
      binding = { style, outlineScale: { value: style.outlineScale } };
      this.bindings.set(modelId, binding);
    }
    return binding;
  }

  /** New per-model settings. Returns true when batches must be rebuilt. */
  update(settings: Record<string, ModelSettings> | undefined) {
    this.settings = settings;
    let rebuild = false;
    for (const [modelId, binding] of this.bindings) {
      const next = resolveModelStyle(this.models.entry(modelId)?.style, settings?.[modelId]?.style);
      binding.outlineScale.value = next.outlineScale;
      const changed = (["shading", "outline", "contactShadow", "castShadow"] as const).some((key) => next[key] !== binding.style[key]);
      binding.style = next;
      if (changed) rebuild = true;
    }
    return rebuild;
  }

  dispose() {
    this.surface.dispose();
  }
}
