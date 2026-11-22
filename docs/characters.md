# Postać testowa i portret (B2, B3)

Porównanie darmowych modeli na przewodnika i portret. Stan na 2026-11-22. Dane pochodzą ze stron autorów. Rzeczy, których strony nie podają (kości oczu, dokładna liczba trójkątów, nazwy animacji), trzeba sprawdzić w pobranych plikach. Takie pola są oznaczone „do sprawdzenia”.

## 1. Wymagania

Jeden model do obu ról (vision.md, rozdział 5): w portrecie od pasa w górę, w świecie całe ciało.

| Wymaganie | Po co | Twarde? |
|---|---|---|
| Licencja CC0 albo równie swobodna, z prawem do **publikowania pliku** | Repozytorium jest publiczne, a model jest serwowany jako plik `.glb` każdemu odwiedzającemu | tak |
| Zrigowany humanoid, kość głowy i szyi | Głowa podąża za kursorem w portrecie | tak |
| Oczy jako osobne kości albo siatki (lub kształty twarzy) | Oczy podążają za kursorem. Bez tego ruszy się tylko głowa | najlepiej |
| Animacje: bezczynność, chód, bieg, machanie lub gest | Przewodnik w świecie, powitanie w portrecie | tak |
| Dodatkowo: siadanie, wskazywanie, interakcja | Pokazywanie miejsc i obiektów w świecie | najlepiej |
| Do ok. 20 tys. trójkątów, jedna lub dwie małe tekstury | Budżety `pnpm perf` i wynik Lighthouse na telefonie | tak |
| Format glTF lub GLB (ew. FBX do konwersji) | Pipeline `pnpm assets` przyjmuje glTF | tak |
| Ludzkie proporcje, styl spokojny | Docelowo postać ma przypominać Ciebie (stylizowana) | najlepiej |
| Styl pasujący do świata (voxel, low-poly) | Spójność ze światem | najlepiej |

## 2. Kandydaci

### A. Quaternius: Universal Base Characters i Universal Animation Library (polecam)

- **Licencja:** CC0, również do publikowania plików.
  - [Postacie](https://quaternius.com/packs/universalbasecharacters.html), także na [itch.io](https://quaternius.itch.io/universal-base-characters).
  - [Animacje](https://quaternius.com/packs/universalanimationlibrary.html); jest też [druga część](https://quaternius.com/packs/universalanimationlibrary2.html).
- **Postacie:**
  - proporcje Superhero, Regular i Teen, każda w wersji męskiej i żeńskiej, do tego fryzury;
  - darmowa wersja Standard: według opisu podglądu 2 modele bazowe i 5 fryzur;
  - stroju brak (minimalne ubranie). Quaternius ma osobne paczki strojów CC0, np. [Modular Character Outfits - Fantasy](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html).
- **Rozmiar:** średnio ok. 13 tys. trójkątów. Mieści się w limicie.
- **Rig i animacje:**
  - wspólny humanoidalny rig dla postaci i animacji, więc animacje pasują bez przenoszenia;
  - Universal Animation Library: 120+ animacji (darmowe ok. 70%): chód i bieg w 8 kierunkach, trucht, sprint, siadanie, gesty (emotki) i inne;
  - druga część biblioteki dodaje 130+ animacji.
- **Formaty:** glTF, FBX, OBJ. Źródłowy `.blend` jest w płatnej wersji Source.
- **Styl:** stylizowany, ale o ludzkich proporcjach. Najbliżej docelowego „przypomina mnie”.
- **Do sprawdzenia w plikach:**
  - czy są kości oczu albo osobne siatki oczu (wersja Source ma shader koloru oczu, co sugeruje osobny materiał oczu);
  - pełna lista nazw animacji (jest w przeglądarce animacji na stronie autora);
  - czy darmowa wersja jest za „name your own price” od 0 zł.
- **Plusy:**
  - najlepszy start pod portret (ludzka twarz, głowa, szyja);
  - jeden rig do wszystkiego;
  - na ten sam rig da się później podpiąć Twoją postać z Blendera i zachować animacje.
- **Minusy:**
  - najcięższy z kandydatów (13 tys. trójkątów, ok. 122 MB samego zipa, z którego bierzemy jeden model);
  - styl mniej „voxelowy” niż świat;
  - bez ubrania wygląda jak manekin, więc potrzebny strój.

### B. KayKit: Adventurers i Character Animations (rezerwa)

- **Licencja:** CC0, bez wymogu podawania autora (autorka prosi tylko, żeby nie odsprzedawać niezmienionych plików). Strony: [postacie](https://kaylousberg.itch.io/kaykit-adventurers) i [animacje](https://kaylousberg.itch.io/kaykit-character-animations).
- **Postacie:** za darmo 5 bohaterów fantasy (rycerz, mag, łucznik, barbarzyńca, łotrzyk) z akcesoriami.
- **Rozmiar:** „low poly, zoptymalizowane na telefony”, liczby trójkątów nie podano. Jedna tekstura-gradient 1024×1024 (da się zmniejszyć do 128×128). Najlżejszy kandydat.
- **Animacje:** 150+ za darmo (wersja 1.1 z grudnia 2025), m.in. bezczynność, chód, bieg, machanie, wiwatowanie, siadanie, interakcja, narzędzia.
- **Formaty:** glTF i FBX.
- **Styl:** kreskówkowy, duże głowy, proste bryły. Pasuje do świata voxel lepiej niż A.
- **Do sprawdzenia:** czy jest kość głowy i jak zrobione są oczy. Przy jednej teksturze-gradiencie oczy są pewnie malowane albo są prostymi bryłami, więc podążanie oczami może się nie udać.
- **Plusy:** bardzo lekki, dużo przydatnych animacji (machanie, wskazywanie, siadanie), styl zgodny ze światem.
- **Minusy:**
  - kostiumy fantasy, daleko od „przypomina mnie”;
  - twarz zbyt prosta na portret, który ma śledzić kursor oczami.

### C. Kenney: Animated Characters i Character Assets (odrzucam)

- **Licencja:** CC0. Strony: [Animated Characters 3](https://kenney-assets.itch.io/animated-characters-3) i [Character Assets](https://kenney.itch.io/kenney-character-assets).
- **Zawartość:**
  - Animated Characters: jeden model, 4 skórki i tylko 3 animacje (bezczynność, skok, bieg);
  - Character Assets: 4 modele, 75 skórek, 17 animacji.
- **Dlaczego odpadają:** za mało animacji (brak machania i gestów) i bardzo prosta twarz. Dobre do tłumu w świecie, nie do przewodnika i portretu.

### D. Mixamo, Adobe (odrzucam do repozytorium)

- **Licencja:** darmowe postacie i animacje do użytku w projektach (wymaga konta Adobe). Według odpowiedzi na forum Adobe nie wolno jednak rozpowszechniać samych plików ([wątek o publicznym repozytorium](https://forums.unrealengine.com/t/can-i-upload-a-project-with-mixamo-animations-to-a-public-github-repo/411968), [forum Adobe](https://community.adobe.com/t5/mixamo-discussions/mixamo-animations-licence-game-mods/td-p/11956925)). Oficjalne FAQ Adobe nie dało się otworzyć (403).
- **Dlaczego odpada:** nasze repozytorium jest publiczne, a strona serwuje plik modelu każdemu odwiedzającemu, czyli to szara strefa. Do wewnętrznych testów animacji może się przydać, do publikacji nie.

### E. Ready Player Me (nie istnieje)

Usługa została zamknięta 31 stycznia 2026 po przejęciu przez Netflix ([TechCrunch](https://techcrunch.com/2025/12/19/netflix-acquires-gaming-avatar-maker-ready-player-me/), [Wikipedia](https://en.wikipedia.org/wiki/Ready_Player_Me)).

### F. VRoid Studio (pomysł na wygląd docelowy, nie na test)

- **Co to jest:** darmowy kreator postaci od pixiv. Postać, która Cię przypomina, można wyklikać bez Blendera.
- **Licencja:** według [wytycznych VRoid](https://vroid.com/en/studio/guidelines) siatki, tekstury i gotowe elementy z programu można używać komercyjnie. Przy eksporcie ustawia się zgody w metadanych modelu ([warunki](https://developer.vroid.com/en/guidelines/conditions_of_use.html)).
- **Technika:**
  - eksport do VRM: humanoid z mrugnięciem i minami;
  - patrzenie za celem (look-at) obsługuje biblioteka [@pixiv/three-vrm](https://github.com/pixiv/three-vrm/), czyli oczy za kursorem są gotowe.
- **Minusy:**
  - styl anime, inny niż świat;
  - modele są zwykle cięższe (dużo tekstur, shader MToon), więc trzeba by je odchudzić pod budżety;
  - dodatkowa biblioteka.
- **Wniosek:** do rozważenia przy finalnym wyglądzie zamiast modelowania od zera w Blenderze. Teraz nie.

## 3. Rekomendacja

**Na postać testową: A (Quaternius), model Regular męski i Universal Animation Library.**

- Jedyny kandydat, który ma ludzką twarz pod portret i ma pewny wspólny rig z dużą biblioteką animacji.
- Daje drogę do wersji docelowej: Twoja postać z Blendera na tym samym rigu dostanie te same animacje.
- Mieści się w limicie 20 tys. trójkątów. Teksturę i siatkę i tak przepuścimy przez `pnpm assets`.
- Do ubrania: najprostszy strój z paczek CC0 Quaternius albo jednolity materiał.

**Rezerwa: B (KayKit)**, jeśli A po sprawdzeniu nie ma sensownej głowy i oczu albo wygląda obco w świecie voxel.

## 4. Następne kroki

1. **Pobranie paczek** do `temp/` (poza repozytorium), za Twoją zgodą przy każdej:
   - Universal Base Characters (wersja Standard, ok. 122 MB);
   - Universal Animation Library (Standard);
   - ewentualnie KayKit Adventurers i Character Animations.
2. **Sprawdzenie w plikach:**
   - kości głowy, szyi i oczu;
   - liczba trójkątów i tekstur;
   - nazwy animacji: bezczynność, chód, bieg, machanie, wskazanie, siadanie.
3. **Zrzuty obu kandydatów w świecie i w ramce portretu** do Twojej decyzji.
4. **Wybrany model w `pnpm assets`** (B2, punkt 3), z pakietem animacji przyciętym do potrzebnych.

## 5. Przy okazji

Obecny model testowy `assets/models/soldier` pochodzi z przykładów three.js. Według [zestawienia innej osoby](https://claudeskills.info/skills/PlayableIntelligence/game-creator/game-3d-assets/) jest na licencji MIT, ale źródła tego nie potwierdziłem. Po wyborze postaci w B2 warto go usunąć, żeby nie zostawiać w publicznym repozytorium modelu niepewnego pochodzenia.

## 6. Sprawdzenie pobranych plików (2026-11-22)

Pobrane (wersje Standard, CC0) do `temp/models/quaternius/`, poza repozytorium:
- Universal Base Characters;
- Universal Animation Library 1 i 2;
- Modular Character Outfits - Fantasy.

**Co jest w darmowej wersji:**
- **Postacie:** tylko proporcje Superhero (mężczyzna i kobieta), ok. 14,3 tys. trójkątów. Proporcji Regular nie ma jako gołego ciała.
- **Stroje:** Peasant i Ranger dla mężczyzny i kobiety. Strój to całe ubrane ciało w proporcjach Regular, ale **bez głowy**:
  - Peasant: 12,9 tys. trójkątów;
  - Ranger: 27 tys., za ciężki.
- **Fryzury i brwi** przypięte do kości głowy (fryzura 1,3 tys. trójkątów).
- **Rig:** wspólny dla wszystkiego, 65 kości w układzie Unreal (`root`, `pelvis`, `spine_01-03`, `neck_01`, `Head`, palce). **Kości oczu brak.** Oczy to osobna siatka z własną teksturą 256×256.
- **Animacje:**
  - biblioteka 1: 43 klipy, m.in. `Idle_Loop`, `Idle_Talking_Loop`, `Walk_Loop`, `Walk_Formal_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, `Interact`, `PickUp_Table`, `Sitting_Enter`, `Sitting_Idle_Loop`, `Sitting_Talking_Loop`, `Sitting_Exit`, `Dance_Loop`;
  - biblioteka 2: 43 klipy, m.in. `Idle_FoldArms_Loop`, `Yes`, `Idle_No_Loop`, `Idle_Rail_Call`, `Chest_Open`, `Consume`, `Walk_Carry_Loop`;
  - **machania nie ma w darmowych wersjach.** Na powitanie nadają się `Yes`, `Idle_Rail_Call` albo `Interact`; machanie można dorobić później w Blenderze na tym samym rigu.
- **Tekstury:** duże, 2048-4096 px PNG (normal, roughness/ORM). `pnpm assets` i tak zmniejsza je do WebP; mapy normal i ORM można pominąć.
- **Błąd w paczce:** model Superhero odwołuje się do nieistniejących plików `T_Hair_1_Normal_png.png` i `T_Eye_Normal_png.png`. Przy imporcie trzeba to obejść.

**Test złożenia** (zrzuty w `temp/shots/a-*.png`, `b-*.png`):
- Strój Peasant przebija przez ciało Superhero, bo te proporcje do siebie nie pasują.
- Działa za to **strój Peasant i sama głowa z modelu Superhero**:
  - z siatki Superhero zostają tylko trójkąty przypięte do kości `Head` i `neck_01` (2,8 tys.), do tego oczy, fryzura i brwi;
  - wygląda spójnie, animacje chodu i bezczynności działają, na szyi przy kołnierzu widać tylko drobny szew.
- **Oczy za kursorem bez kości oczu:** przesunięcie tekstury oczu odwraca wzrok w bok (zrzut `b-composed-eyes-left.png`). Razem z obrotem kości `Head` i `neck_01` wystarczy to na portret.
- **Szacunek po złożeniu:** ok. 17-18 tys. trójkątów (bez zdublowanych brwi), czyli mieści się w limicie 20 tys. Kilka tekstur 1024 px WebP i ok. 8 wybranych klipów animacji.

**Wniosek:** wariant A się sprawdza jako **Peasant z głową z modelu Superhero**. Do zrobienia w B2, punkt 3:
- skrypt w `pnpm assets`, który składa to w jeden plik GLB (wycięcie głowy, pominięcie zbędnych map, wybrane klipy);
- usunięcie testowego żołnierza.
