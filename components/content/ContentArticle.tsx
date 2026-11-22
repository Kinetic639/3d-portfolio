import type { ContentItem } from "@/lib/content/content";
import type { Locale } from "@/lib/i18n/locale";
import { messages } from "@/lib/i18n/messages";
import styles from "./ContentArticle.module.css";

/**
 * Renders one portfolio item. Pure markup with no hooks, so the same component
 * serves the server-rendered pages and the in-world panel.
 *
 * To give a content kind its own layout, add a case to `renderMeta` or branch
 * on `item.kind` here.
 */
export default function ContentArticle({ item, locale, headingId, headingLevel = 2 }: {
  item: ContentItem;
  locale: Locale;
  headingId?: string;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const meta = renderMeta(item);

  return (
    <article className={styles.article}>
      <header>
        <Heading id={headingId} className={styles.title} tabIndex={-1}>{item.title}</Heading>
        {meta ? <p className={styles.meta}>{meta}</p> : null}
        <p className={styles.summary}>{item.summary}</p>
      </header>

      {item.body.map((paragraph, index) => (
        <p key={index} className={styles.paragraph}>{paragraph}</p>
      ))}

      {item.kind === "contact" ? (
        <p className={styles.paragraph}>
          <a href={`mailto:${item.email}`}>{item.email}</a>
        </p>
      ) : null}

      {item.tags && item.tags.length > 0 ? (
        <ul className={styles.tags} aria-label={messages(locale).page.technologies}>
          {item.tags.map((tag) => <li key={tag}>{tag}</li>)}
        </ul>
      ) : null}

      {item.links && item.links.length > 0 ? (
        <ul className={styles.links}>
          {item.links.map((link) => (
            <li key={link.url}>
              <a href={link.url} target="_blank" rel="noreferrer">{link.label}</a>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function renderMeta(item: ContentItem): string | null {
  switch (item.kind) {
    case "project":
      return item.role ?? null;
    case "experience":
      return `${item.company} · ${item.dateRange}`;
    default:
      return null;
  }
}
