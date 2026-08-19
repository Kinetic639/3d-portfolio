import { spaceGrotesk, inter } from "@/lib/design-system/fonts";
import { CutCornerPanel } from "./CutCornerPanel";
import styles from "./LocationArrivalOverlay.module.css";

export interface LocationArrivalOverlayProps {
  /** Two-digit location index, e.g. "03". */
  index: string;
  title: string;
  /** Short meta lines under the title, e.g. ["Selected work", "2023 – 2026"]. */
  metaLines: [string, string];
  /** Total stops in the pagination trail. */
  stopCount?: number;
  /** Zero-based index of the active stop. */
  activeStop?: number;
}

/**
 * "06. Location arrival overlay" from the dark UI concept — announces which
 * in-world zone the camera just arrived at, on the same notched-corner shape
 * as {@link HoverTooltipCard}, with a dot trail marking progress through the
 * portfolio's sections and a small corner dot-grid flourish.
 */
export function LocationArrivalOverlay({ index, title, metaLines, stopCount = 5, activeStop = 2 }: LocationArrivalOverlayProps) {
  return (
    <CutCornerPanel width={320} height={168} radius={14} notch={26} className={`${styles.card} ${spaceGrotesk.variable} ${inter.variable}`}>
      <div className={styles.headerRow}>
        <span className={styles.index}>{index}</span>
        <h3 className={styles.title}>{title}</h3>
      </div>
      <div className={styles.meta}>
        <p>{metaLines[0]}</p>
        <p>{metaLines[1]}</p>
      </div>
      <div className={styles.footer}>
        <div className={styles.dots} role="presentation">
          {Array.from({ length: stopCount }, (_, i) => (
            <span key={i} className={i === activeStop ? styles.dotActive : styles.dot} aria-hidden="true" />
          ))}
        </div>
        <div className={styles.dotGrid} aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      </div>
    </CutCornerPanel>
  );
}
