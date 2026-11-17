import type { ModelSettings } from "@/lib/maps/map-definition";
import type { EntityWindOptions, ModelWindBinding } from "./entity-meshes";
import type { ModelLibrary } from "./model-library";
import { applyWindResponse, createWindResponseUniforms, resolveWindResponse, windWeightSources, type Wind, type WindResponse } from "./wind";

/**
 * Wind bindings of a map's models: for each wind-reactive model (one whose
 * asset.json has `wind`), its resolved response (asset defaults + the map's
 * `modelSettings`) and one set of uniforms shared by every batch of it.
 *
 * Changing a response value only writes a uniform. Changing the weight
 * source changes the shader, so `update` reports it and the caller rebuilds
 * the entity layer (the editor; visitors never change it).
 */
export class ModelWindRegistry {
  private readonly bindings = new Map<string, ModelWindBinding & { response: WindResponse }>();
  private settings: Record<string, ModelSettings> | undefined;

  constructor(
    private readonly models: ModelLibrary,
    private readonly wind: Wind,
    settings: Record<string, ModelSettings> | undefined,
  ) {
    this.settings = settings;
  }

  /** Options for buildEntityLayer. */
  options(): EntityWindOptions {
    return { global: this.wind.uniforms, forModel: (modelId) => this.forModel(modelId) };
  }

  /** The response a model has in this map, or null when it does not react to wind. */
  response(modelId: string): WindResponse | null {
    const entry = this.models.entry(modelId);
    if (!entry?.wind) return null;
    const response = resolveWindResponse(entry.wind, this.settings?.[modelId]?.wind);
    // A source the model cannot provide falls back to height, as the shader does.
    if (!windWeightSources(entry.attributes ?? []).includes(response.weightSource)) response.weightSource = "height";
    return response;
  }

  forModel(modelId: string): ModelWindBinding | null {
    const existing = this.bindings.get(modelId);
    if (existing) return existing;
    const entry = this.models.entry(modelId);
    const response = this.response(modelId);
    if (!entry || !response) return null;
    const binding = {
      uniforms: createWindResponseUniforms(response, entry.bounds),
      weightSource: response.weightSource,
      attributes: entry.attributes ?? [],
      response,
    };
    this.bindings.set(modelId, binding);
    return binding;
  }

  /** New per-model settings. Returns true when a weight source changed, so materials must be rebuilt. */
  update(settings: Record<string, ModelSettings> | undefined) {
    this.settings = settings;
    let rebuild = false;
    for (const [modelId, binding] of this.bindings) {
      const response = this.response(modelId);
      if (!response) continue;
      applyWindResponse(binding.uniforms, response);
      binding.response = response;
      if (response.weightSource !== binding.weightSource) {
        this.bindings.delete(modelId);
        rebuild = true;
      }
    }
    return rebuild;
  }
}
