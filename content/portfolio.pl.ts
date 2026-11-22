import type { PortfolioContent } from "@/lib/content/content";

/**
 * The Polish version of content/portfolio.ts. Same items, in the same order,
 * with the same `kind`, `id` and `slug` (maps and URLs use them, so they are
 * not translated); only the copy differs. A test checks that the two match.
 *
 * Everything below is placeholder text, like the English file.
 */
export const PORTFOLIO_CONTENT_PL: PortfolioContent = {
  owner: {
    name: "Michał Stępień",
    role: "Web developer",
    tagline: "Zastępcze hasło: interfejsy, narzędzia i zabawne 3D w przeglądarce.",
  },
  items: [
    {
      kind: "about",
      id: "about",
      slug: "about",
      title: "O mnie",
      summary: "Zastępcze krótkie przedstawienie.",
      body: [
        "Zastępcza dłuższa biografia. Ta treść celowo nie jest ostateczna.",
        "Zastępczy opis obecnych zainteresowań.",
        "Zastępczy opis sposobu pracy.",
      ],
    },
    {
      kind: "project",
      id: "project-placeholder-1",
      slug: "project-placeholder-one",
      title: "Projekt zastępczy pierwszy",
      summary: "Miejsce na przyszły wyróżniony projekt.",
      body: ["To celowo zastępczy tekst. Zastąp go prawdziwym opisem projektu, gdy treść portfolio będzie gotowa."],
      tags: ["React", "TypeScript", "Three.js"],
      role: "Zastępcza rola",
      featured: true,
      links: [
        { label: "Strona", url: "https://example.com" },
        { label: "Repozytorium", url: "https://github.com/placeholder/project-one" },
      ],
    },
    {
      kind: "project",
      id: "project-placeholder-2",
      slug: "project-placeholder-two",
      title: "Projekt zastępczy drugi",
      summary: "Zastępczy projekt poboczny.",
      body: ["Zastępcza treść do sprawdzenia powiązania obiektu z treścią."],
      tags: ["Next.js", "Testy"],
      featured: false,
    },
    {
      kind: "project",
      id: "project-placeholder-3",
      slug: "project-placeholder-three",
      title: "Projekt zastępczy trzeci",
      summary: "Zastępczy projekt poboczny.",
      body: ["Zastępcza treść do sprawdzenia powtarzających się obiektów projektów."],
      tags: ["Wydajność", "WebGL"],
      featured: false,
    },
    {
      kind: "experience",
      id: "experience-placeholder-1",
      slug: "company-placeholder",
      title: "Zastępcze stanowisko",
      summary: "Zastępczy wpis o doświadczeniu. Później zastąp go prawdziwymi informacjami.",
      body: ["Zastępcze osiągnięcie."],
      tags: ["TypeScript"],
      company: "Zastępcza firma",
      dateRange: "Zastępczy okres",
    },
    { kind: "skillGroup", id: "frontend", slug: "frontend", title: "Frontend", summary: "Interfejsy i architektura po stronie klienta.", body: [], tags: ["React", "Next.js", "TypeScript"] },
    { kind: "skillGroup", id: "backend", slug: "backend", title: "Backend", summary: "API i dane.", body: [], tags: ["Projektowanie API", "Modelowanie danych"] },
    { kind: "skillGroup", id: "testing", slug: "testing", title: "Testy", summary: "Automatyczne sprawdzanie na każdym poziomie.", body: [], tags: ["Vitest", "Playwright"] },
    { kind: "skillGroup", id: "tooling", slug: "tooling", title: "Narzędzia", summary: "Warsztat programisty.", body: [], tags: ["pnpm", "ESLint"] },
    { kind: "skillGroup", id: "design-3d", slug: "design-and-3d", title: "Projektowanie i 3D", summary: "Grafika czasu rzeczywistego w przeglądarce.", body: [], tags: ["Three.js", "WebGL"] },
    {
      kind: "contact",
      id: "contact",
      slug: "contact",
      title: "Kontakt",
      summary: "Zastępcza informacja o dostępności.",
      body: [],
      email: "email-placeholder@example.com",
      links: [
        { label: "GitHub", url: "https://github.com/placeholder" },
        { label: "LinkedIn", url: "https://www.linkedin.com/in/placeholder" },
      ],
    },
  ],
};
