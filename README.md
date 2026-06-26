# Lapkiosztás tervező

Böngészőben futó, telepítés nélküli **csempe- és lapkiosztás-tervező** padló- és falburkoláshoz.
Szabálytalan alaprajzot rajzolsz, megadod a lapok és a fuga paramétereit, és az alkalmazás
legenerálja az optimális lapkiosztást — a vágott lapok pontos méreteivel, valamint teljes körű
anyagkimutatással (lap, fuga, szilikon).

Tiszta **HTML + CSS + vanilla JavaScript** (HTML5 Canvas), build lépés és külső függőség nélkül.

## Élő demó

**<https://gdaniel1979.github.io/tile/>**

Minden push után pár percen belül automatikusan frissül.

## Funkciók

### Alaprajz és felületek
- **Alaprajz szerkesztő** – szabálytalan sokszög, rácsra illesztés, ortogonális (csak vízszintes/függőleges)
  él-mód, élhossz és szög szerkesztése a rajzon és listában, pontok és élek húzása, törlése.
- **Több projekt, több felület** – egy projekthez tartozhat padló + falak (pl. fürdőszoba = padló + 4 fal).
  A falak egy gombnyomással generálhatók a padlóból (minden élhez egy fal-felület készül a megadott
  magassággal). A projekt-fában bármelyik projekt ki- és becsukható.
- **Kivágások** – ajtó- és ablaknyílások, illetve nem burkolandó területek megadása. A nyíláshoz tetszőleges
  kép (PNG/JPG/SVG) feltölthető — pl. ajtó- vagy ablakrajz —, ami kitölti a kivágás területét.

### Laptípusok
- **Laptípus-könyvtár** – tetszőleges számú laptípus projektenként: méret, vastagság, szín
  vagy kép-textúra (teljes lap vagy ismétlődő mintázat). Egy „alap" típus hajtja a rácsot,
  a többi az „egyedi lapok" festéséhez használható.
- **Egyedi lapok** – egyes cellák színének vagy textúrájának felülírása festő-móddal.

### Kötésminták
- **Egyenes (hálós)** – klasszikus rács.
- **Eltolt / téglakötés** – soronkénti x-eltolódás állítható százalékkal (½, ⅓ gyors beállítással).
- **Átlós (45°)** – a teljes rács 45°-osan elforgatva.
- **Halszálka** – klasszikus block halszálka (pgg-szimmetriájú konstrukció, ferde 2D-rácson),
  és opcionálisan **45°-osan elforgatva** is.

### Optimalizálás
- **Szél-igazítás** – „középre" vagy „minimum csík" mód a túl keskeny szélső csíkok elkerülésére.
- **Vágott lapok újrahasznosítása** – egy lapból a levágott darab mellett a maradék (ha elég nagy)
  egy másik szélső helyre felhasználható.
- **Vágott lapok méretezése** – pontos méret minden vágott darabra (téglalap vagy L-alakú);
  egyenetlen, többdarabos vágásnál a befoglaló és belső méret is megjelenik.

### Anyagszámítás (Anyag fül)
A projekt minden felületét egyszerre összesíti:

- **Burkolat** – burkolt terület, szükséges lapszám, hulladék %, tartalékkal növelt mennyiség.
  Laptípusonként külön bontva (figyelembe véve az egyedi-lap festéseket is).
- **Fuga** – geometriailag pontos számítás (a vágott lapok élhosszait is figyelembe véve).
  Választható preset: cementes (CG1, CG2) vagy **Mapei Kerapoxy Easy Design** (epoxi).
  Eredmény kg-ban és csomag-szükségletben (3 kg vödör / 5 kg zsák).
- **Szilikon** – a padló–fal és fal–fal találkozásoknál (negatív sarkok). Hossz méterben,
  szükséges kartus-szám (állítható kartus-méret, hézag-szélesség és -mélység).

### Mentés és export
- **Automatikus mentés** a böngésző IndexedDB-jébe (~500 MB+ tárhely; sok feltöltött kép-textúra is fér).
- **JSON export/import** – egy aktív projekt vagy a teljes tár mentése fájlba és visszatöltése.
- **PNG export** – az aktív felület rajza.
- **PDF / nyomtatás** – a teljes projekt: minden felület rajza + felületenkénti vágási lista +
  összesítő oldal a teljes anyagszükséglettel.

### Egyéb
- **Visszavonás / újra** – Ctrl+Z és Ctrl+Y, vagy a cím-sorban a kis ikongombok.
- **Vászon-fejléc** – mindig látszik az aktív projekt és felület neve.

## Futtatás

Mivel statikus oldal, egy egyszerű HTTP-szerver is elég a futtatáshoz:

```bash
python3 -m http.server 8000
```

Majd nyisd meg: `http://localhost:8000`

> Megjegyzés: érdemes HTTP-szerverről megnyitni (nem közvetlenül a fájlrendszerből, `file://`-ról),
> mert egyébként a böngésző egyes biztonsági szabályok miatt nem futtatja a JavaScriptet.

## Fájlszerkezet

```
index.html      – az alkalmazás váza
css/styles.css  – megjelenés
js/editor.js    – a teljes alkalmazás-logika
favicon.svg     – a böngésző-fülön megjelenő ikon
```

## Adattárolás

Az alkalmazás minden módosítást automatikusan ment a böngésző **IndexedDB**-jébe.
A korábbi localStorage-ban tárolt projektek első indításkor automatikusan átkerülnek
az új tárolóba (a localStorage-ben biztonsági másolatként megmaradnak).

A tárolás **origin-alapú** — a `http://localhost:8000` és a `https://gdaniel1979.github.io`
külön adatkészletet lát. Költözéskor használd az Export fül „Összes projekt mentése (JSON)"
gombját, majd az új helyen „Betöltés (JSON)" gombbal töltsd vissza.
