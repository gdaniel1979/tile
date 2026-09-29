# Lapkiosztás tervező

Böngészőben futó, telepítés nélküli **csempe- és lapkiosztás-tervező** padló- és falburkoláshoz.
Szabálytalan alaprajzot rajzolsz, megadod a lapok és a fuga paramétereit, és az alkalmazás
legenerálja a lapkiosztást — a vágott lapok pontos méreteivel, vágási tervvel, teljes körű
anyagkimutatással (lap, ragasztó, fuga, szilikon, élvédő) és árajánlattal.

Tiszta **HTML + CSS + vanilla JavaScript** (HTML5 Canvas), build-lépés és futásidejű külső függőség nélkül.

## Élő demó

**<https://gdaniel1979.github.io/tile/>**

Telepíthető alkalmazásként is (PWA): Chrome/Edge-ben a Fájl fül **Telepítés** gombjával, tableten/telefonon
„Hozzáadás a kezdőképernyőhöz”. Egyszeri online megnyitás után internet nélkül is működik. Ha az app
megnyitása óta új verzió jelent meg, alul „Új verzió érhető el — Frissítés” sáv jelzi.

## Felület

Windows 11 / Office-szerű elrendezés, világos és sötét témával (alapból a Windows beállítását követi):

- **Menüszalag** – Fájl, Rajzolás, Burkolat, Kiosztás, Anyag, Ajánlat, Nézet fülek, csoportosított
  ikon+felirat gombokkal; minden gomb fölött rövid magyarázat.
- **Két panel a vászon két oldalán** – *Tulajdonságok*: mindig az aktív menüszalag-fül részletei (élek,
  kivágások, laptípusok, összesítők, ajánlat-adatok); szemben a *Projektek és rétegek*: projektek, helyiségek
  és felületek fája + az aktív felület rétegei (kivágások). Alapból a Tulajdonságok bal oldalt; a Nézet fülön
  megcserélhetők, külön kapcsolhatók, a szélességük húzható.
- **Menüszalag összecsukása** (Ctrl+F1) és **teljes vászon mód** (Ctrl+Shift+F) a nagyobb rajzterületért.
- **Állapotsor** – terület, kerület, szükséges lapszám, hulladék, méretarány.
- **Érintőképernyő (tablet)** – koppintás, dupla koppintás, húzás, két ujjas csípés (2D és 3D).

## Funkciók

### Alaprajz és felületek
- **Alaprajz szerkesztő** – szabálytalan sokszög, rácsra illesztés, csak vízszintes/függőleges él-mód,
  élhossz és szög szerkesztése a rajzon és listában, pontok és élek húzása, beszúrása, törlése.
- **Több projekt, több felület** – egy projekthez tartozhat padló + falak; a falak egy gombnyomással
  generálhatók a padlóból, és a padló változásakor helyben frissíthetők (a falakon végzett munka megmarad).
  Előtétfal és lépcső generálása; projektek beolvasztása helyiségként.
- **Kivágások** – ajtó, ablak, nem burkolt terület; nyíláshoz kép is feltölthető; csoportosíthatók.

### Laptípusok és kiosztás
- **Laptípus-könyvtár** – méret, vastagság, ár, szín vagy kép-textúra; egy „alap” típus adja a rácsot,
  a többi az egyedi lapok festéséhez használható.
- **Kötésminták** – egyenes, eltolt (téglakötés), átlós 45°, halszálka (45°-osan elforgatva is).
- **Szél-igazítás** – „középre” vagy „minimum csík” a túl keskeny szélső csíkok ellen; kézi rács-eltolás.

### Vágási terv
- Minden vágott darab kódot kap (pl. **3a**), a kód a rajzon is megjeleníthető.
- **Téglalap-pakolás** – a maradékok többször is felhasználódnak; forgatható laptípusnál 90°-os forgatás.
- **Gyári él szabály** – a szomszédos lap felé mindig gyári él kerül, vágott él csak falhoz/kivágáshoz.
- Átlós és 45°-os halszálka mintánál a ferdén vágott darabok **valódi alakjukkal** párosulnak
  (pl. két fél-háromszög egy lapból).
- A PDF-ben laponként ábra: darabok, felhasználható maradék, hulladék, gyári élek.

### Anyag és ajánlat
- **Projekt-szintű összesítés** – burkolat laptípusonként, ragasztó (EN 12004 osztályok), fuga
  (cementes CG1/CG2 vagy Mapei Kerapoxy Easy Design epoxi), szilikon (padló–fal és fal–fal sarkok),
  élvédő profil; tartalék %, költségszámítás egységárakkal.
- **Árajánlat** – megrendelő, ajánlatadó, munkadíj a terv mennyiségeiből, egyedi tételek,
  27% ÁFA vagy alanyi adómentes; nyomtatható / PDF.

### Mentés és export
- **Automatikus mentés** a böngésző IndexedDB-jébe; visszavonás / újra (Ctrl+Z, Ctrl+Y).
- **Projektfájl (.lapterv)** – mint egy Excel-fájl: 1 fájl = 1 projekt (belül JSON). Megnyitás (Ctrl+O),
  Mentés (Ctrl+S), Mentés másként (Ctrl+Shift+S); több fájl lehet nyitva, a `*` jelzi a mentetlen változást,
  bezáráskor figyelmeztet. A telepített appban a .lapterv fájl dupla kattintással is megnyílik.
  Legutóbbi fájlok listája (10 db). Firefoxban / iPaden a Mentés letöltésként működik.
- **Biztonsági mentés** – az összes projekt egy JSON-fájlba, és visszaállítás belőle.
- **PNG** (aktív felület) és **PDF / nyomtatás** (teljes projekt: rajzok, számok, vágási terv, összesítő).
- **3D nézet** – a helyiség felületei térben, a saját kiosztásukkal; forgatható, nagyítható.

## Futtatás

Statikus oldal, bármilyen HTTP-szerver elég (a `file://` megnyitás az IndexedDB miatt nem ajánlott):

```bash
python3 -m http.server 8000
```

majd: <http://localhost:8000>

## Tesztek

A kiosztás-, vágásiterv-, anyag- és ajánlat-számítás tesztjei böngészőben futnak (Playwright, friss profillal):

```bash
python3 tests/run_tests.py [app-URL]
```

## Fájlszerkezet

```
index.html          – az alkalmazás váza (menüszalag, panelek, súgó)
css/styles.css      – megjelenés (világos/sötét téma CSS-változókkal)
js/modules/*.js     – az alkalmazás-logika témánként kis fájlokra bontva
tests/              – automatikus tesztek (layout.test.js + run_tests.py)
favicon.svg         – ikon
manifest.webmanifest, icons/ – PWA: alkalmazás-leíró és ikonok
sw.js               – service worker: „hálózat először”, offline a gyorsítótárból
```

A `js/modules/` fájljai klasszikus `<script>` tagként, az `index.html`-ben megadott sorrendben töltődnek
be (közös globális scope, nincs modulrendszer) — a sorrend számít. Az `init()` a `34-init.js`-ben fut.
Az ikonok a Microsoft **Fluent UI System Icons** készletből valók (MIT licenc), beépítve a
`00-icons.js`-be.

## Adattárolás

Minden módosítás automatikusan a böngésző **IndexedDB**-jébe mentődik. A tárolás **origin-alapú** —
a `http://localhost:8000` és a `https://gdaniel1979.github.io` külön adatkészletet lát. Költözéskor
használd a Fájl fül „Összes projekt mentése” gombját, majd az új helyen a „Visszaállítás…” gombot.
A megnyitott .lapterv fájlok handle-jei (File System Access API) szintén az IndexedDB-ben vannak, így
újraindítás után is ugyanabba a fájlba ment a Ctrl+S (a böngésző ilyenkor egyszer engedélyt kérhet).
