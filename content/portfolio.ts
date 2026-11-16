import type { PortfolioContent } from "@/lib/content/content";

/**
 * All portfolio copy lives here. It feeds the landing page, the per-item pages
 * and the in-world panels. Maps never embed copy: map objects and zones only
 * reference entries by `{ contentType, contentId }`.
 *
 * Everything below is placeholder text. Replace it freely; keep `id` stable
 * once a map references it, and keep `slug` stable once a URL is public.
 */
export const PORTFOLIO_CONTENT: PortfolioContent = {
  owner: {
    name: "Michał Stępień",
    role: "Web developer",
    tagline: "Placeholder tagline: interfaces, tools and playful 3D on the web.",
  },
  items: [
    {
      kind: "about",
      id: "about",
      slug: "about",
      title: "About",
      summary: "Short introduction placeholder.",
      body: [
        "Longer biography placeholder. This content is intentionally not final.",
        "Current focus placeholder.",
        "Working approach placeholder.",
      ],
    },
    {
      kind: "project",
      id: "project-placeholder-1",
      slug: "project-placeholder-one",
      title: "Project Placeholder One",
      summary: "Placeholder for a future featured project.",
      body: ["This is intentionally placeholder copy. Replace it with real project details when portfolio content is finalized."],
      tags: ["React", "TypeScript", "Three.js"],
      role: "Role placeholder",
      featured: true,
      links: [
        { label: "Live site", url: "https://example.com" },
        { label: "Repository", url: "https://github.com/placeholder/project-one" },
      ],
    },
    {
      kind: "project",
      id: "project-placeholder-2",
      slug: "project-placeholder-two",
      title: "Project Placeholder Two",
      summary: "Secondary project placeholder.",
      body: ["Placeholder content used to validate object-to-content binding."],
      tags: ["Next.js", "Testing"],
      featured: false,
    },
    {
      kind: "project",
      id: "project-placeholder-3",
      slug: "project-placeholder-three",
      title: "Project Placeholder Three",
      summary: "Secondary project placeholder.",
      body: ["Placeholder content used to validate repeated project objects."],
      tags: ["Performance", "WebGL"],
      featured: false,
    },
    {
      kind: "experience",
      id: "experience-placeholder-1",
      slug: "company-placeholder",
      title: "Role Placeholder",
      summary: "Placeholder experience entry. Replace with real professional information later.",
      body: ["Placeholder achievement."],
      tags: ["TypeScript"],
      company: "Company Placeholder",
      dateRange: "Date range placeholder",
    },
    { kind: "skillGroup", id: "frontend", slug: "frontend", title: "Frontend", summary: "Interfaces and client-side architecture.", body: [], tags: ["React", "Next.js", "TypeScript"] },
    { kind: "skillGroup", id: "backend", slug: "backend", title: "Backend", summary: "APIs and data.", body: [], tags: ["API design", "Data modeling"] },
    { kind: "skillGroup", id: "testing", slug: "testing", title: "Testing", summary: "Automated checks at every level.", body: [], tags: ["Vitest", "Playwright"] },
    { kind: "skillGroup", id: "tooling", slug: "tooling", title: "Tooling", summary: "Developer workflow.", body: [], tags: ["pnpm", "ESLint"] },
    { kind: "skillGroup", id: "design-3d", slug: "design-and-3d", title: "Design and 3D", summary: "Real-time graphics on the web.", body: [], tags: ["Three.js", "WebGL"] },
    {
      kind: "contact",
      id: "contact",
      slug: "contact",
      title: "Contact",
      summary: "Availability placeholder.",
      body: [],
      email: "email-placeholder@example.com",
      links: [
        { label: "GitHub", url: "https://github.com/placeholder" },
        { label: "LinkedIn", url: "https://www.linkedin.com/in/placeholder" },
      ],
    },
  ],
};
