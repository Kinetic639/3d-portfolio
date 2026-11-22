# Nawigacja: chodzenie, wyznaczanie drogi, kolizje

Plan z 2026-11-22. Jak postacie (przewodnik, później postacie w mini-grach) wiedzą, gdzie mogą chodzić, jak dochodzą do celu bez wchodzenia w drzewa i ściany, i jak w mini-grach działają kolizje. Wdrożenie: B6 (warstwy 1-3), mini-gry (warstwa 4), później ruchome przeszkody.

## Zasada

Świat jest siatką bloków, więc nawigacja jest **siatką na tej samej siatce**, a nie navmeshem ani silnikiem fizyki. Wszystkie postacie pytają jeden moduł (`lib/navigation`): świat, edytor i mini-gry.

Dane, które już są:
- kształty bloków mają `walkable` i `blocksMovement` (`lib/voxel-shapes/shape-registry.ts`);
- obiekty mapy mają `collisionMode` (`blocking`, `walkable`, `trigger`, `none`) i `footprint` (szerokość i głębokość podstawy);
- `WorldQuery.groundAt` podaje dokładną wysokość gruntu (półbloki, schody i skosy liczone jak są, krawężniki przestępowane); wypiek zapisuje ją na kolumnę (format 3);
- format mapy ma pole `navigation` (węzły, krawędzie, trasy), dziś puste.

## Warstwy

### 1. Siatka nawigacji: gdzie wolno stać

Jedna komórka na kolumnę mapy (64 × 64). Każda ma:
- **wysokość gruntu** (`groundAt` w środku kolumny);
- **czy da się stać**: powierzchnia `walkable`, prześwit nad głową co najmniej wysokość postaci (2 bloki), żaden obiekt `blocking` nie zajmuje kolumny (podstawa z `footprint`, obrócona jak obiekt), nie woda;
- **koszt**: domyślnie 1; ścieżki i drogi taniej (postać woli ścieżki), trawa wysoka drożej; strefy mini-gier mogą mieć własne koszty;
- **przejścia do 8 sąsiadów**: dozwolone, gdy różnica wysokości jest najwyżej pół bloku (półblok, stopień schodów); wyżej to ściana, niżej spadek.

Gdzie liczona:
- **przy wypiekaniu** (`pnpm bake`) i zapisana w pliku wypieku: produkcja jej nie liczy;
- **na żywo** w edytorze i dla mapy bez wypieku, w workerze świata;
- **w edytorze jako nakładka**: zielone komórki do chodzenia, czerwone zablokowane, strzałki niedozwolonych przejść, żeby od razu było widać, gdzie postać może iść.

### 2. Wyznaczanie drogi

- **A\*** po siatce, 8 kierunków, bez ścinania rogów (ruch po skosie tylko, gdy obie sąsiednie komórki są wolne). Przy 4096 komórkach to ułamek milisekundy: bez hierarchii i bez cache.
- **Wygładzanie**: z drogi po kratkach zostają tylko punkty, między którymi nie ma prostej linii widoczności (`line of sight` po siatce); postać nie chodzi zygzakiem.
- **Cel niedostępny** (w drzewie, za ścianą, na dachu): najbliższa dostępna komórka.
- **Brak drogi** (cel na wyspie): przewodnik pojawia się na miejscu, jak przy dalekim skoku.

### 3. Poruszanie się po drodze

- Aktor (`lib/engine/actor.ts`) dostaje listę punktów zamiast jednego celu (`followPath`).
- Idzie do kolejnego punktu z wyprzedzeniem (skręca zanim do niego dojdzie), płynnie się obraca, zwalnia przy końcu.
- Wysokość z `groundAt` z wygładzeniem (już jest: ok. 0,1 s na stopień).
- Gdy coś zmieni się w trakcie (ruchomy obiekt), droga jest wyznaczana od nowa.

### 4. Kolizje (mini-gry: odwiedzający steruje postacią)

- **Kontroler postaci**: postać jako walec (kapsuła). Ruch rozdzielony na osie X i Z, każda sprawdzana osobno z siatką nawigacji i z prostokątami obiektów `blocking`; postać ślizga się wzdłuż przeszkody zamiast się zatrzymać. Wchodzi na stopnie do pół bloku, spada z wyższych (grawitacja), nie wchodzi tam, gdzie siatka mówi „nie”.
- **Fizyka** (pchanie, odbijanie, rzucanie obiektów) tylko jeśli konkretna mini-gra jej potrzebuje: Rapier (WASM, ok. 1 MB), ładowany wyłącznie w tej mini-grze, nigdy przy starcie świata.

### Później

- **Ruchome przeszkody**: obiekt, który się rusza, oznacza swoje komórki jako zajęte; postacie, których droga przez nie prowadzi, wyznaczają ją od nowa.
- **Wiele postaci**: omijanie się nawzajem (prosta odpychająca siła albo RVO), rezerwacja komórek na końcu drogi.
- **Ręczne węzły i trasy** (pole `navigation` mapy) nie do wyznaczania drogi, tylko jako **ciekawe miejsca i scenariusze**: „przewodnik prowadzi tą ścieżką do warsztatu”, „tu siada na ławce”, „tu czeka na odwiedzającego”.

## Dlaczego nie navmesh

Navmesh (Recast/Detour, np. `recast-navigation-js`) to standard dla dowolnej geometrii 3D. U nas świat jest już siatką, więc siatka nawigacji wynika z danych wprost, jest tania do policzenia, łatwa do pokazania w edytorze i do testowania, a navmesh byłby ciężkim WASM-em do problemu, którego nie mamy.

## API (szkic)

```ts
type NavGrid = {
  width: number; depth: number;
  standable(column: number, row: number): boolean;
  height(column: number, row: number): number;
  cost(column: number, row: number): number;
  canStep(fromColumn: number, fromRow: number, toColumn: number, toRow: number): boolean;
};
buildNavGrid(source: { query: WorldQuery; shapes; entities: PlacedMapEntity[]; agentHeight: number; maxStep: number }): NavGrid;
findPath(grid: NavGrid, from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number }[] | null;
nearestStandable(grid: NavGrid, point: { x: number; z: number }): { x: number; z: number } | null;
```

## Testy

- jednostkowe: droga omija zablokowane komórki, nie ścina rogów, nie wchodzi na stopień wyższy niż pół bloku, niedostępny cel daje najbliższą komórkę, wygładzona droga nie przechodzi przez przeszkodę;
- zgodność: siatka z wypieku taka sama jak policzona na żywo;
- e2e: przewodnik dochodzi do celu za drzewem bez wejścia w nie (pozycje sprawdzane co klatkę względem zajętych komórek).
