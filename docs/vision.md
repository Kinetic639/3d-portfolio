# Wizja projektu

Dokument opisuje, czym ma być portfolio w wersji docelowej: dla kogo jest, jak działa, jak wygląda i jakie daje wrażenie.
Powstaje rozdział po rozdziale z rozmów. Rozdziały oznaczone **(do ustalenia)** czekają na kolejne rozmowy.
Plan prac wynikający z wizji jest w `docs/roadmap.md`.

---

## 1. Cel i odbiorca

**Odbiorcy:** rekruterzy i firmy, klienci zleceń, inni twórcy.

**Cel główny:** wyróżnić mnie na zatłoczonym rynku osób szukających pracy w programowaniu. Konkretnie:

- więcej kontaktów od rekruterów i osób zainteresowanych współpracą;
- zapamiętanie mnie po wizycie;
- chęć udostępniania strony innym i rozmawiania o niej;
- powroty: odwiedzający wraca więcej niż raz, żeby odkryć więcej;
- poziom, który pozwala zgłosić stronę do konkursów i serwisów prezentujących ciekawe portfolio.

**Cel poboczny:** sam projekt ma być ciekawy i robić wrażenie jako dzieło.

**Kolejność celów (ustalone 2026-11-22):**

1. **Najpierw praca:** projekt ma mi pomóc znaleźć pracę zdalną jako programista. Liczy się to, co przekonuje rekrutera: szybka, przejrzysta strona, prawdziwe projekty, CV, kontakt i świat 3D jako dowód umiejętności, który zapada w pamięć.
2. **Potem rozgłos:** gdy praca się znajdzie, dopracowanie projektu tak, żeby przyciągał uwagę i wyróżnienia (konkursy, serwisy z portfolio).

Konsekwencje dla kolejności prac:

- prawdziwa treść (projekty, doświadczenie, CV) i działający kontakt są w fazie 1, nie na końcu;
- angielski jest językiem głównym (praca zdalna, często zagraniczna), polski drugi;
- świat 3D w fazie 1 ma być kompletny i dopracowany w tym, co ma, ale wąski: wejście przez drzwi, przewodnik, strefy z treścią. Wnętrza, ekwipunek, misje i mini-gry czekają na fazę 2;
- sam projekt jest jednym z projektów portfolio: krótkie studium przypadku „jak to zbudowałem” z liczbami wydajności to mocny argument dla rekrutera.

## 2. Nastrój i doświadczenie

**Nastrój:** przytulny, przygodowy, tajemniczy, humorystyczny, spokojny.

**Do kogo ma trafiać:** do osób, które lubią gry survival, idle i escape roomy. Jednocześnie ma być przejrzysty i zrozumiały dla rekrutera, który wchodzi na kilka chwil.

**Dwie ścieżki, jedna strona:**

| | Rekruter (30 s - 2 min) | Ciekawski (5 - 20+ min) |
|---|---|---|
| Co robi | przegląda stronę: wszystkie sekcje, pobiera CV, kontakt | wchodzi do świata 3D i przeżywa przygodę w stylu gry |
| Czego potrzebuje | szybkości, przejrzystości, wszystkiego bez wchodzenia do świata | odkrywania, ciekawostek, sekretów, interakcji, powodów, żeby zostać |
| Co musi zapamiętać | kim jestem, co umiem, jak się skontaktować | że to było niezwykłe i chce to pokazać innym |

**Pierwsze chwile:**

- **10 s:** otwiera się strona z prezentacją mnie i przywitaniem. Portret z animowaną postacią reaguje na kursor. Obok są drzwi, przez których szparę zaczyna bić światło, gdy świat jest gotowy.
- **1 min:** odwiedzający albo przewija stronę i czyta sekcje, albo klika drzwi. Postać wychodzi z portretu i razem z nim przechodzi przez drzwi do świata.
- **5 min:** odwiedzający sam eksploruje świat i strefy. Przewodnik podąża za nim, prezentuje świat i ożywia go animacjami i interakcjami.

## 3. Świat **(do ustalenia)**

Setting, krainy i strefy, skala, styl wizualny, referencje. Znane na dziś:

- styl voxelowy z modelami (obecny silnik), dzień i noc, wiatr, cienie;
- strefy świata to sekcje strony (już działa: adres URL, lot do strefy, nazwy, minimapa);
- referencje: Tribes of Midgard (kamera, czytelność świata).

## 4. Storytelling **(do ustalenia)**

O czym opowiada świat, jak przewodnik prowadzi odkrywanie, czy jest progresja (np. odblokowywanie stref, dziennik).

## 5. Postacie

### Przewodnik

Reprezentuje mnie w świecie.

- **Na stronie:** popiersie w portrecie, w miejscu, gdzie zwykle jest zdjęcie autora. Jest proste, nie ponad miarę, i robi drobne, humorystyczne rzeczy, np. wodzi oczami za kursorem. Interakcje będą dochodzić z czasem.
- **Wejście do świata:** po kliknięciu drzwi postać znika z portretu z ciekawą animacją, jakby wyszła z obrazu, i przechodzi z odwiedzającym przez drzwi.
- **W świecie:** towarzyszy odwiedzającemu. Odwiedzający nadal sam przegląda świat i wchodzi w interakcje, a przewodnik podąża za nim po mapie, prezentuje świat i dodaje animacje i interakcje.
- **Odwiedzający to kamera:** eksploruje świat, wchodzi w interakcje z jego elementami, odwiedza strefy i miejsca. Później, w niektórych mini-grach, może przejmować sterowanie postacią. Może też zaznaczać niektóre rzeczy albo przewodnika, żeby wydać im polecenie.
- **Mowa:** na początek tylko animacje i gesty. Później dymki i komentarze, a może nagrany mój głos.
- **Powrót na stronę:** prosto, bez efektów. Po powrocie portret jest przez chwilę pusty, potem postać wychyla się zza krawędzi i wraca do obrazu.
- **Telefon:** brak kursora, więc postać potrzebuje innych mikroanimacji i interakcji. Pomysły do wymyślenia.
- **Wygląd docelowy:** portret i przewodnik mają mnie przypominać, stylizowane. Na początek wystarczą placeholdery do testów.
- **Model na start:** generyczny, darmowy model z animacjami do testów. Docelowy model później.
- **Jeden model czy dwa:** jedno zrigowane ciało wystarczy do obu ról. Portret to ta sama postać w kadrze od pasa w górę (osobna, mała scena), a w świecie jest całe ciało. Dzięki temu wyjście z obrazu i wejście do świata to ciągła animacja tej samej postaci. Dwa modele (popiersie i pełna postać) mają sens tylko wtedy, gdy popiersie ma być dużo bardziej szczegółowe. Do decyzji przy wyborze modelu.

### Inne postacie **(do ustalenia)**

Mieszkańcy, zwierzęta (jest już kruk), NPC z misjami.

## 6. Interakcje i mechaniki **(do ustalenia, po bazie)**

Znajdźki, sekrety, mini-gry (jest kopalnia), mini-misje, nagrody. Mają przyciągać fanów gier survival, idle i escape room.

Przykłady, które już padły:

- **Wnętrza:** z widoku świata widać dom z zewnątrz. Kliknięcie robi animowane zbliżenie i odsłania wnętrze.
- **Ekwipunek:** odwiedzający znajduje przedmioty i dodaje je kliknięciem do ekwipunku, razem z podpowiedziami, co robią. Kliknięcie przedmiotu w ekwipunku otwiera jego panel z informacjami.
- **Polecenia:** zaznaczanie przewodnika albo obiektów i wydawanie im poleceń.
- **Sterowanie postacią** w niektórych mini-grach.
- **Panele UI:** część kliknięć nadal otwiera panele z treścią. Dokładny sposób działania ustalamy przy dopracowaniu.

## 7. Portfolio w świecie **(do ustalenia)**

Jak w świecie są pokazane projekty, doświadczenie, umiejętności i kontakt (budynki, eksponaty, postacie, zadania).

Przykład: sekcja projektów to teczki porozrzucane na biurku w gabinecie w domu. Kliknięcie teczki otwiera panel wyglądający jak jej wnętrze, z opisem projektu.

## 8. UI w świecie **(do ustalenia, po bazie)**

HUD, panele treści, menu, minimapa, przełącznik dnia i nocy, ewentualny dziennik. Styl spójny ze stroną.

## 9. Strona internetowa

- **Charakter:** nowoczesna, minimalistyczna, stylizowana tak, żeby pasowała do świata 3D, z mikroanimacjami.
- **W pełni responsywna, z wysokimi wynikami testów** (Lighthouse: wydajność, dostępność, SEO, dobre praktyki).
- **Szybki przegląd:** wszystkie sekcje portfolio bez wchodzenia do świata, pobranie CV, kontakt.
- **Portret:** animowana postać przewodnika (rozdział 5).
- **Stałe miejsce w układzie:** portret i drzwi mają zarezerwowane miejsce i niczego nie przykrywają, tak jak dziś przykrywa treść platforma z kryształem na dole ekranu.
  - **Komputer:** przypięty sidebar po prawej, duży portret na górze, małe drzwi na dole. Oba zawsze widoczne, także na podstronach.
  - **Telefon:** portret na górze treści (przewija się z nią), drzwi przypięte w dolnym pasku.
- **Język:** polski i angielski z przełącznikiem. Przy pierwszej wizycie strona może zapytać o język.
- **Kontakt:** formularz kontaktowy, a do tego e-mail i linki.
- **Ślad odwiedzających:** odwiedzający mogą zostawić trwały ślad, np. wpis w księdze gości.
- **Wejście do świata:** futryna z zamkniętymi drzwiami. Gdy świat się załaduje, drzwi lekko się uchylają i bije z nich światło, które zaprasza do kliknięcia. Po kliknięciu postać wychodzi z portretu i przechodzi przez drzwi.
- **Ładowanie świata:** ma mieć własną animację (szczegóły do ustalenia).
- **Mapa portfolio:** jest już na stronie jako nawigacja po sekcjach.

## 10. Dźwięk **(do ustalenia)**

## 11. Telefon i dostępność

- Pełna responsywność strony i świata. Świat na telefonie sprawdzony 2026-11-18: działa zgodnie z oczekiwaniem.
- Strona bez świata musi być w pełni dostępna (klawiatura, czytniki ekranu, ograniczony ruch).

## 12. Wymagania techniczne

- Wysoka wydajność na każdym etapie: budżety w `pnpm perf` (płynne klatki, brak kompilacji shaderów po rozgrzaniu, rysowanie tylko na żądanie).
- Strona ładuje się szybko, świat w tle. Wejście do świata niczego nie doładowuje.
- Każda nowa funkcja (portret 3D, przewodnik, drzwi) musi zmieścić się w tych budżetach. Portret na stronie nie może spowolnić pierwszego wyświetlenia.
- **Stack:** Next.js, three.js, Vercel. Backend: **Supabase** (formularz kontaktowy, wpisy odwiedzających, ewentualnie postęp gry).
- **Modele:** placeholdery z darmowych paczek, docelowo wszystko robione samodzielnie w Blenderze. Bez budżetu na płatne zasoby.
- **Docelowe urządzenia i limit wagi świata:** do zbadania (research: najsłabszy telefon, który ma działać płynnie, i ile może ważyć pierwsze wejście).

## 13. Zakres i kolejność

**Zasada:** najpierw kompletna, działająca baza (silnik, serce i mechanizmy strony i świata oraz ich połączenie), na wysokim poziomie i z wysoką wydajnością. Potem prawdziwa treść, żeby strona pomagała w szukaniu pracy (faza 1). Rozgrywka i szlif pod nagrody to faza 2 (rozdział 1).

**Baza (pierwsza wersja do pokazania):**

1. Strona ładuje się i otwiera.
2. Działa szkielet strony (wireframe) ze wszystkimi sekcjami, na razie z treścią zastępczą, w tym pobieranie CV.
3. Portret z animowaną postacią (generyczny model do testów), np. oczy i głowa za kursorem.
4. Drzwi do świata: uchylają się i świecą, gdy świat jest gotowy.
5. Animacja ładowania świata.
6. Przejście: postać wychodzi z portretu i przechodzi przez drzwi, a odwiedzający razem z nią wchodzi do świata.
7. W świecie: eksploracja, strefy i przewodnik, który podąża tam, gdzie jest odwiedzający, i dodaje życia animacjami.

**Termin:** brak sztywnego terminu. Ograniczeniem jest dostępny limit sesji AI, więc dokumentacja (ten plik, `roadmap.md`, `architecture.md`) musi pozwalać podjąć pracę w każdej nowej sesji.

**Kolejne iteracje (po bazie):** dopracowany UI i styl, docelowe modele 3D i animacje, interakcje, mini-gry, znajdźki, mini-misje, prawdziwa treść.
