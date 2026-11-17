import Link from "next/link";
import ContentArticle from "@/components/content/ContentArticle";
import SectionArticle from "@/components/content/SectionArticle";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { CONTENT_SECTIONS, getContentPath, listContentByKind, type ContentItem, type ContentSection } from "@/lib/content/content";
import { getSectionPath } from "@/lib/content/places";
import styles from "./LandingPage.module.css";

/**
 * The complete portfolio as ordinary, server-rendered HTML. It is useful on
 * its own: no JavaScript, WebGL or waiting is needed to read it. The 3D world
 * loads behind it and is offered once it is ready.
 *
 * On an item's or a section's own URL that item or section is shown first,
 * as the page's main heading, followed by the rest of the portfolio.
 */
export default function LandingPage({ featured, featuredSection }: { featured?: ContentItem; featuredSection?: ContentSection }) {
  const { owner } = PORTFOLIO_CONTENT;
  const inner = featured !== undefined || featuredSection !== undefined;

  return (
    <div id="landing" className={styles.page}>
      <a className={styles.skip} href="#content">Skip to content</a>

      <header className={styles.header}>
        {inner ? (
          <p className={styles.brand}><Link href="/">{owner.name}</Link></p>
        ) : (
          <h1 className={styles.name}>{owner.name}</h1>
        )}
        <p className={styles.role}>{owner.role}</p>
        {inner ? null : <p className={styles.tagline}>{owner.tagline}</p>}
        <nav aria-label="Sections">
          <ul className={styles.nav}>
            {CONTENT_SECTIONS.map((section) => (
              <li key={section.kind}><a href={`${inner ? "/" : ""}#${section.segment}`}>{section.label}</a></li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="content" className={styles.main}>
        {featured ? (
          <section className={styles.featured} aria-label={featured.title}>
            <ContentArticle item={featured} headingLevel={1} />
          </section>
        ) : null}
        {featuredSection ? (
          <section className={styles.featured} aria-label={featuredSection.label}>
            <SectionArticle section={featuredSection} items={listContentByKind(PORTFOLIO_CONTENT, featuredSection.kind)} headingLevel={1} />
          </section>
        ) : null}

        {CONTENT_SECTIONS.map((section) => {
          const items = listContentByKind(PORTFOLIO_CONTENT, section.kind);
          if (items.length === 0) return null;
          return (
            <section key={section.kind} id={section.segment} className={styles.section} aria-labelledby={`${section.segment}-heading`}>
              <h2 id={`${section.segment}-heading`} className={styles.sectionTitle}>
                {section.singleton ? section.label : <Link href={getSectionPath(section)}>{section.label}</Link>}
              </h2>
              <ul className={section.singleton ? styles.single : styles.grid}>
                {items.map((item) => (
                  <li key={item.id} className={styles.card}>
                    <h3 className={styles.cardTitle}>
                      <Link href={getContentPath(item)}>{item.title}</Link>
                    </h3>
                    <p className={styles.cardSummary}>{item.summary}</p>
                    {item.tags && item.tags.length > 0 ? (
                      <ul className={styles.tags} aria-label="Technologies">
                        {item.tags.map((tag) => <li key={tag}>{tag}</li>)}
                      </ul>
                    ) : null}
                    {item.kind === "contact" ? <p className={styles.cardSummary}><a href={`mailto:${item.email}`}>{item.email}</a></p> : null}
                    {item.kind === "experience" ? <p className={styles.cardMeta}>{item.company} · {item.dateRange}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </main>

      <footer className={styles.footer}>
        <p>{owner.name}</p>
      </footer>
    </div>
  );
}
