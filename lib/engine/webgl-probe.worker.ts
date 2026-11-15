/**
 * Creates a throwaway WebGL 2 context off the main thread and reports whether
 * that worked.
 *
 * The first context a page creates starts the browser's GPU machinery, which
 * measured at about 170 ms of blocking time when done on the main thread.
 * Doing it here first means the real context, created on the main thread
 * later, takes a few milliseconds.
 */
const scope = self as unknown as { onmessage: (() => void) | null; postMessage: (supported: boolean) => void };

scope.onmessage = () => {
  let supported = false;
  try {
    supported = Boolean(new OffscreenCanvas(1, 1).getContext("webgl2"));
  } catch {
    supported = false;
  }
  scope.postMessage(supported);
};
