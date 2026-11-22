# Postęp

Krótka lista do odhaczania. Szczegóły każdego punktu (zakres, kryterium „gotowe”, decyzje) są w `docs/roadmap.md` pod tym samym numerem.
Po odhaczeniu popraw licznik przy kroku i w podsumowaniu.

**Faza 1:** 6 / 46 (13%) `███░░░░░░░░░░░░░░░░░`

| Część | Zrobione |
|---|---|
| Baza produktu (B0-B9) | 6 / 35 |
| Gotowe dla rekruterów (J1-J5) | 0 / 11 |

---

## Faza 1, część pierwsza: baza produktu

**B0. Porządki** 1/1
- [x] Serwer 3301, kopia `orig`, repo na `main`, stare gałęzie (2026-11-22)

**B1. Szkielet strony** 5/7
- [x] Układ: wariant D, telefon z portretem w treści (2026-11-22)
- [ ] Dwa języki: PL i EN, przełącznik, adresy, `hreflang`
- [x] Sekcje z treścią zastępczą (2026-11-22)
- [x] Pobieranie CV (zastępczy PDF) (2026-11-22)
- [x] Miejsce na portret i drzwi (statyczne) (2026-11-22)
- [x] Responsywność, dzień i noc (2026-11-22)
- [ ] Lighthouse ≥ 95, działa bez JS i WebGL

**B2. Postać testowa** 0/3
- [ ] Wymagania modelu spisane
- [ ] Porównanie kandydatów i wybór
- [ ] Model w `pnpm assets`

**B3. Portret** 0/4
- [ ] Decyzja techniczna (osobna scena czy kanwas świata)
- [ ] Najpierw statyczny obraz, potem żywa postać
- [ ] Głowa i oczy za kursorem, bezczynność, telefon
- [ ] Bez straty na wydajności i Lighthouse

**B4. Drzwi i ładowanie** 0/4
- [ ] Decyzja: grafika czy 3D, szkic
- [ ] Postęp ładowania na drzwiach
- [ ] Uchylenie i światło, gdy świat gotowy
- [ ] Drzwi zamiast platformy z kryształem

**B5. Przejście** 0/4
- [ ] Postać wychodzi z portretu i przechodzi przez drzwi
- [ ] Kamera przez drzwi, wejście do świata
- [ ] Powrót: postać wraca do portretu
- [ ] Płynnie, na telefonie, cięcie przy ograniczonym ruchu

**B6. Przewodnik w świecie** 0/4
- [ ] Idzie za kamerą, zostaje w kadrze
- [ ] Za lotem do strefy, daleki skok z animacją
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
