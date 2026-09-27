/* =========================================================================
   Kiosztás- és számítás-tesztek. Az app globális függvényeit használja, ezért
   a betöltött app oldalába kell injektálni — a futtató: tests/run_tests.py
   (Playwright, friss böngésző-profil, így a valódi mentett adatokhoz nem nyúl).
   ========================================================================= */
"use strict";
(function () {
  const results = [];
  function test(name, fn) {
    try { fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, msg: e && e.message || String(e) }); }
  }
  function eq(actual, expected, what) {
    if (actual !== expected) throw new Error(`${what || "érték"}: várt ${expected}, kapott ${actual}`);
  }
  function near(actual, expected, tol, what) {
    if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${what || "érték"}: várt ${expected}±${tol}, kapott ${actual}`);
  }
  function ok(cond, what) { if (!cond) throw new Error(what || "feltétel nem teljesül"); }

  // Tiszta, determinisztikus kiinduló állapot egy felületen
  function setup(pts, opts) {
    opts = opts || {};
    state.points = pts.map(([x, y]) => ({ x, y }));
    state.closed = true;
    state.cutouts.length = 0;
    (opts.cutouts || []).forEach((c) => state.cutouts.push(Object.assign({ kind: "opening", name: "", edgeEdgings: [false, false, false, false] }, c)));
    const base = state.tiles.types.find((t) => t.id === state.tiles.baseId);
    base.wMm = opts.tileW || 300; base.hMm = opts.tileH || 600;
    state.tiles.groutMm = opts.grout != null ? opts.grout : 3;
    Object.assign(state.layout, {
      pattern: "straight", offsetPct: 50, herringboneTilted: false, alignMode: "none",
      thresholdMm: 100, offXmm: 0, offYmm: 0, rotated: false, overrides: {}, show: true,
    }, opts.layout || {});
  }
  const RECT = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]];
  const L_SHAPE = [[0, 0], [5000, 0], [5000, 2000], [2500, 2000], [2500, 4000], [0, 4000]];

  // ---- tiszta segédfüggvények ----------------------------------------------
  test("alignAxis: 'center' szimmetrikus szélső csíkot ad", () => {
    // L=1000, T=300, fuga 3 → 3 teljes lap: csík = (1000-900-12)/2 = 44 → eltolás 47
    near(alignAxis(1000, 300, 3, "center", 100), 47, 1e-9, "eltolás");
  });
  test("alignAxis: 'min' kerüli a küszöb alatti csíkot", () => {
    // 3 lappal 44 mm-es csík < 100 → 2 lap: csík = (1000-600-9)/2 = 195.5
    near(alignAxis(1000, 300, 3, "min", 100), 198.5, 1e-9, "eltolás");
  });
  test("tilesNeededForCuts: a maradék újrahasznosul", () => {
    // két 300×250-es darab egy 300×600-as lapból kijön
    eq(tilesNeededForCuts([{ w: 300, h: 250 }, { w: 300, h: 250 }], 300, 600), 1, "lapszám");
    // két 300×400-as már nem
    eq(tilesNeededForCuts([{ w: 300, h: 400 }, { w: 300, h: 400 }], 300, 600), 2, "lapszám");
  });
  test("planCuts: a maradék többször is felhasználható", () => {
    // négy 300×140-es csík egy 300×600-as lapból (régen csak 2 jött ki egy lapból)
    const four = Array.from({ length: 4 }, () => ({ w: 300, h: 140 }));
    eq(tilesNeededForCuts(four, 300, 600), 1, "lapszám");
    // hat 140×280-as darab: 2 oszlop × 2 sor fér egy lapra → 2 lap
    eq(tilesNeededForCuts(Array.from({ length: 6 }, () => ({ w: 140, h: 280 })), 300, 600), 2, "lapszám");
  });
  test("planCuts: forgatás csak ha engedélyezett", () => {
    // 300×450-es darab után 300×150-es maradék marad; a 140×290-es darab
    // csak elforgatva (290×140) fér bele
    const pcs = [{ w: 300, h: 450 }, { w: 140, h: 290 }];
    eq(tilesNeededForCuts(pcs, 300, 600, { rotate: false }), 2, "forgatás nélkül");
    eq(tilesNeededForCuts(pcs, 300, 600, { rotate: true }), 1, "forgatással");
    const plan = planCuts(pcs, 300, 600, { rotate: true });
    ok(plan[0].pieces.some((p) => p.rot), "a forgatott darab jelölve");
  });
  test("tileRotatable: alapérték színes lapnál igen, képesnél nem; kézi beállítás felülírja", () => {
    eq(tileRotatable({ fillKind: "color" }), true, "szín");
    eq(tileRotatable({ fillKind: "image" }), false, "kép");
    eq(tileRotatable({ fillKind: "image", rotatable: true }), true, "kézi");
    eq(tileRotatable({ fillKind: "color", rotatable: false }), false, "kézi");
  });
  test("clipPolygonRect: L-alak és téglalap metszete", () => {
    const pts = L_SHAPE.map(([x, y]) => ({ x, y }));
    const piece = clipPolygonRect(pts, 2000, 1500, 3000, 2500);
    let a = 0;
    for (let i = 0; i < piece.length; i++) { const p = piece[i], q = piece[(i + 1) % piece.length]; a += p.x * q.y - q.x * p.y; }
    // a 1000×1000-es ablakból a belső sarok miatt 1000×500 + 500×500 esik bele
    near(Math.abs(a) / 2, 750000, 1e-6, "terület");
  });

  test("cutoutsAreaMm2: átfedő kivágás egyszer, a felületről kilógó rész nem számít", () => {
    // két 400×400-as kivágás 200×200-as átfedéssel: 2·160000 − 40000
    setup(RECT(4000, 3000), { cutouts: [{ x: 1000, y: 1000, w: 400, h: 400 }, { x: 1200, y: 1200, w: 400, h: 400 }] });
    near(cutoutsAreaMm2(), 280000, 1e-6, "átfedés");
    // a felület szélén félig kilógó 400×400-as kivágás: csak a bent lévő 200×400
    setup(RECT(4000, 3000), { cutouts: [{ x: 3800, y: 1000, w: 400, h: 400 }] });
    near(cutoutsAreaMm2(), 80000, 1e-6, "kilógás");
  });

  // ---- computeLayout ---------------------------------------------------------
  test("egyenes: kézzel ellenőrzött kis helyiség (3 egész + 1 vágott)", () => {
    // 1203×603 mm, 300×600-as lap, 3 mm fuga, 0 eltolás:
    // x = 0, 303, 606 teljes; 909-től 1203-ig 294 mm-es vágott lap
    setup(RECT(1203, 603));
    const r = computeLayout();
    eq(r.stats.whole, 3, "egész"); eq(r.stats.cut, 1, "vágott"); eq(r.stats.tilesNeeded, 4, "szükséges");
    eq(r.cutLabels.length, 1, "vágott darabok");
    near(r.cutLabels[0].w, 294, 1e-6, "vágott szélesség"); near(r.cutLabels[0].h, 600, 1e-6, "vágott magasság");
    near(r.stats.areaMm2, 1203 * 603, 1e-6, "terület");
  });
  test("egyenes: kivágás csökkenti a területet és vágott lapot okoz", () => {
    setup(RECT(1203, 603), { cutouts: [{ x: 0, y: 0, w: 150, h: 150 }] });
    const r = computeLayout();
    near(r.stats.areaMm2, 1203 * 603 - 150 * 150, 1e-6, "terület");
    eq(r.stats.whole, 2, "egész"); eq(r.stats.cut, 2, "vágott");
  });

  const PATTERNS = [
    ["straight", {}], ["offset", { offsetPct: 33 }], ["diagonal", {}],
    ["herringbone", {}], ["herringbone", { herringboneTilted: true }],
  ];
  PATTERNS.forEach(([pattern, extra]) => {
    const label = pattern + (extra.herringboneTilted ? " (45°)" : "");
    test(`${label}: alap-invariánsok L-alakú helyiségen`, () => {
      setup(L_SHAPE, { cutouts: [{ x: 500, y: 700, w: 600, h: 800 }], layout: Object.assign({ pattern }, extra) });
      const r = computeLayout();
      const s = r.stats;
      eq(s.whole + s.cut, s.total, "egész + vágott = összes");
      eq(r.tiles.length, s.total, "lerakott lapok száma");
      eq(r.cutLabels.length >= s.cut, true, "minden vágott laphoz van felirat");
      ok(s.tilesNeeded >= s.whole, "szükséges ≥ egész");
      ok(s.tilesNeeded <= s.total, "szükséges ≤ lerakott (újrahasznosítás nem növel)");
      ok(s.groutAreaMm2 >= 0, "fuga-terület nem negatív");
      const byTypeNeeded = Object.values(s.byType).reduce((a, t) => a + t.needed, 0);
      eq(byTypeNeeded, s.tilesNeeded, "típusonkénti szükséglet összege");
    });
  });

  test("halszálka: a vágott darabok a lap tájolásában (hosszú × rövid) számolódnak", () => {
    // az álló (V) lapok darabjait elforgatva kell az újrahasznosításnak átadni,
    // különben pl. egy 50×500-as darab nem fér egy 600×300-as lapba
    [false, true].forEach((tilted) => {
      setup(L_SHAPE, { layout: { pattern: "herringbone", herringboneTilted: tilted } });
      const r = computeLayout();
      ok(r.needPieces.length === r.stats.cut, "minden vágott laphoz egy darab");
      r.needPieces.forEach((p) => {
        ok(p.w <= 600 + 0.5 && p.h <= 300 + 0.5, `darab ${p.w.toFixed(0)}×${p.h.toFixed(0)} nem fér a 600×300-as lapba`);
      });
    });
  });

  // A fuga/terület arány elméletileg 1 - (300·600)/(303·603) ≈ 1,48 %. Ha a
  // kivágás melletti lapok kimaradnak (foltok) vagy a kivágásba lógó részük
  // is beszámít, az arány elcsúszik (régen: átlósnál 0 %, halszálkánál 0–4 %).
  [["straight", {}], ["diagonal", {}], ["herringbone", {}], ["herringbone", { herringboneTilted: true }]].forEach(([pattern, extra]) => {
    const label = pattern + (extra.herringboneTilted ? " (45°)" : "");
    test(`${label}: kivágások mellett is helyes a fuga-arány (nincs kimaradt lap)`, () => {
      setup(RECT(4000, 3000), {
        cutouts: [{ x: 1000, y: 800, w: 700, h: 900 }, { x: 2500, y: 1500, w: 400, h: 400 }, { x: 2700, y: 1700, w: 400, h: 400 }],
        layout: Object.assign({ pattern }, extra),
      });
      const s = computeLayout().stats;
      const pct = 100 * s.groutAreaMm2 / s.areaMm2;
      ok(pct > 1.3 && pct < 1.7, `fuga-arány ${pct.toFixed(2)} % (várt ≈ 1,48 %)`);
    });
  });

  test("halszálka: festés a megfelelő lapra kerül és megjelenik a statisztikában", () => {
    setup(RECT(4000, 3000), { layout: { pattern: "herringbone" } });
    if (!state.tiles.types.some((t) => t.id === "tDekor")) {
      state.tiles.types.push({ id: "tDekor", name: "Dekor", wMm: 300, hMm: 600, thicknessMm: 8, pricePerTile: 0, fillKind: "color", color: "#c33", imageUrl: null, imageMode: "full" });
    }
    state.layout.paintTypeId = "tDekor";
    ok(applyPaintAt(2000, 1500), "a festés változtatott");
    const key = Object.keys(state.layout.overrides)[0];
    ok(/^-?\d+_-?\d+_[0-3]$/.test(key), `halszálka-kulcs (i_j_idx), kapott: ${key}`);
    const r = computeLayout();
    const t = r.tiles.find((x) => x.key === key);
    ok(t && t.typeId === "tDekor" && pointInPolygon(2000, 1500, t.quad), "a kattintott lap lett festve");
    ok(r.stats.byType.tDekor && r.stats.byType.tDekor.whole + r.stats.byType.tDekor.cut === 1, "egy dekor lap a statisztikában");
    state.layout.paintTypeId = null;
  });

  test("négyzetes lap halszálkában: degenerált eredmény, nincs statisztika", () => {
    setup(RECT(2000, 2000), { tileW: 300, tileH: 300, layout: { pattern: "herringbone" } });
    const r = computeLayout();
    eq(r.degenerate, true, "degenerált"); eq(r.stats, null, "statisztika");
  });

  // ---- vágási terv ----------------------------------------------------------
  [["straight", {}], ["diagonal", {}], ["herringbone", {}]].forEach(([pattern]) => {
    test(`${pattern}: a vágási terv egyezik a lapszükséglettel, a darabok elférnek és nem fedik egymást`, () => {
      setup(L_SHAPE, { cutouts: [{ x: 500, y: 700, w: 600, h: 800 }], layout: { pattern } });
      if (!state.tiles.types.some((t) => t.id === "tDekor")) {
        state.tiles.types.push({ id: "tDekor", name: "Dekor", wMm: 300, hMm: 600, thicknessMm: 8, pricePerTile: 0, fillKind: "color", color: "#c33", imageUrl: null, imageMode: "full" });
      }
      state.layout.overrides = pattern === "herringbone" ? { "0_0_1": "tDekor", "1_1_2": "tDekor" } : { "0_0": "tDekor", "3_2": "tDekor" };
      const r = computeLayout();
      const planTiles = r.cutPlan.reduce((n, p) => n + p.tiles.length, 0);
      eq(r.stats.whole + planTiles, r.stats.tilesNeeded, "egész + terv lapjai = szükséges");
      ok(r.cutLabels.every((c) => /^\d+[a-z]$/.test(c.code)), "minden vágott darabnak van kódja");
      eq(new Set(r.cutLabels.map((c) => c.code)).size, r.cutLabels.length, "a kódok egyediek");
      r.cutPlan.forEach((p) => p.tiles.forEach((t) => {
        t.pieces.forEach((a, i) => {
          ok(a.x >= -0.01 && a.y >= -0.01 && a.x + a.w <= p.tileW + 0.51 && a.y + a.h <= p.tileH + 0.51, `${a.code} kilóg a lapból`);
          ok(r.needPieces[a.li].typeId === p.typeId, `${a.code} más típusú lapból van vágva`);
          t.pieces.slice(i + 1).forEach((b) => {
            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            ok(!(ox > 0.51 && oy > 0.51), `${a.code} és ${b.code} átfedik egymást`);
          });
        });
      }));
      state.layout.overrides = {};
    });
  });

  test("normLayout: a vágási kódok kapcsoló mentődik, alapból ki", () => {
    eq(normLayout({}).showCodes, false, "alap");
    eq(normLayout({ showCodes: true }).showCodes, true, "bekapcsolva");
  });

  // ---- gyorsítótár --------------------------------------------------------
  test("getLayout: nézet-váltás (zoom/pan) nem számol újra, geometria-változás igen", () => {
    setup(RECT(3000, 2000));
    const a = getLayout();
    state.view.scale *= 2; state.view.ox += 50;
    eq(getLayout(), a, "ugyanaz az eredmény-objektum nézetváltás után");
    state.points[1].x += 100;
    ok(getLayout() !== a, "új eredmény pont-mozgatás után");
    const b = getLayout();
    state.layout.overrides["0_0"] = state.tiles.baseId;
    ok(getLayout() !== b, "új eredmény festés után");
  });

  // ---- 6. hiba: elrejtett kiosztás is számít ---------------------------------
  test("elrejtett kiosztás (show=false) is bekerül az anyagszámításba", () => {
    setup(RECT(3000, 2000));
    render();
    const s = project.surfaces[project.activeIndex];
    const visibleNeeded = s.lastTilesNeeded;
    ok(visibleNeeded > 0, "látható kiosztásnál van szükséglet");
    state.layout.show = false;
    render();
    eq(s.lastTilesNeeded, visibleNeeded, "elrejtve is ugyanannyi");
    ok(lastStats && lastStats.tilesNeeded === visibleNeeded, "export-statisztika is megvan");
    recomputeAllSurfacesMaterial();
    eq(project.surfaces[project.activeIndex].lastTilesNeeded, visibleNeeded, "projekt-szintű újraszámolás után is");
    state.layout.show = true;
  });

  // ---- kivágás-törlés ------------------------------------------------------
  const CUT = (x, extra) => Object.assign({ x, y: 100, w: 200, h: 200 }, extra || {});
  test("removeCutouts: a kijelölés követi az eltolódott indexet", () => {
    setup(RECT(3000, 2000), { cutouts: [CUT(100), CUT(500), CUT(900)] });
    selectedCutout = 2;
    removeCutouts([0]);
    eq(state.cutouts.length, 2, "maradt"); eq(selectedCutout, 1, "kijelölés");
    eq(state.cutouts[selectedCutout].x, 900, "ugyanaz a kivágás maradt kijelölve");
    removeCutouts([1]);
    eq(selectedCutout, -1, "törölt kijelölés megszűnik");
    selectedCutout = -1;
  });
  test("Delete billentyű: kijelölt csoport egészben törlődik", () => {
    setup(RECT(3000, 2000), { cutouts: [CUT(100, { groupId: "g1" }), CUT(500), CUT(900, { groupId: "g1" })] });
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    selectedCutout = 2;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    eq(state.cutouts.length, 1, "maradt"); eq(state.cutouts[0].x, 500, "a csoporton kívüli maradt");
    eq(selectedCutout, -1, "kijelölés");
  });

  window.__tileTestResults = results;
})();
