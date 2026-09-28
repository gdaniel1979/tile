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
  test("planCuts gyári él szabállyal: csíkból 2 jön ki egy lapból, a gyári oldalak a lap szélén", () => {
    // 300×141-es falmelletti csík: a fal felőli (felső) oldala vágott, a másik három gyári kell legyen
    const strip = () => ({ w: 300, h: 141, fe: { t: false, r: true, b: true, l: true } });
    const pcs = [strip(), strip(), strip(), strip()];
    eq(tilesNeededForCuts(pcs, 300, 600, { factoryEdges: false }), 1, "szabály nélkül");
    const plan = planCuts(pcs, 300, 600, { factoryEdges: true });
    eq(plan.length, 2, "szabállyal");
    ok(plan.every((t) => t.pieces.some((p) => p.rot === 180)), "a második csík 180°-kal fordítva, a lap másik végéből");
  });
  test("planCuts sokszöggel: két fél-háromszög egy lapból (180°-kal fordítva)", () => {
    // 300×300-as lap átlója mentén levágott alsó-bal fél: befoglalója a teljes lap
    const tri = () => ({ w: 300, h: 300, poly: [{ x: 0, y: 0 }, { x: 0, y: 300 }, { x: 300, y: 300 }] });
    eq(tilesNeededForCuts([tri(), tri()], 300, 300), 1, "két félháromszög egy lap");
    eq(tilesNeededForCuts([tri(), tri(), tri()], 300, 300), 2, "három félháromszög két lap");
    // alak nélkül (csak befoglaló) továbbra is darabonként egy lap
    eq(tilesNeededForCuts([{ w: 300, h: 300 }, { w: 300, h: 300 }], 300, 300), 2, "befoglalóval");
  });
  test("átlós minta 30×30-as lappal 3×2 m-en: közel az elméleti minimumhoz", () => {
    setup(RECT(3000, 2000), { tileW: 300, tileH: 300, grout: 3, layout: { pattern: "diagonal" } });
    const s = computeLayout().stats;
    const min = Math.ceil(s.areaMm2 / (300 * 300));
    ok(s.tilesNeeded <= min * 1.1, `szükséges ${s.tilesNeeded}, elméleti minimum ${min} (+10% felett)`);
  });
  test("rotateEdges: 90/180/270° forgatás", () => {
    const fe = { t: true, r: false, b: false, l: false };
    eq(JSON.stringify(rotateEdges(fe, 90)), JSON.stringify({ t: false, r: true, b: false, l: false }), "90°: fent → jobb");
    eq(JSON.stringify(rotateEdges(fe, 180)), JSON.stringify({ t: false, r: false, b: true, l: false }), "180°: fent → lent");
    eq(JSON.stringify(rotateEdges(fe, 270)), JSON.stringify({ t: false, r: false, b: false, l: true }), "270°: fent → bal");
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
            if (a.poly && b.poly) {
              // valódi alakú (sokszög) darabok: a tényleges metszet-terület számít,
              // a mindkét irányú konvex-burok vágással (bármelyik konkáv is lehet)
              const A = polyShape(a.poly), B = polyShape(b.poly);
              ok(!polysOverlap(A, B) && !polysOverlap(B, A), `${a.code} és ${b.code} (sokszög) átfedik egymást`);
              return;
            }
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

  [["straight", {}], ["offset", { offsetPct: 33 }], ["diagonal", {}], ["herringbone", {}], ["herringbone", { herringboneTilted: true }]].forEach(([pattern, extra]) => {
    const label = pattern + (extra.herringboneTilted ? " (45°)" : "");
    test(`${label}: gyári él szabálynál minden gyári oldal a lap szélére esik`, () => {
      setup(L_SHAPE, { cutouts: [{ x: 500, y: 700, w: 600, h: 800 }], layout: Object.assign({ pattern }, extra) });
      const was = project.factoryEdges;
      try {
        project.factoryEdges = true;
        const r = computeLayout();
        let checked = 0;
        r.cutPlan.forEach((p) => p.tiles.forEach((t) => t.pieces.forEach((pc) => {
          const fe = pc.fe, T = 0.51;
          ok(!(fe.l && pc.x > T) && !(fe.t && pc.y > T) && !(fe.r && pc.x + pc.w < p.tileW - T) && !(fe.b && pc.y + pc.h < p.tileH - T),
            `${pc.code}: gyári élt igénylő oldal a lap belsejében`);
          checked++;
        })));
        ok(checked === r.stats.cut || pattern === "straight" || pattern === "offset", "minden darab ellenőrizve");
        project.factoryEdges = false;
        const r2 = computeLayout();
        ok(r2.stats.tilesNeeded <= r.stats.tilesNeeded, "szabály nélkül nem kell több lap");
      } finally { project.factoryEdges = was; }
    });
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

  // ---- árajánlat --------------------------------------------------------------
  test("computeQuote: munkadíj a tervből, egyedi tétel, ÁFA 27% és AAM, anyag ki/be", () => {
    setup(RECT(3000, 2000));
    render(); // a felület számai a cache-be (lastAreaMm2 = 6 m²)
    const q = projectQuote(project);
    const saved = JSON.stringify(q), savedPrice = state.tiles.types[0].pricePerTile;
    try {
      Object.assign(q, { includeMaterial: false, vat: "27", items: [{ name: "Bontás", qty: 2, unit: "óra", price: 5000 }] });
      q.labor = { floorM2: 10000, wallM2: 0, edgingM: 0, siliconeM: 0 };
      let r = computeQuote(project);
      eq(r.qty.floorM2, 6, "padló m²");
      eq(r.groups.map((g) => g.title).join(","), "Munkadíj,Egyéb tételek", "csoportok anyag nélkül");
      eq(r.net, 60000 + 10000, "nettó");
      eq(r.vatAmount, Math.round(70000 * 0.27), "ÁFA");
      eq(r.gross, 70000 + 18900, "bruttó");
      q.vat = "aam";
      r = computeQuote(project);
      eq(r.vatAmount, 0, "AAM: nincs ÁFA"); eq(r.gross, 70000, "AAM végösszeg");
      q.includeMaterial = true;
      state.tiles.types[0].pricePerTile = 1000;
      r = computeQuote(project);
      const mat = r.groups.find((g) => g.title === "Anyagok");
      ok(mat && mat.lines.some((l) => l.unit === "db" && l.price === 1000), "a lap bekerül az anyagok közé");
      ok(r.warnings.some((w) => /Csemperagasztó/.test(w)), "ár nélküli anyag figyelmeztetést ad");
      const costs = computeProjectCosts(project);
      eq(mat.lines.find((l) => l.unit === "db").total, costs.lines.find((l) => l.kind === "tiles").total, "ugyanaz, mint az Anyag fülön");
    } finally {
      project.quote = normQuote(JSON.parse(saved));
      state.tiles.types[0].pricePerTile = savedPrice;
    }
  });
  test("normQuote / normContractor: hiányzó mezők pótlása, hibás értékek kiszűrése", () => {
    const q = normQuote({ vat: "valami", validDays: -3, items: [null, { name: "x", qty: -1, price: "sok" }] });
    eq(q.vat, "27", "ÁFA alap"); eq(q.validDays, 30, "érvényesség alap"); eq(q.includeMaterial, true, "anyag alap");
    eq(q.items.length, 1, "érvénytelen tétel kiszűrve"); eq(q.items[0].qty, 0, "negatív menny."); eq(q.items[0].price, 0, "nem szám ár");
    eq(normContractor(null).name, "", "üres vállalkozó");
  });

  // ---- hibajavítások (2026-09-28) -----------------------------------------
  // A projekt-műveletek alert/confirm/prompt ablakot nyitnának: a tesztben elnyeljük.
  function quietly(fn) {
    const a = window.alert, c = window.confirm;
    window.alert = () => {}; window.confirm = () => true;
    try { return fn(); } finally { window.alert = a; window.confirm = c; }
  }
  // Friss projekt egy 4 élű, elnevezett padlóval (a teszt végén visszaáll az eredeti)
  function withFreshProject(fn) {
    const savedStore = JSON.stringify(serializeStore());
    try {
      quietly(() => {
        const p = defaultProject("Teszt");
        store.projects.push(p); store.activeProjectId = p.id; project = p; loadActiveSurface();
        state.points = RECT(3000, 2000).map(([x, y]) => ({ x, y })); state.closed = true;
        state.edgeNames.splice(0, state.edgeNames.length, "É", "K", "D", "NY");
        state.edgeEdgings.splice(0, state.edgeEdgings.length, false, true, false, false);
        saveActiveSurface();
        fn(p);
      });
    } finally {
      store = normalizeStore(JSON.parse(savedStore)); project = activeProject(); loadActiveSurface(); refreshAll({ keepView: true });
    }
  }

  test("csúcs beszúrása/törlése: az élnevek és élvédők a helyes élen maradnak", () => {
    withFreshProject(() => {
      insertVertexOnEdge(1, ...Object.values(worldToScreen({ x: 3000, y: 1000 })));
      eq(state.edgeNames.join(","), "É,K,K,D,NY", "beszúrás után (a kettévált él mindkét fele örököl)");
      eq(state.edgeEdgings.map(Number).join(""), "01100", "élvédő beszúrás után");
      deleteVertex(3); // a (3000,2000) sarok: a K (2.) és D él összeolvad
      eq(state.edgeNames.join(","), "É,K,K,NY", "törlés után");
    });
  });
  test("falak frissítése: a fal kivágásai és az előtétfal megmaradnak, megszűnt él fala törlődik", () => {
    withFreshProject((p) => {
      const floor = p.surfaces[0];
      generateWalls(floor, 2400);
      const wallK = p.surfaces.find((s) => s.fromFloorId === floor.id && s.fromEdgeIndex === 1);
      wallK.cutouts.push({ x: 100, y: 100, w: 500, h: 500, kind: "opening", name: "Ablak", edgeEdgings: [false, false, false, false] });
      p.activeIndex = p.surfaces.indexOf(wallK); loadActiveSurface();
      generatePreWallOnActive("Előtét", 0, 0, 800, 1200, 200);
      const pwCount = p.surfaces.filter((s) => s.parentSurfaceId === wallK.id).length;
      eq(pwCount, 4, "előtétfal felületei");
      floor.points[1].x = 3500; floor.points[2].x = 3500; // a padló szélesebb lett
      generateWalls(floor, 2400);
      const again = p.surfaces.find((s) => s.id === wallK.id);
      ok(again, "a fal ugyanaz a felület maradt (azonosító)");
      ok(again.cutouts.some((c) => c.name === "Ablak"), "a kivágás megmaradt");
      eq(p.surfaces.filter((s) => s.parentSurfaceId === wallK.id).length, 4, "az előtétfal megmaradt");
      const wallD = p.surfaces.find((s) => s.fromFloorId === floor.id && s.fromEdgeIndex === 0);
      eq(Math.round(wallD.points[1].x), 3500, "az É fal hossza frissült");
      // csúcs törlése a padlón → egy él megszűnik → a fala (és gyermekei) törlődnek frissítéskor
      p.activeIndex = p.surfaces.indexOf(floor); loadActiveSurface();
      deleteVertex(2); saveActiveSurface();
      generateWalls(floor, 2400);
      eq(p.surfaces.filter((s) => s.fromFloorId === floor.id).length, 3, "3 él → 3 fal");
    });
  });
  test("felület törlése a gyermek-felületeivel együtt (nincs láthatatlan árva)", () => {
    withFreshProject((p) => {
      const floor = p.surfaces[0];
      generateWalls(floor, 2400);
      const wall = p.surfaces.find((s) => s.fromFloorId === floor.id);
      p.activeIndex = p.surfaces.indexOf(wall); loadActiveSurface();
      generatePreWallOnActive("Előtét", 0, 0, 800, 1200, 200);
      const before = p.surfaces.length;
      deleteSurfaceFn(p.surfaces.indexOf(wall));
      eq(p.surfaces.length, before - 5, "a fal + 4 előtétfal-felület törlődött");
      ok(p.surfaces.every((s) => !s.parentSurfaceId || p.surfaces.some((x) => x.id === s.parentSurfaceId)), "nincs árva");
    });
  });
  test("normalizeProject: a régi mentésben lévő árva gyermek-felület felső szintre kerül", () => {
    const p = normalizeProject({ surfaces: [{ id: "a", name: "Fal" }, { id: "b", name: "Előtét", parentSurfaceId: "nincs-ilyen" }] });
    eq(p.surfaces[1].parentSurfaceId, null, "szülő");
  });
  test("tartalék %: projekt-szintű — a projekt-összesítés nem függ az aktív felülettől", () => {
    withFreshProject((p) => {
      const floor = p.surfaces[0];
      generateWalls(floor, 2400);
      recomputeAllSurfacesMaterial();
      p.overagePct = 15;
      const a = JSON.stringify(computeProjectCosts(p).lines.map((l) => l.qty));
      p.activeIndex = p.surfaces.length - 1; loadActiveSurface();
      const b = JSON.stringify(computeProjectCosts(p).lines.map((l) => l.qty));
      eq(a, b, "ugyanaz a mennyiség bármelyik felület aktív");
      eq(normalizeProject({ surfaces: [{ layout: { overagePct: 7 } }] }).overagePct, 7, "migráció a régi felület-értékből");
    });
  });
  test("visszavonás nem igazítja újra a nézetet", () => {
    setup(RECT(3000, 2000));
    save();
    state.view.scale = 0.37; state.view.ox = 123; state.view.oy = 45;
    state.points[1].x += 100; save();
    undo();
    eq(state.view.scale, 0.37, "nagyítás"); eq(state.view.ox, 123, "eltolás");
    redo();
  });

  window.__tileTestResults = results;
})();
