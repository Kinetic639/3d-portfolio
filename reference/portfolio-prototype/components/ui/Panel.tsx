import type { ReactNode } from "react";

export interface PanelProps {
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  glass?: boolean;
}

/** Glass-style container for grouping web UI content — cards, side panels, form sections. */
export function Panel({ title, actions, children, className, glass = true }: PanelProps) {
  const classes = ["ds-panel", glass ? "ds-panel--glass" : "ds-panel--solid", className].filter(Boolean).join(" ");
  const hasHeader = Boolean(title || actions);

  return (
    <section className={classes}>
      {hasHeader ? (
        <header className="ds-panel__header">
          {title ? <h3 className="ds-panel__title">{title}</h3> : <span />}
          {actions ? <div className="ds-panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="ds-panel__body">{children}</div>
    </section>
  );
}
