"use client";

import { useRef } from "react";
import LanguageSwitch from "./LanguageSwitch";
import styles from "./LandingPage.module.css";

/**
 * The bar's menu on phones (docs/roadmap.md, B1: "on phones, the name and a
 * menu"): the sections and the language, folded behind one button. A native
 * <details>, so it opens without JavaScript; with it, choosing a link folds
 * the menu away again. Wide screens show the same links in the bar instead.
 */
export default function PhoneMenu({ label, navLabel, links }: { label: string; navLabel: string; links: { href: string; text: string }[] }) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const fold = () => menuRef.current?.removeAttribute("open");
  return (
    <details
      ref={menuRef}
      className={styles.phoneMenu}
      onClick={(event) => {
        if ((event.target as Element).closest("a")) fold();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuRef.current?.open) {
          fold();
          menuRef.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>{label}</summary>
      <div className={styles.phoneMenuPanel}>
        <nav aria-label={navLabel}>
          <ul>
            {links.map((link) => <li key={link.href}><a href={link.href}>{link.text}</a></li>)}
          </ul>
        </nav>
        <LanguageSwitch />
      </div>
    </details>
  );
}
