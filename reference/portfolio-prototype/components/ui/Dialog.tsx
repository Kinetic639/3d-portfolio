"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Modal dialog for web UI flows (confirmations, forms, previews). Renders
 * into a portal, closes on Escape or backdrop click, and restores focus to
 * whatever triggered it.
 */
export function Dialog({ open, onClose, title, description, children, footer, className }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="ds-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={["ds-dialog", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ds-dialog__header">
          <div>
            <h2 className="ds-dialog__title">{title}</h2>
            {description ? <p className="ds-dialog__description">{description}</p> : null}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X aria-hidden="true" size={16} />
          </IconButton>
        </header>
        <div className="ds-dialog__body">{children}</div>
        {footer ? <footer className="ds-dialog__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
