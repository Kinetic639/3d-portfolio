import type { CSSProperties, ReactNode } from "react";
import { cutCornerClipPath } from "@/lib/design-system/cut-corner";
import styles from "./CutCornerPanel.module.css";

export interface CutCornerPanelProps {
  /** Fixed pixel size — required because `clip-path: path()` needs absolute coordinates. */
  width: number;
  height: number;
  radius?: number;
  notch?: number;
  notchColor?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * Card shape from the dark UI concept: rounded rectangle with the top-right
 * corner cut off diagonally and filled with a solid accent triangle. The
 * triangle is a sibling of the clipped panel (not a child) so it isn't
 * clipped away along with the corner it's covering.
 */
export function CutCornerPanel({
  width,
  height,
  radius = 12,
  notch = 26,
  notchColor,
  className,
  style,
  children,
}: CutCornerPanelProps) {
  return (
    <div className={styles.wrap} style={{ width, height }}>
      <div
        className={[styles.panel, className].filter(Boolean).join(" ")}
        style={{ ...style, clipPath: cutCornerClipPath(width, height, radius, notch) }}
      >
        {children}
      </div>
      <span
        className={styles.notch}
        style={{
          width: notch,
          height: notch,
          background: notchColor,
          clipPath: "polygon(100% 0, 0 0, 100% 100%)",
        }}
        aria-hidden="true"
      />
    </div>
  );
}
