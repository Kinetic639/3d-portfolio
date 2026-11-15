"use client";

import { useState, type ReactNode } from "react";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { CONTENT_SECTIONS } from "@/lib/content/content";
import type { MapContentReference } from "@/lib/maps/map-definition";
import { contentKey, parseContentKey } from "./editor-actions";
import styles from "./Editor.module.css";

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.row}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * Text input that commits on blur or Enter, so typing a value is one undo
 * step rather than one per keystroke. Escape restores the current value.
 */
export function TextField({ value, onCommit, label, placeholder }: { value: string; onCommit: (value: string) => void; label: string; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      aria-label={label}
      className={styles.input}
      placeholder={placeholder}
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(null);
          event.stopPropagation();
        }
      }}
    />
  );
}

export function NumberField({ value, onCommit, label, step = 1, min, max }: { value: number; onCommit: (value: number) => void; label: string; step?: number; min?: number; max?: number }) {
  const shown = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
  return (
    <TextField
      label={label}
      value={shown}
      onCommit={(text) => {
        const parsed = Number(text);
        if (!Number.isFinite(parsed)) return;
        const snapped = step >= 1 ? Math.round(parsed) : parsed;
        onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, snapped)));
      }}
    />
  );
}

/** Picks a portfolio content item. `mixed` shows a placeholder when a multi-selection disagrees. */
export function ContentSelect({ value, mixed, onChange, label }: { value: MapContentReference | undefined; mixed?: boolean; onChange: (reference: MapContentReference | null) => void; label: string }) {
  return (
    <select
      aria-label={label}
      className={styles.input}
      value={mixed ? "__mixed" : contentKey(value)}
      onChange={(event) => onChange(parseContentKey(event.target.value))}
    >
      {mixed ? <option value="__mixed" disabled>Mixed</option> : null}
      <option value="">None</option>
      {CONTENT_SECTIONS.map((section) => {
        const items = PORTFOLIO_CONTENT.items.filter((item) => item.kind === section.kind);
        if (items.length === 0) return null;
        return (
          <optgroup key={section.kind} label={section.label}>
            {items.map((item) => (
              <option key={item.id} value={`${item.kind}:${item.id}`}>{item.title}</option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
