"use client";

import gsap from "gsap";
import { useLayoutEffect, useRef, type ReactNode } from "react";

export interface WelcomeHeroProps {
  kicker: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Set false to skip the GSAP entrance (e.g. when showcasing statically). */
  animate?: boolean;
}

/**
 * Full-bleed hero used for the portfolio welcome screen and similar
 * introductory moments. Extracted from the experience's inline
 * WelcomePanel so the same kicker/title/entrance pattern can be reused
 * elsewhere (case studies, section intros, etc).
 */
export function WelcomeHero({ kicker, title, subtitle, actions, animate = true }: WelcomeHeroProps) {
  const heroRef = useRef<HTMLElement>(null);
  const kickerRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    if (!animate) return;

    const context = gsap.context(() => {
      gsap.fromTo(heroRef.current, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.75, ease: "power3.out" });
      gsap.fromTo(
        [kickerRef.current, titleRef.current],
        { autoAlpha: 0, y: 18 },
        { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08, delay: 0.12 },
      );
    }, heroRef);

    return () => context.revert();
  }, [animate]);

  return (
    <section ref={heroRef} className="ds-hero" aria-label={title}>
      <p ref={kickerRef} className="ds-hero__kicker">{kicker}</p>
      <h1 ref={titleRef} className="ds-hero__title">{title}</h1>
      {subtitle ? <p className="ds-hero__subtitle">{subtitle}</p> : null}
      {actions ? <div className="ds-hero__actions">{actions}</div> : null}
    </section>
  );
}
