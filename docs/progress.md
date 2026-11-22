# Postęp

Krótka lista do odhaczania. Szczegóły każdego punktu (zakres, kryterium „gotowe”, decyzje) są w `docs/roadmap.md` pod tym samym numerem.
Po odhaczeniu popraw licznik przy kroku i w podsumowaniu.

**Faza 1:** 27 / 48 (56%) `███████████░░░░░░░░░`

| Część | Zrobione |
|---|---|
| Baza produktu (B0-B9) | 27 / 37 |
| Gotowe dla rekruterów (J1-J5) | 0 / 11 |

---

## Faza 1, część pierwsza: baza produktu

**B0. Porządki** 1/1
- [x] Serwer 3301, kopia `orig`, repo na `main`, stare gałęzie (2026-11-22)

**B1. Szkielet strony** 7/7
- [x] Układ: wariant D, telefon z portretem w treści (2026-11-22)
- [x] Dwa języki: PL i EN, przełącznik, adresy, `hreflang` (2026-11-22)
- [x] Sekcje z treścią zastępczą (2026-11-22)
- [x] Pobieranie CV (zastępczy PDF) (2026-11-22)
- [x] Miejsce na portret i drzwi (statyczne) (2026-11-22)
- [x] Responsywność, dzień i noc (2026-11-22)
- [x] Lighthouse (komputer ≥ 95, telefon ≥ 95 poza wydajnością ≥ 75), działa bez JS i WebGL (2026-11-22)

**B2. Postać testowa** 3/3
- [x] Wymagania modelu spisane, kandydaci porównani w `docs/characters.md` (2026-11-22)
- [x] Wybór: Quaternius, strój Peasant z głową Superhero (2026-11-22)
- [x] Model w `pnpm assets` (`guide`, 882 KB, 18,8 tys. trójkątów, 13 klipów) (2026-11-22)

**B3. Portret** 4/4
- [x] Decyzja techniczna: osobna scena w ramce (2026-11-22)
- [x] Najpierw statyczny obraz, potem żywa postać (2026-11-22)
- [x] Głowa i oczy za kursorem, bezczynność, telefon (2026-11-22)
- [x] Bez straty na wydajności i Lighthouse (2026-11-22)

**B4. Ekran wejściowy z drzwiami** 6/6
- [x] Decyzja: ekran z drzwiami jako loaderem (prototyp `?entry=door`) (2026-11-22)
- [x] Postęp ładowania na drzwiach (2026-11-22)
- [x] Uchylenie i światło, gdy świat gotowy (2026-11-22)
- [x] Kartka „CV” z panelem, tabliczka, PL | EN (2026-11-22)
- [x] Drzwi zamiast platformy z kryształem
- [x] Ekran domyślnie na `/` (telefon i brak WebGL: wersja klasyczna, linki omijają, wybór zapamiętany) (2026-11-22)

**B5. Przejście i mapa świata** 4/4
- [x] Kamera w drzwi, światło, świat od najwyższego punktu (2026-11-22)
- [x] Świat bez kontrolek, potem mapa świata na pełnym ekranie (2026-11-22)
- [x] Wyjście ze świata: powrót na ekran z drzwiami (2026-11-22)
- [x] Budżety perf dla wejścia przez drzwi, pełne testy, cięcie przy ograniczonym ruchu (2026-11-22, zamknięte decyzją bez ponownego pomiaru)

**B6. Przewodnik w świecie** 2/4
- [x] Idzie za kamerą, zostaje w kadrze; stoi na dokładnej wysokości gruntu (2026-11-22)
- [x] Za lotem do strefy: pojawia się na miejscu i macha (2026-11-22)
- [ ] Animacje bezczynności i reakcje
- [ ] Omijanie przeszkód (węzły nawigacji)

**B7. Świat bazowy** 0/3
- [ ] Strefy zgodne z sekcjami (Ty)
- [ ] Drzwi w świecie i ścieżki
- [ ] Obiekty zastępcze w strefach (Ty)

**B8. Domknięcie bazy** 0/4
- [ ] Budżety `pnpm perf` dla nowych elementów
- [ ] Testy e2e całej ścieżki
- [ ] Test na telefonie (Ty)
- [ ] Lighthouse na produkcji

**B9. Research urządzeń** 0/1
- [ ] Najsłabszy telefon, waga świata, progi jakości

## Faza 1, część druga: gotowe dla rekruterów

**J1. Treść** 0/4
- [ ] Struktura treści w dwóch językach
- [ ] Teksty po angielsku (Ty)
- [ ] Teksty po polsku (Ty)
- [ ] Obrazy projektów

**J2. CV** 0/1
- [ ] CV w PDF podpięte (Ty)

**J3. Kontakt** 0/1
- [ ] Formularz na Supabase (spam, RODO, powiadomienie)

**J4. Studium przypadku** 0/1
- [ ] Strona „jak to zbudowałem”

**J5. Widoczność** 0/4
- [ ] SEO w obu językach, sitemap, robots, favicon
- [ ] Podglądy linków (Open Graph)
- [ ] Lighthouse ≥ 95 na produkcji
- [ ] Własna domena (Ty)

---

## Faza 2: rozgłos (po znalezieniu pracy)

Zakres do rozpisania później (`roadmap.md`, faza 2).

- [ ] Świat i storytelling
- [ ] Wygląd: styl strony i UI, docelowe modele, przewodnik podobny do mnie
- [ ] Rozgrywka: znajdźki, ekwipunek, wnętrza, mini-gry, mini-misje
- [ ] Edytor: panel nocy, ujęcia stref, minimapa po zapisie, granice stref
- [ ] Księga gości (Supabase)
- [ ] Przewodnik mówi: dymki, głos
- [ ] Dźwięk, analityka
