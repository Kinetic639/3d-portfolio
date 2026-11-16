import { ArrowRight } from "lucide-react";
import { spaceGrotesk, inter } from "@/lib/design-system/fonts";
import { CutCornerPanel } from "./CutCornerPanel";
import styles from "./HoverTooltipCard.module.css";

export interface HoverTooltipCardProps {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel?: string;
}

/** "05. Hover tooltip example" from the dark UI concept — a project preview card with a cut top-right corner. */
export function HoverTooltipCard({ eyebrow, title, description, actionLabel = "View project" }: HoverTooltipCardProps) {
  return (
    <CutCornerPanel width={268} height={190} radius={14} notch={26} className={`${styles.card} ${spaceGrotesk.variable} ${inter.variable}`}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      <span className={styles.action}>
        {actionLabel}
        <ArrowRight aria-hidden="true" size={14} />
      </span>
    </CutCornerPanel>
  );
}
