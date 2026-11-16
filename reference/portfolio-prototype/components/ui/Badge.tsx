import type { ReactNode } from "react";

export type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

/** Small pill for status/labels — e.g. a phase indicator or a tag on a card. */
export function Badge({ variant = "neutral", dot = false, children, className }: BadgeProps) {
  const classes = ["ds-badge", `ds-badge--${variant}`, className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      {dot ? <span className="ds-badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
