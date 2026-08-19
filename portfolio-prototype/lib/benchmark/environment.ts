import type { BenchmarkEnvironment } from "./types";

type NavigatorWithMemory = Navigator & {
  deviceMemory?: number;
  userAgentData?: { platform?: string };
};

type PerformanceWithMemory = Performance & {
  memory?: { usedJSHeapSize?: number };
};

export function collectBenchmarkEnvironment(options: {
  mode: BenchmarkEnvironment["mode"];
  visibilityInterruptions: number;
  canvas: HTMLCanvasElement | null;
}): BenchmarkEnvironment {
  const nav = navigator as NavigatorWithMemory;
  const webgl = getWebglInfo(options.canvas);
  return {
    userAgent: navigator.userAgent,
    platform: nav.userAgentData?.platform ?? navigator.platform ?? null,
    logicalCpuCount: navigator.hardwareConcurrency ?? null,
    deviceMemoryGb: nav.deviceMemory ?? null,
    webglVersion: webgl.version,
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
    screen: { width: window.screen.width, height: window.screen.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
    drawingBuffer: options.canvas ? { width: options.canvas.width, height: options.canvas.height } : null,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    visibilityInterruptions: options.visibilityInterruptions,
    mode: options.mode,
  };
}

export function getUsedJsHeapSize() {
  return (performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? null;
}

function getWebglInfo(canvas: HTMLCanvasElement | null) {
  const context = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl") ?? null;
  if (!context) {
    return { version: null, vendor: null, renderer: null };
  }
  const debugInfo = context.getExtension("WEBGL_debug_renderer_info");
  return {
    version: context.getParameter(context.VERSION) as string,
    vendor: debugInfo ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string : context.getParameter(context.VENDOR) as string,
    renderer: debugInfo ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string : context.getParameter(context.RENDERER) as string,
  };
}
