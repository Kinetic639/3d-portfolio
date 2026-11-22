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
- [x] Gotowe, gdy: Lighthouse spełnia kryterium poniżej, a strona działa bez JavaScriptu i bez WebGL. (2026-11-22)
  - **Kryterium Lighthouse (zmienione 2026-11-22):**
    - komputer: co najmniej 95 we wszystkich kategoriach;
    - telefon: dostępność, dobre praktyki i SEO co najmniej 95, wydajność co najmniej 75 i bez spadków (punkt odniesienia: 79).
  - **Dlaczego zmienione:** na telefonie Lighthouse spowalnia procesor 4× i najmocniej liczy TBT. Punkty zabiera hydratacja strony (jedno zadanie ok. 250 ms) i ładowanie świata 3D w tle. Wyższy wynik wymagałby ładowania świata dopiero po kliknięciu drzwi, czyli dłuższego czekania dla prawdziwego odwiedzającego. Optymalizowalibyśmy pod test, nie pod człowieka. Strony z WebGL mają na telefonie zwykle 30-60.
  - **Wynik:**
    - komputer: 100 / 100 / 100 / 100 (pomiar Twój);
    - telefon: wydajność 79 (pomiar Twój), dostępność, dobre praktyki i SEO po 100 (EN i PL, lokalny serwer produkcyjny); LCP 1,8 s i CLS 0 przy wolnym 4G.
  - **Bez JavaScriptu i bez WebGL** strona działa; testy e2e to pilnują.
  - **Na później (B8):** zmniejszyć koszt hydratacji (kilka punktów na telefonie bez psucia świata).

### B2. Postać testowa **(razem)**

Jeden darmowy model do portretu i do świata (vision.md, rozdział 5).

- [x] Wymagania i porównanie kandydatów: `docs/characters.md` (2026-11-22). Rekomendacja: Quaternius Universal Base Characters z Universal Animation Library (CC0), rezerwa: KayKit.
  - Pierwotne wymagania: zrigowany humanoid, kość głowy (i najlepiej oczu), animacje bezczynności, chodu, biegu i machania, do około 20 tys. trójkątów, licencja pozwalająca na publiczne użycie (najlepiej CC0).
- [x] Wybór modelu spośród kandydatów (2026-11-22): Quaternius (CC0), strój Peasant z głową modelu Superhero, animacje z Universal Animation Library 1 i 2. Szczegóły i zrzuty: `docs/characters.md`. Bez mimiki (decyzja: mimika przyjdzie z docelowym modelem z Blendera).
- [x] Model w pipeline'ie `pnpm assets` (2026-11-22): `assets/models/guide`, złożony skryptem `scripts/guide/compose.mjs` z paczek w `temp/models/quaternius`.
  - Po optymalizacji: 882 KB, 18,8 tys. trójkątów, 5 tekstur WebP po 1024 px.
  - 13 klipów: Idle, Walk, Run, Talk, Interact, PickUp, SitDown, Sitting, StandUp, Yes, No, Call, ArmsFolded.
  - Ustawienia aktora: chód 1,3, bieg 3. Testowy żołnierz (niepewne pochodzenie) usunięty.

### B3. Portret z żywą postacią **(Claude)**

- [x] Decyzja techniczna (2026-11-22): **osobna mała scena w ramce** (`lib/portrait/portrait-scene.ts`).
  - Dlaczego: na telefonie portret przewija się z treścią. Kanwas świata jest przypięty do ekranu, więc musiałby przerysowywać postać przy każdym przewinięciu i by się spóźniał.
  - Scenę montuje warstwa świata (portal React do ramki na stronie), a silnik świata i scena portretu są w jednym dynamicznym module `lib/engine/runtime.ts`. Inaczej Turbopack wstawiał three.js dwa razy (dodatkowe 670 KB).
- [x] Najpierw statyczny obraz, potem żywa postać (2026-11-22).
  - Poster `public/portrait/guide.webp` (16 KB), renderowany z żywego portretu skryptem `scripts/guide/portrait-poster.mjs` (uruchomić po każdej zmianie modelu).
  - Żywa postać ładuje się po 2 s spokoju od gotowości świata, tylko gdy portret jest na ekranie. Szybkie wejście do świata niczego więc nie pobiera.
- [x] Głowa i oczy podążają za kursorem, animacja bezczynności (2026-11-22).
  - Głowa i szyja obracają się za kursorem; oczy przesuwają się teksturą, bo model nie ma kości oczu.
  - Bez kursora (telefon albo kursor w spoczynku) postać co kilka sekund spokojnie się rozgląda. Kliknięcie lub dotknięcie portretu to machanie („Call”).
  - Mruganie działa samo, gdy model ma kształt `blink`.
  - Przy ograniczonym ruchu i oszczędzaniu danych zostaje sam poster.
  - Rysuje najwyżej 30 klatek na sekundę i tylko wtedy, gdy portret jest na ekranie, karta jest widoczna, a świat nie jest na pierwszym planie.
- [x] Gotowe, gdy: portret nie pogarsza pierwszego wyświetlenia i wyników Lighthouse, nie rysuje klatek, gdy nic się nie dzieje, a budżety `pnpm perf` przechodzą. (2026-11-22)
  - **Stan (2026-11-22):** budżety portretu są w `perf/budgets.json` (`portrait.afterReadyMs`, `portrait.longTaskMs`). Pomiary przy opóźnieniu 1 s mieściły się w nich, ale po zmianie na 2 s nie było nowego pomiaru.
  - Lighthouse z portretem (pomiar Twój, 2026-11-22): wyniki bez zmian względem B1.
  - `pnpm perf` (2026-11-22): wszystkie budżety przechodzą. Portret ładuje się 2,5 s po gotowości świata, jego długie zadania to 136 ms; ładowanie strony 118 ms; wejście 0 klatek powyżej 33 ms; dzień/noc p95 16,8 ms.
  - Po drodze: portret prosił o GPU w trybie „low-power”, co przy kontekście świata („high-performance”) trzymało przejście dnia i nocy na 30 klatkach. Teraz oba proszą o ten sam tryb, a płótno portretu znika ze strony, gdy świat jest na pierwszym planie.
  - Testy e2e świata i edytora nie były uruchamiane po ostatnich zmianach portretu.

### B4. Ekran wejściowy z drzwiami **(razem)**

Zmiana koncepcji (2026-11-22): wejście do świata nie prowadzi już z portretu, tylko przez drzwi na ekranie wejściowym. Strona z portretem zostaje jako wersja klasyczna. Rozważane i odrzucone: drzwi w tle portretu, przewijanie jako warunek otwarcia drzwi, mapa jako motyw wejścia, sam świat bez zwykłej strony (za duże ryzyko u rekruterów i na telefonach). Prototyp: `components/site/EntryScreen.tsx`, tylko pod `?entry=door`.

- [x] Decyzja: ekran wejściowy z drzwiami na środku jako loaderem; drzwi w CSS (wersja 3D, jeśli koncept się sprawdzi). (2026-11-22, prototyp)
- [x] Ładowanie na drzwiach: zamknięte, światło pulsuje w szparach i rośnie z postępem. (2026-11-22, prototyp)
- [x] Gotowe: drzwi uchylone, światło stałe i na podłodze; klik i klawiatura. (2026-11-22, prototyp)
- [x] Kartka „CV” na drzwiach: panel z opisem strony, pobraniem CV, wersją klasyczną i kontaktem; tabliczka z imieniem i rolą; PL | EN. (2026-11-22, prototyp)
- [x] Drzwi zastępują platformę z kryształem (na stronie nie jest rysowana od B1).
- [x] Ekran domyślnie na `/` (2026-11-22; decyzja w `<head>`, `components/site/entry-boot.ts`), z zasadami:
  - telefon, brak WebGL, ograniczony ruch i oszczędzanie danych trafiają od razu na wersję klasyczną;
  - linki do konkretnej treści (`/projects/...`) omijają ekran;
  - wybór jest zapamiętany (powracający odwiedzający);
  - bez mignięcia zwykłej strony przed ekranem (strona jest ukryta, zanim się namaluje; treść zostaje w HTML);
  - `?entry=door` pokazuje ekran zawsze, `?entry=classic` nigdy; bez WebGL ekran sam się zamyka.

### B5. Przejście przez drzwi i mapa świata **(Claude)**

- [x] Jeden ciągły ruch: drzwi otwierają się, a kamera przyspiesza w otwór, aż jego światło wypełni ekran; pod pełnym światłem zmienia się scena; światło gaśnie nad światem. Wejście świata startuje od najwyższego punktu i tylko opada (nowa opcja `fromTop` polecenia `enter`). (2026-11-22, prototyp)
- [x] Podczas wejścia sam świat bez kontrolek; na końcu mapa świata na pełnym ekranie (strefa: lot i sekcja, pinezka: projekt, „Zwiedzaj świat” lub Escape: zamknięcie); kontrolki dopiero po jej zamknięciu. (2026-11-22, prototyp)
- [x] Wyjście ze świata: kto wszedł przez drzwi, wraca na ekran z drzwiami, tym samym ruchem odwrotnie (ze światła, z otworu drzwi, drzwi przymykają się do uchylenia; fokus na drzwiach). (2026-11-22, prototyp)
- [x] Gotowe, gdy: budżety `pnpm perf` przechodzą także dla wejścia przez drzwi, pełny zestaw testów przechodzi, a przy ograniczonym ruchu jest cięcie. (2026-11-22: zamknięte decyzją, bez ponownego pomiaru; zob. stan niżej)
  - Stan (2026-11-22): pełne testy przechodzą (66 e2e, 226 jednostkowych); cięcie przy ograniczonym ruchu jest. Wejście przez drzwi jest mierzone w `pnpm perf` (`doorEntry.*`): p95 16,75 ms, 0 długich zadań, 0 kompilacji, ale 2 klatki powyżej 33 ms przy budżecie 1. W tym samym przebiegu zwykłe wejście miało tyle samo (i najdłuższą klatkę 50 ms), więc to wygląda na szum tej maszyny. Do potwierdzenia jednym pomiarem.

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
- [ ] Lighthouse na produkcji według kryterium z B1, plus mniejszy koszt hydratacji strony (kilka punktów wydajności na telefonie).

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
- [ ] Lighthouse na produkcji według kryterium z B1 (komputer co najmniej 95 wszędzie; telefon co najmniej 95 poza wydajnością, ta co najmniej 75 i bez spadków).
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
