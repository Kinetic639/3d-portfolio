"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type StoryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  shape?: "scoop" | "arch" | "capsule" | "pill" | "oval" | "circle";
};

export function StoryButton({
  children,
  shape = "scoop",
  className = "",
  ...props
}: StoryButtonProps) {
  const usesGeneratedArt = ["pill", "oval", "circle"].includes(shape);

  return (
    <button
      className={`start-button story-button--${shape} ${className}`.trim()}
      type="button"
      {...props}
    >
      {usesGeneratedArt ? (
        <span className="generated-button-art" aria-hidden="true" />
      ) : (
        <span className="button-art" aria-hidden="true">
          <i className="button-piece button-piece-left">
            <b className="button-image button-image-normal" />
            <b className="button-image button-image-rollover" />
          </i>
          <i className="button-piece button-piece-middle">
            <b className="button-image button-image-normal" />
            <b className="button-image button-image-rollover" />
          </i>
          <i className="button-piece button-piece-right">
            <b className="button-image button-image-normal" />
            <b className="button-image button-image-rollover" />
          </i>
        </span>
      )}
      {shape === "capsule" ? (
        <span className="button-art button-art-mirror" aria-hidden="true">
          <i className="button-piece button-piece-left">
            <b className="button-image button-image-normal" />
            <b className="button-image button-image-rollover" />
          </i>
          <i className="button-piece button-piece-middle">
            <b className="button-image button-image-normal" />
            <b className="button-image button-image-rollover" />
          </i>
          <i className="button-piece button-piece-right">
            <b className="button-image button-image-normal" />
            <b className="button-image button-image-rollover" />
          </i>
        </span>
      ) : null}
      <span className="button-label">{children}</span>
    </button>
  );
}
