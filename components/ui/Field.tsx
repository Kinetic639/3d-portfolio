"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

interface FieldWrapperProps {
  label: string;
  hint?: ReactNode;
  error?: string;
}

export interface TextFieldProps extends FieldWrapperProps, Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {}

/** Labeled text input for forms inside dialogs and panels. */
export function TextField({ label, hint, error, className, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = props.name ?? generatedId;

  return (
    <label className="ds-field" htmlFor={inputId}>
      <span className="ds-field__label">{label}</span>
      <input id={inputId} className={["ds-field__control", className].filter(Boolean).join(" ")} {...props} />
      {error ? <span className="ds-field__hint ds-field__hint--error">{error}</span> : hint ? <span className="ds-field__hint">{hint}</span> : null}
    </label>
  );
}

export interface TextAreaFieldProps extends FieldWrapperProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {}

/** Labeled multi-line text input, styled to match TextField. */
export function TextAreaField({ label, hint, error, className, ...props }: TextAreaFieldProps) {
  const generatedId = useId();
  const inputId = props.name ?? generatedId;

  return (
    <label className="ds-field" htmlFor={inputId}>
      <span className="ds-field__label">{label}</span>
      <textarea id={inputId} className={["ds-field__control", "ds-field__control--textarea", className].filter(Boolean).join(" ")} {...props} />
      {error ? <span className="ds-field__hint ds-field__hint--error">{error}</span> : hint ? <span className="ds-field__hint">{hint}</span> : null}
    </label>
  );
}
