import type { PortfolioContent } from "@/lib/content/content";
import type { Locale } from "@/lib/i18n/locale";
import { PORTFOLIO_CONTENT } from "./portfolio";
import { PORTFOLIO_CONTENT_PL } from "./portfolio.pl";

/** The portfolio's copy in each language. English (content/portfolio.ts) is the source the others follow. */
export const LOCALIZED_CONTENT: Record<Locale, PortfolioContent> = {
  en: PORTFOLIO_CONTENT,
  pl: PORTFOLIO_CONTENT_PL,
};

export function portfolioContent(locale: Locale): PortfolioContent {
  return LOCALIZED_CONTENT[locale];
}
