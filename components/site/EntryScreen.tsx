"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { portfolioContent } from "@/content/localized";
import { enterWorld, loadWorld } from "@/components/world/entry-control";
import { useWorldBridge } from "@/lib/bridge/use-world-bridge";
import { LOCALES, localizePath, splitLocale } from "@/lib/i18n/locale";
import { messages } from "@/lib/i18n/messages";
import { useUiWork } from "@/lib/perf/ui-work";
import { CV_PATH } from "./cv";
import { useLocale } from "./locale-context";
import styles from "./EntryScreen.module.css";

/** The prototype is shown only with ?entry=door (docs/roadmap.md, B4): the page is unchanged without it. */
export const ENTRY_PARAM = "entry";
const ENTRY_VALUE = "door";

/** The entry's beats, in milliseconds from the click: one move into the light, then the light lifts off the world. */
const TIMING = { enterAt: 1300, fade: 900 };

type Stage = "hidden" | "door" | "going" | "fading";

/**
 * The entry screen (prototype): a door in the middle of the screen that is
 * the world's loader. Closed, with light pulsing through its gaps, while the
 * world loads; open a little, the light steady, once it is ready. A click
 * moves the "camera" to the door, which opens fully onto light; the light
 * floods the screen and, under it, the world's own entry begins (the camera
 * coming down from the sky).
 *
 * A note pinned to the door says CV: it opens a panel with what the site
 * is, the CV, contact, and the classic version (the page underneath, which
 * is complete without the world).
 */
export default function EntryScreen() {
  useUiWork();
  const locale = useLocale();
  const text = messages(locale).entry;
  const content = portfolioContent(locale);
  const contact = content.items.find((item) => item.kind === "contact");
  const phase = useWorldBridge((state) => state.phase);
  const percent = useWorldBridge((state) => Math.round(state.progress * 100));
  const [stage, setStage] = useState<Stage>("hidden");
  const [noteOpen, setNoteOpen] = useState(false);
  const doorRef = useRef<HTMLButtonElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const doorwayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Shown only for the prototype's address; read after mount (the server renders the page without it).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get(ENTRY_PARAM) === ENTRY_VALUE) setStage("door");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Without WebGL there is no world: the classic page is the site.
  useEffect(() => {
    if (phase !== "unavailable" || stage !== "door") return;
    const timer = window.setTimeout(() => setStage("hidden"), 0);
    return () => window.clearTimeout(timer);
  }, [phase, stage]);

  useEffect(() => {
    if (stage === "door" && !noteOpen) doorRef.current?.focus({ preventScroll: true });
  }, [stage, noteOpen]);
  useEffect(() => {
    if (noteOpen) panelRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [noteOpen]);

  const ready = phase === "ready";
  const held = phase === "idle";

  const go = useCallback(() => {
    if (!ready || stage !== "door") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      enterWorld();
      setStage("hidden");
      return;
    }
    // The "camera" goes into the doorway: scaled around the doorway's centre, moved to the screen's,
    // until its light covers the whole screen.
    const scene = sceneRef.current;
    const doorway = doorwayRef.current;
    if (scene && doorway) {
      const box = scene.getBoundingClientRect();
      const door = doorway.getBoundingClientRect();
      const cx = door.left + door.width / 2;
      const cy = door.top + door.height / 2;
      const scale = Math.max(window.innerWidth / door.width, window.innerHeight / door.height) * 1.6;
      scene.style.setProperty("--origin-x", `${cx - box.left}px`);
      scene.style.setProperty("--origin-y", `${cy - box.top}px`);
      scene.style.setProperty("--shift-x", `${window.innerWidth / 2 - cx}px`);
      scene.style.setProperty("--shift-y", `${window.innerHeight / 2 - cy}px`);
      scene.style.setProperty("--zoom", String(scale));
    }
    setStage("going");
    // Under the full flash the world's own entry starts; then the light fades off it.
    window.setTimeout(() => {
      // The page goes at once, under the full light: the world shows through as the light fades.
      // The door's mode (data-entry) also keeps the world's controls away until its map is closed (WorldLayer).
      document.documentElement.dataset.entry = "door";
      enterWorld({ fromTop: true });
      setStage("fading");
      window.setTimeout(() => setStage("hidden"), TIMING.fade);
    }, TIMING.enterAt);
  }, [ready, stage]);

  const classic = useCallback(() => {
    setNoteOpen(false);
    setStage("hidden");
    // The classic page at the same address, without the prototype's parameter.
    const url = new URL(window.location.href);
    url.searchParams.delete(ENTRY_PARAM);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  useEffect(() => {
    if (!noteOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNoteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [noteOpen]);

  if (stage === "hidden") return null;
  const doorState = stage !== "door" ? "open" : ready ? "ready" : "loading";
  const path = typeof window === "undefined" ? "/" : splitLocale(window.location.pathname).path;

  return (
    <div className={styles.screen} data-stage={stage} role="dialog" aria-modal="true" aria-label={text.dialog}>
      <nav className={styles.languages} aria-label={messages(locale).language.label}>
        {LOCALES.map((candidate) => (
          <a key={candidate} href={`${localizePath(path, candidate)}?${ENTRY_PARAM}=${ENTRY_VALUE}`} hrefLang={candidate} lang={candidate} aria-current={candidate === locale ? "page" : undefined}>
            {candidate.toUpperCase()}
          </a>
        ))}
      </nav>

      <div className={styles.stage}>
        <div ref={sceneRef} className={styles.scene} data-door={doorState} style={{ "--progress": percent / 100 } as React.CSSProperties}>
          <p className={styles.plate}>
            <strong>{content.owner.name}</strong>
            <span>{content.owner.role}</span>
          </p>
          <div ref={doorwayRef} className={styles.doorway}>
            <span className={styles.light} aria-hidden="true" />
            <button
              ref={doorRef}
              type="button"
              className={styles.enter}
              aria-label={ready ? text.enter : held ? messages(locale).door.load : messages(locale).door.loading}
              aria-disabled={!ready && !held}
              onClick={() => (ready ? go() : held ? loadWorld() : undefined)}
            />
            {/* The leaf carries the note, so it swings with the door. */}
            <div className={styles.leaf}>
              <span className={styles.panelTop} aria-hidden="true" />
              <span className={styles.panelBottom} aria-hidden="true" />
              <span className={styles.knob} aria-hidden="true" />
              <button type="button" className={styles.note} aria-label={text.noteLabel} onClick={() => setNoteOpen(true)}>
                <span aria-hidden="true">{text.note}</span>
              </button>
            </div>
          </div>
          <span className={styles.floor} aria-hidden="true" />
        </div>
      </div>

      <p className={styles.status} role="status">{ready ? text.ready : held ? messages(locale).door.load : text.loading(percent)}</p>
      <button type="button" className={styles.classic} onClick={classic}>{text.classic}</button>

      <span className={styles.flash} aria-hidden="true" />

      {noteOpen ? (
        <div className={styles.backdrop} onClick={(event) => event.target === event.currentTarget && setNoteOpen(false)}>
          <div ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="entry-note-title">
            <h2 id="entry-note-title" tabIndex={-1}>{text.greeting(content.owner.name)}</h2>
            <p className={styles.role}>{content.owner.role}</p>
            <p>{text.about}</p>
            <p className={styles.panelActions}>
              <a className={styles.primary} href={CV_PATH} download>{text.download}</a>
              <button type="button" className={styles.secondary} onClick={classic}>{text.classicButton}</button>
            </p>
            {contact ? (
              <section aria-label={text.contact}>
                <h3>{text.contact}</h3>
                <ul className={styles.contactList}>
                  {contact.kind === "contact" ? <li><a href={`mailto:${contact.email}`}>{contact.email}</a></li> : null}
                  {contact.links?.map((link) => <li key={link.url}><a href={link.url} target="_blank" rel="noreferrer">{link.label}</a></li>)}
                </ul>
              </section>
            ) : null}
            <button type="button" className={styles.close} onClick={() => setNoteOpen(false)}>{text.close}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
