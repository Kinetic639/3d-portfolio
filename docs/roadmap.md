# Roadmap

Plan prac wynikający z `docs/vision.md`, ze szczegółami każdego punktu. Krótka lista do odhaczania jest w `docs/progress.md`.
Szczegóły techniczne zrobionych rzeczy są w `docs/architecture.md`, a obsługa edytora w `docs/developer-guide.md`.

**Gdzie jesteśmy (2026-11-22):** jest baza techniczna i dowód, że strona może tak wyglądać i działać z wysoką wydajnością.

**Dwie fazy (vision.md, rozdział 1):**

- **Faza 1: strona, która pomaga znaleźć pracę zdalną.** Baza produktu (B0-B9), potem prawdziwa treść i kontakt (J1-J5). Kończy się, gdy strona jest gotowa do wysyłania rekruterom.
- **Faza 2: rozgłos.** Po znalezieniu pracy: wygląd, rozgrywka, szlif pod konkursy.

Legenda: **(Ty)** robisz Ty, **(Claude)** robię ja, **(razem)** potrzebna Twoja decyzja albo materiały, resztę robię ja.

---

## Już jest: fundament techniczny

Nie jest to „80% strony”, tylko silnik i mechanizmy, na których baza stanie.

- Silnik 3D rysujący tylko na żądanie, wypiekany świat, rozgrzewanie bez przycięć, testy wydajności z budżetami (`pnpm perf`).
- Edytor map: teren, strefy, obiekty, modele, scatter, wiatr, styl, światło, cienie, stworzenia (system aktorów: chodzenie, bieg, lot, podążanie kamery).
- Kamera z krzywą zoomu, strefy jako sekcje (URL, lot, nazwy, „You are in”), minimapa, mapa portfolio na stronie.
- Dzień i noc z przełącznikiem motywu.
- Strona: wszystkie sekcje jako zwykły HTML, ale w roboczym układzie, bez designu.
- Mini-gra kopalnia jako dowód mechaniki.

---

## Faza 1, część pierwsza: baza produktu

Cel: wersja gotowa do pokazania rekruterom, z treścią zastępczą, na wysokim poziomie wydajności.

### B0. Porządki **(Claude)**

- [x] Zatrzymać nieużywany serwer na porcie 3301, usunąć kopię `orig`, przełączyć lokalne repo na `main`, usunąć scalone gałęzie lokalne. (2026-11-22)

### B1. Szkielet strony (wireframe) **(razem)**

Nowy układ strony, od którego zależy reszta. Na razie bez stylizacji, ale z docelową strukturą.

- [x] Decyzja o układzie (2026-11-22): wariant D.
  - **Komputer:** wąski, przypięty sidebar po prawej (ok. 280 px). Na samej górze duży portret, pod nim imię i rola, na dole sidebara małe drzwi do świata. Treść w kolumnie po lewej, nawigacja, język i motyw w górnym pasku nad treścią.
  - **Telefon:** portret na górze treści, nad powitaniem, przewija się razem z treścią (nie jest przypięty). Drzwi w zarezerwowanym, przypiętym pasku na dole ekranu. W górnym pasku imię i menu.
  - Szkice wariantów A-D zostały w historii rozmowy, wybrany jest D z telefonem 2.
- [x] Dwa języki: polski i angielski, przełącznik i wybór przy pierwszej wizycie, treść w dwóch wersjach, `hreflang`. (2026-11-22)
  - **Adresy:** angielski zostaje pod gołymi ścieżkami (`/`, `/projects/...`), polski pod `/pl/...`, z tymi samymi segmentami. Bez przekierowań i bez proxy: każda strona jest statyczna, a `/` nie traci czasu na przekierowanie.
  - **Przełącznik:** EN | PL w górnym pasku (na telefonie w menu), zwykłe linki do tej samej strony w drugim języku, wybór jest zapamiętany.
  - **Pierwsza wizyta:** gdy przeglądarka prosi o drugi język, mała notka pyta o niego w tym języku. Strona nigdy sama nie przekierowuje.
  - **Telefon:** w górnym pasku imię, dzień/noc i Menu (sekcje i język), bo z przełącznikiem języka pasek się nie mieścił.
  - **Teksty:** interfejs w `lib/i18n/messages.ts`, treść portfolio w `content/` (plik na język, test pilnuje, że mają te same pozycje). Świat 3D też mówi językiem strony: menu, panele, nazwy stref, adresy.
- [x] Sekcje z treścią zastępczą: o mnie, projekty, doświadczenie, umiejętności, kontakt. (2026-11-22)
- [x] Pobieranie CV (na razie zastępczy PDF w `public/`). (2026-11-22)
- [x] Miejsce na portret i drzwi w sekcji powitalnej (na razie statyczne). (2026-11-22)
- [x] Responsywność od telefonu po szeroki ekran, motyw dzień i noc. (2026-11-22)
- [ ] Gotowe, gdy: Lighthouse co najmniej 95 we wszystkich kategoriach na produkcji, a strona działa bez JavaScriptu i bez WebGL.

### B2. Postać testowa **(razem)**

Jeden darmowy model do portretu i do świata (vision.md, rozdział 5).

- [ ] Wymagania: zrigowany humanoid, kość głowy (i najlepiej oczu), animacje bezczynności, chodu, biegu i machania, do około 20 tys. trójkątów, licencja pozwalająca na publiczne użycie (najlepiej CC0).
- [ ] Wybór modelu spośród kandydatów. Przygotuję porównanie: źródło, licencja, wygląd, rozmiar, animacje. Kandydaci do sprawdzenia: paczki CC0 Quaternius i Kenney, postacie i animacje z Mixamo. **(razem)**
- [ ] Model w pipeline'ie `pnpm assets` (optymalizacja, klipy animacji, ustawienia aktora).

### B3. Portret z żywą postacią **(Claude)**

- [ ] Decyzja techniczna: osobna mała scena 3D w ramce portretu albo postać rysowana przez już działający kanwas świata dokładnie w miejscu ramki (jeden kontekst WebGL, łatwiejsze „wyjście z obrazu”). Zrobię krótki test obu podejść i pokażę pomiary.
- [ ] Najpierw statyczny obraz (szybkie pierwsze wyświetlenie), potem żywa postać.
- [ ] Głowa i oczy podążają za kursorem (na telefonie za dotykiem albo spokojna animacja), animacja bezczynności. Z ograniczonym ruchem tylko spokojne ujęcie.
- [ ] Gotowe, gdy: portret nie pogarsza pierwszego wyświetlenia i wyników Lighthouse, nie rysuje klatek, gdy nic się nie dzieje, a budżety `pnpm perf` przechodzą.

### B4. Drzwi do świata i animacja ładowania **(razem)**

- [ ] Decyzja: drzwi jako grafika na stronie (SVG lub CSS, lekkie i ostre) czy jako obiekt 3D. Zaproponuję szkic. **(razem)**
- [ ] Ładowanie świata pokazane na drzwiach albo przy nich, np. światło w szparze rośnie razem z postępem.
- [ ] Gdy świat jest gotowy: drzwi lekko się uchylają i bije z nich światło. Klik i klawiatura (dostępność).
- [ ] Drzwi zastępują obecną platformę z kryształem.

### B5. Przejście: z portretu przez drzwi do świata **(Claude)**

- [ ] Postać wychodzi z portretu (animacja do ustalenia na prototypie), idzie do drzwi i przechodzi przez nie.
- [ ] Kamera przechodzi przez drzwi i świat się otwiera. Obecne wejście (fala terenu, obiekty wyrastające z ziemi) dostosowane do drzwi.
- [ ] Wyjście ze świata: droga powrotna (postać wraca do portretu).
- [ ] Gotowe, gdy: przejście jest płynne (budżet wejścia: brak przyciętych klatek i kompilacji), działa na telefonie, a przy ograniczonym ruchu jest cięcie.

### B6. Przewodnik w świecie **(Claude)**

- [ ] Przewodnik idzie za odwiedzającym. Gdy kamera odjedzie dalej, przewodnik idzie albo biegnie w miejsce, na które patrzy kamera, i zatrzymuje się w kadrze.
- [ ] Przy locie do strefy biegnie za kamerą, a przy dalekich skokach pojawia się na miejscu z animacją.
- [ ] Ożywienie: animacje bezczynności, rozglądanie się, reakcje na otwarcie treści (np. gest w stronę obiektu).
- [ ] Omijanie przeszkód: wykorzystanie węzłów nawigacji z formatu mapy (edytor już je przewiduje).

### B7. Świat bazowy **(razem)**

- [ ] Rozmieszczenie stref zgodne z sekcjami strony, bez stref roboczych. **(Ty)**
- [ ] Miejsce drzwi w świecie (punkt wejścia) i ścieżki między strefami. **(razem)**
- [ ] Zastępcze obiekty w każdej strefie (punkty treści). **(Ty)**

### B8. Domknięcie bazy **(Claude)**

- [ ] Budżety `pnpm perf` dla portretu, drzwi, przejścia i przewodnika.
- [ ] Testy e2e całej ścieżki: strona, drzwi, przejście, świat, przewodnik, powrót.
- [ ] Sprawdzenie na Twoim telefonie. **(Ty)**
- [ ] Lighthouse na produkcji.

---

### B9. Research urządzeń **(Claude)**

- [ ] Jaki najsłabszy telefon ma działać płynnie, ile może ważyć pierwsze wejście do świata, jakie progi jakości. Wynik: konkretne budżety dopisane do `perf/budgets.json` i `vision.md` (rozdział 12).

---

## Faza 1, część druga: gotowe do wysyłania rekruterom

### J1. Treść **(Ty, struktura Claude)**

- [ ] Struktura treści w dwóch językach z listą pól do uzupełnienia. **(Claude)**
- [ ] Prawdziwe teksty po angielsku: o mnie, projekty (opis, rola, technologie, linki do demo i repo), doświadczenie, umiejętności. **(Ty)**
- [ ] Polska wersja tekstów. **(Ty)**
- [ ] Obrazy lub zrzuty projektów i ich widok w panelu i na stronach sekcji. **(razem)**

### J2. CV **(Ty)**

- [ ] Aktualne CV w PDF (EN, opcjonalnie PL) podpięte pod przycisk pobierania.

### J3. Kontakt **(Claude)**

- [ ] Formularz kontaktowy na Supabase: zapis wiadomości, powiadomienie e-mail, ochrona przed spamem, informacja o przetwarzaniu danych (RODO).

### J4. Studium przypadku „jak to zbudowałem” **(razem)**

- [ ] Strona projektu o samym portfolio: silnik na żądanie, wypiekany świat, budżety wydajności z liczbami, decyzje techniczne. Mocny dowód umiejętności dla rekrutera.

### J5. Widoczność **(Claude)**

- [ ] SEO: tytuły i opisy stron w obu językach, `hreflang`, `sitemap.xml`, `robots.txt`, favicon.
- [ ] Podglądy linków (Open Graph): ładny obrazek przy udostępnianiu w LinkedIn i komunikatorach.
- [ ] Lighthouse na produkcji: co najmniej 95 we wszystkich kategoriach.
- [ ] Własna domena (decyzja). **(Ty)**

---

## Faza 2: rozgłos (po znalezieniu pracy)

Kolejność ustalimy po bazie i po kolejnych rozdziałach `vision.md`.

- **Świat i storytelling** (vision.md 3, 4, 7): setting, krainy, jak świat opowiada o mnie, progresja.
- **Wygląd:** styl strony i UI świata, docelowe modele i animacje, docelowa postać przewodnika.
- **Rozgrywka** (vision.md 6): znajdźki, sekrety, mini-gry, mini-misje, nagrody, interakcje przewodnika.
- **Edytor:** panel nocy, ujęcia kamery dla stref, odświeżanie minimapy po zapisie, granice stref na terenie.
- **Backend (Supabase):** księga gości (trwały ślad odwiedzających, z moderacją i ochroną przed spamem), ewentualnie postęp gry między urządzeniami.
- **Przewodnik mówi:** dymki, komentarze, nagrany głos.
- **Dźwięk, analityka, własna domena** (do decyzji).

---

## Podjęte decyzje

- Dwie ścieżki na jednej stronie: szybki przegląd bez świata i przygoda w świecie (vision.md, rozdział 2).
- Najpierw kompletna baza z treścią zastępczą, potem iteracje (vision.md, rozdział 13).
- Na start generyczny model przewodnika. Docelowy później.
- Cienie per mapa (edytor: Edges → Shadows). Na najniższej jakości ich nie ma.
- Kamera: kąt wynika z przybliżenia. Ręcznego przechylania nie ma, obrót jest.
- Domyślny motyw to dzień. Wybór zapamiętuje przeglądarka.
- Budżety wydajności pilnują czasu klatek i CPU, nie liczby obiektów.

## Otwarte pytania na teraz (potrzebne do bazy)

1. Czy masz szkic albo referencje układu strony (B1)?
2. Jaki styl postaci na start: realistyczny, stylizowany low-poly, voxelowy jak świat (B2)?
3. Jak mają wyglądać drzwi: stylizowane drewniane w kamiennej futrynie, magiczny portal, coś innego (B4)?
4. Jak postać ma wyjść z obrazu: wychodzi przez ramę, rozpływa się w świetle, ramka staje się przejściem (B5)? Powrót jest już ustalony: pusty obraz, postać wychyla się zza krawędzi i wraca.
5. Mikroanimacje portretu na telefonie (B3): do wymyślenia, zaproponuję kilka.
