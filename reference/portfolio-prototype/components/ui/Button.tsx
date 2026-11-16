"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

/**
 * Base button for web (DOM) UI — welcome screen, dialogs, panels, forms.
 * Not for the 3D scene or the map-editor's dark toolbar controls, which
 * keep their own Blender-inspired styling.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon, className, children, type = "button", ...props },
  ref,
) {
  const classes = ["ds-button", `ds-button--${variant}`, `ds-button--${size}`, className].filter(Boolean).join(" ");

  return (
    <button ref={ref} type={type} className={classes} {...props}>
      {icon ? <span className="ds-button__icon" aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
  active?: boolean;
}

/** Square icon-only button. `label` is required and doubles as the accessible name and tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "secondary", active = false, className, children, type = "button", ...props },
  ref,
) {
  const classes = ["ds-icon-button", `ds-icon-button--${variant}`, active ? "ds-icon-button--active" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} type={type} className={classes} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
});
