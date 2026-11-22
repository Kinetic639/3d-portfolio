import styles from "./Portrait.module.css";

/**
 * The portrait (a placeholder drawing until B3 puts the living guide in it).
 * On wide screens it hangs at the top of the right sidebar; on phones at the
 * top of the content, scrolling with it. Decorative: the name next to it says
 * who it is.
 */
export default function Portrait({ placement }: { placement: "sidebar" | "inline" }) {
  return (
    <figure className={styles.portrait} data-placement={placement} aria-hidden="true">
      <span className={styles.canvas}>
        <svg viewBox="0 0 100 120" className={styles.figure}>
          <circle cx="50" cy="44" r="18" />
          <path d="M18 120c2-26 16-40 32-40s30 14 32 40z" />
        </svg>
      </span>
    </figure>
  );
}
