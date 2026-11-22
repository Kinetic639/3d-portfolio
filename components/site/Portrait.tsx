import styles from "./Portrait.module.css";

/** The guide's portrait as a picture: the first thing shown, and all that is shown without WebGL or motion. */
export const PORTRAIT_POSTER = "/portrait/guide.webp";
const POSTER_SIZE = { width: 426, height: 532 };

/**
 * The portrait (docs/roadmap.md, B3): the guide from the waist up. On wide
 * screens it hangs at the top of the right sidebar; on phones at the top of
 * the content, scrolling with it.
 *
 * The page renders the frame and the poster (plain HTML, shown at once and
 * without JavaScript). The living guide is put into the slot by the world
 * layer (PortraitPortals): it shares the world's three.js, which a component
 * of the page would load a second copy of.
 *
 * Decorative: the name next to it says who it is.
 */
export default function Portrait({ placement }: { placement: "sidebar" | "inline" }) {
  return (
    <figure className={styles.portrait} data-placement={placement} aria-hidden="true">
      <span className={styles.canvas} data-portrait-slot={placement}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed image; next/image would add a request and a loader for nothing */}
        <img className={styles.poster} src={PORTRAIT_POSTER} alt="" width={POSTER_SIZE.width} height={POSTER_SIZE.height} decoding="async" fetchPriority={placement === "sidebar" ? "high" : "auto"} />
      </span>
    </figure>
  );
}
