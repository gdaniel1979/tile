/* =========================================================================
   Lapkiosztás tervező
   Minden hossz BELSŐLEG milliméterben tárolódik. A megjelenítés cm/mm.
   Ez a fájl egy 32 darabra szétszedett editor.js egyik szelete — a fájlok
   sorrendje az index.html script-tag-jeiben számít (közös globális scope,
   nincs import/export, nincs build-lépés).
   ========================================================================= */
"use strict";
  // ---- Állapot -----------------------------------------------------------
  const state = {
    points: [],        // [{x, y}] mm-ben, világkoordináta
    closed: false,
    mode: "floor",     // "floor" | "wall"
    unit: "cm",        // "cm" | "mm"
    snap: true,
    gridMm: 100,       // rácsméret mm-ben (alap: 10 cm)
    ortho: false,
    selected: null,    // kijelölt csúcs indexe
    view: { scale: 0.15, ox: 0, oy: 0 }, // px/mm, és képernyő-origó offszet
    tiles: defaultTiles(),  // burkolat / laptípus könyvtár (2. fázis)
    layout: {
      show: true, offXmm: 0, offYmm: 0, rotated: false, // kiosztás (3. fázis)
      alignMode: "none", thresholdMm: 100, overagePct: 10, // optimalizálás (4. fázis)
      overrides: {}, paintTypeId: null, // egyedi lapok (5. fázis): "i_j" -> typeId
    },
  };

  function defaultTiles() {
    return {
      groutMm: 3,
      groutColor: "#cfcfcf",
      baseId: "t1",
      types: [{
        id: "t1", name: "Alap lap",
        wMm: 300, hMm: 600,
        thicknessMm: 8,               // lapvastagság mm-ben (fuga- és szilikon-térfogathoz)
        pricePerTile: 0,              // Ft/db (költségszámításhoz, 0 = nincs ár)
        fillKind: "color",            // "color" | "image"
        color: "#b9c4cf",
        imageUrl: null,
        imageMode: "full",            // "full" | "repeat"
      }],
    };
  }

  const TILE_PALETTE = ["#b9c4cf", "#d9c2a6", "#a6c2b0", "#c9a6b8", "#9fb1cc", "#cbb89a", "#9ec9c4"];

  const STORAGE_KEY = "tile-planner-phase1";

