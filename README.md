# Lapkiosztás tervező

Böngészőben futó, telepítés nélküli **csempe-/lapkiosztás tervező** padló- és falburkoláshoz.
Szabálytalan alaprajzot rajzolsz, megadod a lapok és a fuga paramétereit, és az alkalmazás
legenerálja az optimális lapkiosztást — a vágott lapok pontos méreteivel és anyagkimutatással.

Tiszta **HTML + CSS + vanilla JavaScript** (HTML5 Canvas), build lépés és külső függőség nélkül.

## Funkciók

- **Alaprajz szerkesztő** – szabálytalan sokszög, rácsra illesztés, ortho mód, él hossz/szög
  szerkesztés a rajzon és listában, pont/él húzás-törlés.
- **Laptípus-könyvtár** – lapméret, szín vagy feltölthető kép-textúra (teljes lap / ismétlődő), fuga.
- **Kiosztás** – hálós és **téglakötés (eltolt)** minta, vágott lapok valós méretekkel, tájolás.
- **Optimalizálás** – esztétikus szélek (középre / minimum csík), levágott darabok újrahasznosítása,
  anyagkimutatás (terület, lapszám, hulladék, tartalék %).
- **Kivágások** – ajtó/ablak (nyílás) és nem-burkolt felület típusok, rajzolás/áthelyezés/törlés,
  L-alakú és különálló vágott darabok pontos jelölése.
- **Projektek** – több projekt és felület (pl. fürdő = padló + 4 fal), falak generálása a padlóból,
  megosztott laptípus-könyvtár.
- **Egyedi lapok** – egyes csempék színének/textúrájának felülírása festéssel.
- **Visszavonás/újra** (Ctrl+Z / Ctrl+Y).
- **Export** – PNG, PDF (projekt-összesítő), és JSON mentés/betöltés (projekt vagy teljes tár).

A munka automatikusan mentődik a böngészőbe (localStorage).

## Futtatás

Mivel statikus oldal, egy egyszerű HTTP-szerver elég:

```bash
python3 -m http.server 8000
```

Majd nyisd meg: `http://localhost:8000`

> Megjegyzés: a fájlt érdemes HTTP-szerverről megnyitni (nem közvetlenül a fájlrendszerből),
> hogy a böngésző ne tiltsa le a JavaScriptet.

## Fájlszerkezet

```
index.html      – az alkalmazás váza
css/styles.css  – megjelenés
js/editor.js    – a teljes logika
```
