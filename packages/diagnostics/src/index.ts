import type { DiagnosticSample, Unsubscribe } from "@portfolio/contracts";
/** External observation only; never imported by production runtime. */
export interface DiagnosticSource {
  subscribe(listener: (sample: DiagnosticSample) => void): Unsubscribe;
}
