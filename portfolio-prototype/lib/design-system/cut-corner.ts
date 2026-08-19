/**
 * Builds a `clip-path: path(...)` string for the notched-corner card shape
 * used throughout the new dark UI concept (arrival badge, tooltip card,
 * location overlay, project modal media). Every corner is rounded by
 * `radius` except the top-right, which is cut off diagonally by `notch`
 * pixels — that cut is filled separately by a sibling triangle (see
 * `CutCornerPanel`), producing the folded-corner/ribbon look.
 *
 * `clip-path: path()` only accepts absolute px coordinates, so callers must
 * pass a fixed pixel `width`/`height` rather than relying on auto layout.
 */
export function cutCornerClipPath(width: number, height: number, radius: number, notch: number): string {
  const w = width;
  const h = height;
  const r = radius;
  const n = notch;

  const d = [
    `M${r},0`,
    `H${w - n}`,
    `L${w},${n}`,
    `V${h - r}`,
    `A${r},${r} 0 0 1 ${w - r},${h}`,
    `H${r}`,
    `A${r},${r} 0 0 1 0,${h - r}`,
    `V${r}`,
    `A${r},${r} 0 0 1 ${r},0`,
    "Z",
  ].join(" ");

  return `path('${d}')`;
}
