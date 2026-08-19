import type { MapContentType } from "@/lib/maps/map-definition";

export type MapLocationReference = {
  mapId: string;
  zoneId?: string;
  markerId?: string;
  spawnId?: string;
};

export type ProjectEntry = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  technologies: string[];
  role?: string;
  responsibilities?: string[];
  screenshots?: string[];
  liveUrl?: string;
  repositoryUrl?: string;
  featured: boolean;
  mapLocation: MapLocationReference;
};

export type ExperienceEntry = {
  id: string;
  company: string;
  position: string;
  dateRange: string;
  description: string;
  achievements?: string[];
  technologies?: string[];
  mapLocation: MapLocationReference;
};

export type AboutContent = {
  id: string;
  shortIntroduction: string;
  biography: string;
  currentFocus: string;
  workingApproach: string;
  image?: string;
  mapLocation: MapLocationReference;
};

export type SkillGroup = {
  id: string;
  label: string;
  skills: string[];
  mapLocation: MapLocationReference;
};

export type ContactContent = {
  id: string;
  email: string;
  github?: string;
  linkedIn?: string;
  externalProfiles?: Array<{ label: string; url: string }>;
  availability?: string;
  mapLocation: MapLocationReference;
};

export type PortfolioContent = {
  projects: ProjectEntry[];
  experience: ExperienceEntry[];
  about: AboutContent;
  skills: SkillGroup[];
  contact: ContactContent;
};

export const PORTFOLIO_CONTENT: PortfolioContent = {
  projects: [
    {
      id: "project-placeholder-1",
      slug: "project-placeholder-one",
      title: "Project Placeholder One",
      shortDescription: "Placeholder for a future featured project.",
      longDescription: "This is intentionally placeholder copy. Replace it with real project details when portfolio content is finalized.",
      technologies: ["React", "TypeScript", "Three.js"],
      featured: true,
      mapLocation: { mapId: "portfolio-phase4", zoneId: "projects", markerId: "projects-primary" },
    },
    {
      id: "project-placeholder-2",
      slug: "project-placeholder-two",
      title: "Project Placeholder Two",
      shortDescription: "Secondary project placeholder.",
      longDescription: "Placeholder content used to validate marker-to-content binding.",
      technologies: ["Next.js", "Testing"],
      featured: false,
      mapLocation: { mapId: "portfolio-phase4", zoneId: "projects", markerId: "project-secondary-a" },
    },
    {
      id: "project-placeholder-3",
      slug: "project-placeholder-three",
      title: "Project Placeholder Three",
      shortDescription: "Secondary project placeholder.",
      longDescription: "Placeholder content used to validate repeated project markers.",
      technologies: ["Performance", "WebGL"],
      featured: false,
      mapLocation: { mapId: "portfolio-phase4", zoneId: "projects", markerId: "project-secondary-b" },
    },
  ],
  experience: [{
    id: "experience-placeholder-1",
    company: "Company Placeholder",
    position: "Role Placeholder",
    dateRange: "Date range placeholder",
    description: "Placeholder experience entry. Replace with real professional information later.",
    achievements: ["Placeholder achievement"],
    technologies: ["TypeScript"],
    mapLocation: { mapId: "portfolio-phase4", zoneId: "experience", markerId: "experience-primary" },
  }],
  about: {
    id: "about-placeholder",
    shortIntroduction: "Short introduction placeholder.",
    biography: "Longer biography placeholder. This content is intentionally not final.",
    currentFocus: "Current focus placeholder.",
    workingApproach: "Working approach placeholder.",
    mapLocation: { mapId: "portfolio-phase4", zoneId: "about", markerId: "about-primary" },
  },
  skills: [
    {
      id: "frontend",
      label: "Frontend",
      skills: ["React", "Next.js", "TypeScript"],
      mapLocation: { mapId: "portfolio-phase4", zoneId: "skills", markerId: "skills-primary" },
    },
    {
      id: "backend",
      label: "Backend",
      skills: ["API design", "Data modeling"],
      mapLocation: { mapId: "portfolio-phase4", zoneId: "skills", markerId: "skills-primary" },
    },
    {
      id: "testing",
      label: "Testing",
      skills: ["Vitest", "Playwright"],
      mapLocation: { mapId: "portfolio-phase4", zoneId: "skills", markerId: "skills-primary" },
    },
    {
      id: "tooling",
      label: "Tooling",
      skills: ["pnpm", "ESLint"],
      mapLocation: { mapId: "portfolio-phase4", zoneId: "skills", markerId: "skills-primary" },
    },
    {
      id: "design-3d",
      label: "Design and 3D",
      skills: ["Three.js", "React Three Fiber"],
      mapLocation: { mapId: "portfolio-phase4", zoneId: "skills", markerId: "skills-primary" },
    },
  ],
  contact: {
    id: "contact-placeholder",
    email: "email-placeholder@example.com",
    github: "https://github.com/placeholder",
    linkedIn: "https://www.linkedin.com/in/placeholder",
    availability: "Availability placeholder.",
    mapLocation: { mapId: "portfolio-phase4", zoneId: "contact", markerId: "contact-primary" },
  },
};

export function resolveContentReference(type: MapContentType, id: string, content: PortfolioContent = PORTFOLIO_CONTENT) {
  switch (type) {
    case "project":
      return content.projects.find((project) => project.id === id) ?? null;
    case "about":
      return content.about.id === id ? content.about : null;
    case "experience":
      return content.experience.find((entry) => entry.id === id) ?? null;
    case "skillGroup":
      return content.skills.find((group) => group.id === id) ?? null;
    case "contact":
      return content.contact.id === id ? content.contact : null;
    default:
      return null;
  }
}
