import Link from "next/link";
import ContentArticle from "@/components/content/ContentArticle";
import SectionArticle from "@/components/content/SectionArticle";
import PortfolioMap from "@/components/content/PortfolioMap";
import ThemeToggle from "./ThemeToggle";
import Door from "./Door";
import Portrait from "./Portrait";
import LanguageSwitch from "./LanguageSwitch";
import LanguagePrompt from "./LanguagePrompt";
import PhoneMenu from "./PhoneMenu";
import type { MinimapData } from "@/lib/minimap/minimap";
import { readMinimapData } from "@/lib/minimap/minimap-store";
import { readMapIndex } from "@/lib/maps/map-store";
import { portfolioContent } from "@/content/localized";
import { localizePath, type Locale } from "@/lib/i18n/locale";
import { messages } from "@/lib/i18n/messages";
import { CONTENT_SECTIONS, getContentPath, listContentByKind, type ContentItem, type ContentSection } from "@/lib/content/content";
import { getSectionPath } from "@/lib/content/places";
import styles from "./LandingPage.module.css";

/** The placeholder CV until J2 brings the real one. */
export const CV_PATH = "/cv/michal-stepien-cv.pdf";

/**
 * The complete portfolio as ordinary, server-rendered HTML. It is useful on
 * its own: no JavaScript, WebGL or waiting is needed to read it. The 3D world
 * loads behind it and is offered once it is ready, through the door.
 *
 * Layout (docs/roadmap.md, B1, variant D): content in a column with the
 * navigation in a bar above it, and a narrow pinned sidebar on the right with
 * the portrait at the top and the door at the bottom. On phones the portrait
 * sits at the top of the content and scrolls with it; the door is pinned in a
 * bar at the bottom, with room kept for it so it covers nothing.
 *
 * On an item's or a section's own URL that item or section is shown first,
 * as the page's main heading, followed by the rest of the portfolio.
 *
 * Every word comes in the page's language: the interface from lib/i18n, the
 * portfolio's copy from content/ (one file per language).
 */
export default function LandingPage({ locale, featured, featuredSection, minimap }: { locale: Locale; featured?: ContentItem; featuredSection?: ContentSection; minimap?: MinimapData | null }) {
  const content = portfolioContent(locale);
  const text = messages(locale);
  const { owner } = content;
  const home = localizePath("/", locale);
  const href = (path: string) => localizePath(path, locale);
  // The default map's, unless a page names another (a map preview). Read at build time.
  const map = minimap === undefined ? readMinimapData(readMapIndex().defaultMapId) : minimap;
  const inner = featured !== undefined || featuredSection !== undefined;
  const sectionLinks = CONTENT_SECTIONS.map((section) => ({ href: `${inner ? home : ""}#${section.segment}`, text: text.sections[section.kind] }));

  return (
    <div id="landing" className={styles.page}>
      <a className={styles.skip} href="#content">{text.page.skip}</a>

      <div className={styles.column}>
        <header className={styles.bar}>
          <p className={styles.brand}><Link href={home}>{owner.name}</Link></p>
          <nav aria-label={text.page.sectionsNav} className={styles.navWrap}>
            <ul className={styles.nav}>
              {sectionLinks.map((link) => <li key={link.href}><a href={link.href}>{link.text}</a></li>)}
            </ul>
          </nav>
          <span className={styles.wideOnly}><LanguageSwitch /></span>
          <ThemeToggle />
          <PhoneMenu label={text.page.menu} navLabel={text.page.sectionsNav} links={sectionLinks} />
        </header>

      <main id="content" className={styles.main}>
        <Portrait placement="inline" />
        <section className={styles.hero} aria-label={text.page.introduction}>
          {inner ? <p className={styles.heroName}>{owner.name}</p> : <h1 className={styles.heroName}>{owner.name}</h1>}
          <p className={styles.role}>{owner.role}</p>
          {inner ? null : <p className={styles.tagline}>{owner.tagline}</p>}
          <p className={styles.actions}>
            <a className={styles.primary} href={CV_PATH} download>{text.page.downloadCv}</a>
            <a className={styles.secondary} href={`${inner ? home : ""}#contact`}>{text.page.contact}</a>
          </p>
        </section>

        {featured ? (
          <section className={styles.featured} aria-label={featured.title}>
            <ContentArticle item={featured} locale={locale} headingLevel={1} />
          </section>
        ) : null}
        {featuredSection ? (
          <section className={styles.featured} aria-label={text.sections[featuredSection.kind]}>
            <SectionArticle section={featuredSection} locale={locale} items={listContentByKind(content, featuredSection.kind)} headingLevel={1} />
          </section>
        ) : null}

        {map ? (
          <section id="map" className={styles.section} aria-labelledby="map-heading">
            <h2 id="map-heading" className={styles.sectionTitle}>{text.page.map}</h2>
            <p className={styles.mapIntro}>{text.page.mapIntro}</p>
            <PortfolioMap data={map} locale={locale} label={text.page.mapLabel} current={featuredSection ? map.zones.find((zone) => zone.contentReference?.contentType === featuredSection.kind)?.id : null} />
          </section>
        ) : null}

        {CONTENT_SECTIONS.map((section) => {
          const items = listContentByKind(content, section.kind);
          if (items.length === 0) return null;
          return (
            <section key={section.kind} id={section.segment} className={styles.section} aria-labelledby={`${section.segment}-heading`}>
              <h2 id={`${section.segment}-heading`} className={styles.sectionTitle}>
                {section.singleton ? text.sections[section.kind] : <Link href={href(getSectionPath(section))}>{text.sections[section.kind]}</Link>}
              </h2>
              <ul className={section.singleton ? styles.single : styles.grid}>
                {items.map((item) => (
                  <li key={item.id} className={styles.card}>
                    <h3 className={styles.cardTitle}>
                      <Link href={href(getContentPath(item))}>{item.title}</Link>
                    </h3>
                    <p className={styles.cardSummary}>{item.summary}</p>
                    {item.tags && item.tags.length > 0 ? (
                      <ul className={styles.tags} aria-label={text.page.technologies}>
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

      <aside className={styles.sidebar} data-door-bar aria-label={text.page.sidebar}>
        <div className={styles.sidebarTop}>
          <Portrait placement="sidebar" />
          <p className={styles.sidebarName}>{owner.name}</p>
          <p className={styles.sidebarRole}>{owner.role}</p>
        </div>
        <Door />
      </aside>

      <LanguagePrompt />
    </div>
  );
}
