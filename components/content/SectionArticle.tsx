import Link from "next/link";
import { getContentPath, type ContentItem, type ContentSection } from "@/lib/content/content";
import { localizePath, type Locale } from "@/lib/i18n/locale";
import { messages } from "@/lib/i18n/messages";
import styles from "./ContentArticle.module.css";

/**
 * A section of the portfolio (Projects, Experience...): its items as a list
 * of links to their own pages. Pure markup, like ContentArticle: the landing
 * page renders it on the server at the section's URL, and the world shows it
 * in its panel when the camera flies to the section's zone.
 */
export default function SectionArticle({ section, locale, items, headingId, headingLevel = 2, onOpen }: {
  section: ContentSection;
  locale: Locale;
  items: ContentItem[];
  headingId?: string;
  headingLevel?: 1 | 2;
  /** In the world: opens an item without leaving it. Plain links otherwise. */
  onOpen?: (event: React.MouseEvent<HTMLAnchorElement>, item: ContentItem) => void;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const ItemHeading = headingLevel === 1 ? "h2" : "h3";
  const text = messages(locale);
  return (
    <article className={styles.article}>
      <header>
        <Heading id={headingId} className={styles.title} tabIndex={-1}>{text.sections[section.kind]}</Heading>
        <p className={styles.meta}>{text.page.items(items.length)}</p>
      </header>
      <ul className={styles.items}>
        {items.map((item) => (
          <li key={item.id}>
            <ItemHeading className={styles.itemTitle}>
              <Link href={localizePath(getContentPath(item), locale)} onClick={onOpen ? (event) => onOpen(event, item) : undefined}>{item.title}</Link>
            </ItemHeading>
            <p className={styles.itemSummary}>{item.summary}</p>
            {item.tags && item.tags.length > 0 ? (
              <ul className={styles.tags} aria-label={text.page.technologies}>
                {item.tags.map((tag) => <li key={tag}>{tag}</li>)}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}
