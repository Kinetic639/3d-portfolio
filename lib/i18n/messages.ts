import type { ContentKind } from "@/lib/content/content";
import type { Locale } from "./locale";

/**
 * Every word of the site's own interface, in each language. Portfolio copy
 * (titles, summaries, bodies) is not here: it lives in content/, one file per
 * language. Both languages are small enough to ship together to the client.
 */
const en = {
  meta: {
    title: "Michał Stępień - Portfolio",
    description: "Portfolio for Michał Stępień.",
  },
  sections: {
    about: "About",
    project: "Projects",
    experience: "Experience",
    skillGroup: "Skills",
    contact: "Contact",
  } satisfies Record<ContentKind, string>,
  page: {
    skip: "Skip to content",
    sectionsNav: "Sections",
    menu: "Menu",
    introduction: "Introduction",
    downloadCv: "Download CV",
    contact: "Contact",
    map: "Map",
    mapIntro: "Every zone of the 3D world is a section of this site. Choose one to read it here, or enter the world from its page to go there.",
    mapLabel: "Map of the portfolio",
    technologies: "Technologies",
    sidebar: "Portrait and the way into the 3D world",
    items: (count: number) => (count === 1 ? "1 item" : `${count} items`),
  },
  language: {
    label: "Language",
    // The first-visit question is asked in the language it offers (messages(target).language).
    question: "This site is also in English.",
    stay: "Stay in Polish",
    go: "English",
  },
  theme: {
    night: "Night theme",
    toDay: "Switch to day",
    toNight: "Switch to night",
  },
  door: {
    enter: "Enter the world",
    load: "Load the interactive world",
    loading: "The 3D world is loading",
    loadShort: "Load the world",
    progress: (percent: number) => `Loading ${percent}%`,
    ready: "The interactive 3D world is ready.",
  },
  world: {
    canvas: "Interactive 3D world. Drag or use arrow keys to move, scroll or use plus and minus to zoom. Use the menu to open content with the keyboard.",
    menu: "Menu",
    menuNav: "Portfolio sections",
    back: "Back to page",
    close: "Close",
    closeLabel: "Close and return to the world",
    youAreIn: "You are in",
    clickPlay: "Click to play",
    clickOpen: "Click to open",
    lock: "Lock camera angle",
    unlock: "Unlock camera angle",
    reset: "Reset view",
    map: "Map",
    hideMap: "Hide map",
    mapLabel: "Map of the world: go to a zone or open an item",
    actorStates: {
      idle: "waiting", walking: "walking", running: "running", "taking-off": "taking off", flying: "flying", landing: "landing", preview: "showing a move",
    } as Record<string, string>,
    sendHint: "Click the ground to send it there.",
    howItMoves: "How it moves",
    movements: { auto: "Auto", walk: "Walk", run: "Run", flight: "Fly" },
    follow: "Follow",
    following: "Following",
    letGo: "Let go",
    leave: "Leave",
    minigame: (title: string) => `${title} mini-game`,
  },
};

export type Messages = typeof en;

const pl: Messages = {
  meta: {
    title: "Michał Stępień - Portfolio",
    description: "Portfolio Michała Stępnia.",
  },
  sections: {
    about: "O mnie",
    project: "Projekty",
    experience: "Doświadczenie",
    skillGroup: "Umiejętności",
    contact: "Kontakt",
  },
  page: {
    skip: "Przejdź do treści",
    sectionsNav: "Sekcje",
    menu: "Menu",
    introduction: "Powitanie",
    downloadCv: "Pobierz CV",
    contact: "Kontakt",
    map: "Mapa",
    mapIntro: "Każda strefa świata 3D jest sekcją tej strony. Wybierz jedną, żeby przeczytać ją tutaj, albo wejdź do świata z jej strony, żeby się tam przenieść.",
    mapLabel: "Mapa portfolio",
    technologies: "Technologie",
    sidebar: "Portret i wejście do świata 3D",
    items: (count: number) => `${count} ${count === 1 ? "pozycja" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? "pozycje" : "pozycji"}`,
  },
  language: {
    label: "Język",
    question: "Ta strona jest też po polsku.",
    stay: "Zostań przy angielskim",
    go: "Polski",
  },
  theme: {
    night: "Motyw nocny",
    toDay: "Przełącz na dzień",
    toNight: "Przełącz na noc",
  },
  door: {
    enter: "Wejdź do świata",
    load: "Załaduj interaktywny świat",
    loading: "Świat 3D się ładuje",
    loadShort: "Załaduj świat",
    progress: (percent: number) => `Ładowanie ${percent}%`,
    ready: "Interaktywny świat 3D jest gotowy.",
  },
  world: {
    canvas: "Interaktywny świat 3D. Przeciągnij albo użyj strzałek, żeby się poruszać, przewiń albo użyj plusa i minusa, żeby przybliżyć. Menu otwiera treść z klawiatury.",
    menu: "Menu",
    menuNav: "Sekcje portfolio",
    back: "Wróć na stronę",
    close: "Zamknij",
    closeLabel: "Zamknij i wróć do świata",
    youAreIn: "Jesteś w strefie",
    clickPlay: "Kliknij, żeby zagrać",
    clickOpen: "Kliknij, żeby otworzyć",
    lock: "Zablokuj kąt kamery",
    unlock: "Odblokuj kąt kamery",
    reset: "Przywróć widok",
    map: "Mapa",
    hideMap: "Ukryj mapę",
    mapLabel: "Mapa świata: przejdź do strefy albo otwórz pozycję",
    actorStates: {
      idle: "czeka", walking: "idzie", running: "biegnie", "taking-off": "startuje", flying: "leci", landing: "ląduje", preview: "pokazuje ruch",
    },
    sendHint: "Kliknij ziemię, żeby tam poszedł.",
    howItMoves: "Jak się porusza",
    movements: { auto: "Auto", walk: "Chód", run: "Bieg", flight: "Lot" },
    follow: "Śledź",
    following: "Śledzę",
    letGo: "Puść",
    leave: "Wyjdź",
    minigame: (title: string) => `Mini-gra ${title}`,
  },
};

export const MESSAGES: Record<Locale, Messages> = { en, pl };

export function messages(locale: Locale): Messages {
  return MESSAGES[locale];
}
