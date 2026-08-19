import type { BenchmarkRendererSummary, RendererMetricSummary } from "./types";

type ExperienceMetricsSnapshot = {
  calls?: number;
  triangles?: number;
  geometries?: number;
  textures?: number;
  instances?: number;
  visibleChunks?: number;
};

export class RendererMetricsAccumulator {
  private calls = createMetricAccumulator();
  private triangles = createMetricAccumulator();
  private lines = createMetricAccumulator();
  private points = createMetricAccumulator();
  private geometries = createMetricAccumulator();
  private textures = createMetricAccumulator();
  private programs = createMetricAccumulator();
  private instances = createMetricAccumulator();
  private visibleChunks = createMetricAccumulator();
  private dpr: number | null = null;
  private drawingBuffer: { width: number; height: number } | null = null;

  sample(metrics: ExperienceMetricsSnapshot | undefined, canvas: HTMLCanvasElement | null) {
    this.calls.add(metrics?.calls ?? null);
    this.triangles.add(metrics?.triangles ?? null);
    this.lines.add(null);
    this.points.add(null);
    this.geometries.add(metrics?.geometries ?? null);
    this.textures.add(metrics?.textures ?? null);
    this.programs.add(null);
    this.instances.add(metrics?.instances ?? null);
    this.visibleChunks.add(metrics?.visibleChunks ?? null);
    this.dpr = window.devicePixelRatio;
    if (canvas) {
      this.drawingBuffer = { width: canvas.width, height: canvas.height };
    }
  }

  summarize(): BenchmarkRendererSummary {
    return {
      calls: this.calls.summary(),
      triangles: this.triangles.summary(),
      lines: this.lines.summary(),
      points: this.points.summary(),
      geometries: this.geometries.summary(),
      textures: this.textures.summary(),
      programs: this.programs.summary(),
      dpr: this.dpr,
      drawingBuffer: this.drawingBuffer,
      instances: this.instances.summary(),
      visibleChunks: this.visibleChunks.summary(),
    };
  }
}

export function combineRendererSummaries(summaries: BenchmarkRendererSummary[]): BenchmarkRendererSummary {
  const combine = (key: keyof Pick<BenchmarkRendererSummary, "calls" | "triangles" | "lines" | "points" | "geometries" | "textures" | "programs" | "instances" | "visibleChunks">) => {
    const values = summaries.map((summary) => summary[key]).filter((summary) => summary.end !== null);
    if (values.length === 0) return emptyMetricSummary();
    return {
      min: minOrNull(values.map((summary) => summary.min)),
      max: maxOrNull(values.map((summary) => summary.max)),
      mean: round(values.reduce((sum, summary) => sum + (summary.mean ?? 0), 0) / values.length),
      end: values[values.length - 1].end,
    };
  };

  return {
    calls: combine("calls"),
    triangles: combine("triangles"),
    lines: combine("lines"),
    points: combine("points"),
    geometries: combine("geometries"),
    textures: combine("textures"),
    programs: combine("programs"),
    dpr: summaries.at(-1)?.dpr ?? null,
    drawingBuffer: summaries.at(-1)?.drawingBuffer ?? null,
    instances: combine("instances"),
    visibleChunks: combine("visibleChunks"),
  };
}

function createMetricAccumulator() {
  let count = 0;
  let total = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let end: number | null = null;

  return {
    add(value: number | null) {
      if (value === null || !Number.isFinite(value)) return;
      count += 1;
      total += value;
      min = Math.min(min, value);
      max = Math.max(max, value);
      end = value;
    },
    summary(): RendererMetricSummary {
      if (count === 0) return emptyMetricSummary();
      return { min, max, mean: round(total / count), end };
    },
  };
}

function emptyMetricSummary(): RendererMetricSummary {
  return { min: null, max: null, mean: null, end: null };
}

function minOrNull(values: Array<number | null>) {
  const next = values.filter((value): value is number => value !== null);
  return next.length ? Math.min(...next) : null;
}

function maxOrNull(values: Array<number | null>) {
  const next = values.filter((value): value is number => value !== null);
  return next.length ? Math.max(...next) : null;
}

function round(value: number) {
  return Number(value.toFixed(3));
}
