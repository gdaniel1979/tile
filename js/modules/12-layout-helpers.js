"use strict";
  const REPEAT_MM = 100;       // egy ismétlődés fizikai mérete (repeat mód)
  const imageCache = {};       // dataURL -> { img, loaded }

  function baseTile() {
    const t = state.tiles;
    return t.types.find((x) => x.id === t.baseId) || t.types[0] || null;
  }

  function getImage(url) {
    if (!url) return null;
    let e = imageCache[url];
    if (e) return e.loaded ? e.img : null;
    const img = new Image();
    e = { img, loaded: false };
    imageCache[url] = e;
    img.onload = () => { e.loaded = true; render(); };
    img.src = url;
    return null;
  }

  // Feltöltött kép lekicsinyítése (max. méret px), hogy elférjen a localStorage-ban
  function downscaleImage(dataUrl, maxDim, cb) {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      const scale = Math.min(1, maxDim / Math.max(w, h, 1));
      if (scale >= 1) { cb(dataUrl); return; } // már elég kicsi
      const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
      const cv = document.createElement("canvas");
      cv.width = cw; cv.height = ch;
      cv.getContext("2d").drawImage(img, 0, 0, cw, ch);
      try { cb(cv.toDataURL("image/jpeg", 0.82)); }
      catch (_) { cb(dataUrl); }
    };
    img.onerror = () => cb(dataUrl);
    img.src = dataUrl;
  }

  function pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      const hit = ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  function polygonScreenPath() {
    ctx.beginPath();
    state.points.forEach((pt, i) => {
      const s = worldToScreen(pt);
      i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
  }

  // Sokszög levágása egy (konvex) téglalapra – Sutherland–Hodgman.
  // A subject lehet konkáv is; a clip (téglalap) konvex. Visszaadja a metszet
  // sokszögét, amiből a vágott lap befoglaló mérete számolható.
  function clipPolygonRect(subject, x0, y0, x1, y1) {
    function clip(pts, inside, intersect) {
      const res = [];
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const cur = pts[i];
        const prev = pts[(i + n - 1) % n];
        const curIn = inside(cur), prevIn = inside(prev);
        if (curIn) {
          if (!prevIn) res.push(intersect(prev, cur));
          res.push(cur);
        } else if (prevIn) {
          res.push(intersect(prev, cur));
        }
      }
      return res;
    }
    let p = subject;
    p = clip(p, (q) => q.x >= x0, (a, b) => { const t = (x0 - a.x) / (b.x - a.x); return { x: x0, y: a.y + t * (b.y - a.y) }; });
    if (p.length < 3) return p;
    p = clip(p, (q) => q.x <= x1, (a, b) => { const t = (x1 - a.x) / (b.x - a.x); return { x: x1, y: a.y + t * (b.y - a.y) }; });
    if (p.length < 3) return p;
    p = clip(p, (q) => q.y >= y0, (a, b) => { const t = (y0 - a.y) / (b.y - a.y); return { x: a.x + t * (b.x - a.x), y: y0 }; });
    if (p.length < 3) return p;
    p = clip(p, (q) => q.y <= y1, (a, b) => { const t = (y1 - a.y) / (b.y - a.y); return { x: a.x + t * (b.x - a.x), y: y1 }; });
    return p;
  }

  // Vágott darab méretének felirata (W×H a kijelzett egységben)
  function polyArea(pts) {
    let s = 0;
    for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; s += a.x * b.y - b.x * a.y; }
    return Math.abs(s) / 2;
  }

  function fmtDim(wmm, hmm) {
    const f = (mm) => (state.unit === "cm" ? (mm / 10).toFixed(1) : String(Math.round(mm)));
    return f(wmm) + "×" + f(hmm);
  }

  function drawCutLabel(text, x, y) {
    ctx.font = "10px system-ui, sans-serif";
    const tw = ctx.measureText(text).width;
    const bw = tw + 6, bh = 14;
    ctx.fillStyle = "rgba(15,20,25,0.78)";
    roundRect(x - bw / 2, y - bh / 2, bw, bh, 3);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  // Kétsoros felirat (PDF-rajz): felül a vágási terv kódja, alatta a méret —
  // keskenyebb, mint egy sorban, így a szélső csíkokon sem csúsznak össze.
  function drawCodeCutLabel(code, text, x, y) {
    ctx.font = "10px system-ui, sans-serif";
    const tw = Math.max(ctx.measureText(text).width, ctx.measureText(code).width + 2);
    const bw = tw + 6, bh = 25;
    ctx.fillStyle = "rgba(15,20,25,0.78)";
    roundRect(x - bw / 2, y - bh / 2, bw, bh, 3);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.fillText(code, x, y - 5.5);
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText(text, x, y + 6);
  }

  // Egy tengely automatikus eltolása (mm) a szél-igazítási mód szerint.
  // L = befoglaló méret, T = lapméret, grout = fuga; visszaadja az eltolást [0,P).
  function alignAxis(L, T, grout, mode, thrMm) {
    const P = T + grout;
    if (P <= 0 || L <= 0) return 0;
    const stripFor = (n) => (L - n * T - (n + 1) * grout) / 2; // szimmetrikus szélső csík
    let n = Math.floor((L - grout) / P); // max teljes lap, szimmetrikus elrendezésnél
    if (n < 0) n = 0;
    if (mode === "min") {
      // csökkentsük n-t, amíg a szélső csík el nem éri a küszöböt (vagy ~0 = teljes szél)
      while (n > 0) {
        const s = stripFor(n);
        if (s <= 1 || s >= thrMm) break;
        n--;
      }
    }
    let strip = stripFor(n);
    if (strip < 0) strip = 0;
    const off = strip + grout; // az első teljes lap bal éle a minX-hez képest
    return ((off % P) + P) % P;
  }

  // Vágási terv: melyik vágott darab melyik lapból, hol jön ki.
  // Téglalap-pakolás (guillotine): minden lap szabad téglalapokat tart
  // nyilván; egy darab abba a szabad részbe kerül (bármelyik már megkezdett
  // lapon), ahol a legkevesebb marad (best area fit), ha nincs ilyen, új lap
  // kezdődik. Vágás után a szabad rész két csíkra bomlik (egyenes, végigmenő
  // vágások — mint a valóságban), és mindkettő újra felhasználható.
  // opts.rotate: a darab 90°-kal elforgatva is kivágható (nincs mintairány).
  // Több darab-sorrendet kipróbál, és a legkevesebb lapot adót választja.
  // pieces: [{ w, h, ... }] → [{ pieces: [{ i, x, y, w, h, rot }], free: [{ x, y, w, h }] }]
  //   i = a darab indexe a bemeneti tömbben; x, y, w, h = helye és mérete a
  //   lapon (mm, forgatás után); free = a lap még fel nem használt részei.
  const CUT_TOL = 0.5; // mm tűrés az illesztésnél
  function planCuts(pieces, tileW, tileH, opts) {
    const rotate = !!(opts && opts.rotate);
    const idx = pieces.map((p, i) => i);
    const orders = [
      (a, b) => pieces[b].w * pieces[b].h - pieces[a].w * pieces[a].h,                                          // terület
      (a, b) => Math.max(pieces[b].w, pieces[b].h) - Math.max(pieces[a].w, pieces[a].h),                      // hosszabb oldal
      (a, b) => pieces[b].h - pieces[a].h || pieces[b].w - pieces[a].w,                                        // magasság
      (a, b) => pieces[b].w - pieces[a].w || pieces[b].h - pieces[a].h,                                        // szélesség
    ];
    let best = null;
    for (const cmp of orders) {
      const plan = packGuillotine(pieces, idx.slice().sort((a, b) => cmp(a, b) || a - b), tileW, tileH, rotate);
      if (!best || plan.length < best.length) best = plan;
    }
    return best;
  }

  function packGuillotine(pieces, order, tileW, tileH, rotate) {
    const tiles = [];
    for (const i of order) {
      const pc = pieces[i];
      const orient = [{ w: pc.w, h: pc.h, rot: false }];
      if (rotate && Math.abs(pc.w - pc.h) > CUT_TOL) orient.push({ w: pc.h, h: pc.w, rot: true });
      // legjobb szabad rész a már megkezdett lapokon
      let pick = null;
      tiles.forEach((t) => t.free.forEach((f, fi) => {
        orient.forEach((o) => {
          if (o.w > f.w + CUT_TOL || o.h > f.h + CUT_TOL) return;
          const rest = f.w * f.h - o.w * o.h;
          const shortSide = Math.min(f.w - o.w, f.h - o.h);
          if (!pick || rest < pick.rest - 1e-6 || (Math.abs(rest - pick.rest) <= 1e-6 && shortSide < pick.shortSide)) {
            pick = { t, fi, o, rest, shortSide };
          }
        });
      }));
      if (!pick) {
        const t = { pieces: [], free: [{ x: 0, y: 0, w: tileW, h: tileH }] };
        tiles.push(t);
        // új lapon eredeti tájolásban (ha elfér), a lap sarkában
        const o = orient.find((x) => x.w <= tileW + CUT_TOL && x.h <= tileH + CUT_TOL) || orient[0];
        pick = { t, fi: 0, o };
      }
      const f = pick.t.free[pick.fi];
      const pw = Math.min(pick.o.w, f.w), ph = Math.min(pick.o.h, f.h);
      pick.t.pieces.push({ i, x: f.x, y: f.y, w: pick.o.w, h: pick.o.h, rot: pick.o.rot });
      // guillotine-vágás: a nagyobb megmaradó csík legyen minél nagyobb
      const rw = f.w - pw, bh = f.h - ph;
      const splitA = [{ x: f.x + pw, y: f.y, w: rw, h: f.h }, { x: f.x, y: f.y + ph, w: pw, h: bh }]; // függőleges vágás végig
      const splitB = [{ x: f.x + pw, y: f.y, w: rw, h: ph }, { x: f.x, y: f.y + ph, w: f.w, h: bh }]; // vízszintes vágás végig
      const maxA = Math.max(rw * f.h, pw * bh), maxB = Math.max(rw * ph, f.w * bh);
      const parts = (maxA >= maxB ? splitA : splitB).filter((r) => r.w > CUT_TOL && r.h > CUT_TOL);
      pick.t.free.splice(pick.fi, 1, ...parts);
    }
    return tiles;
  }

  // Reális lapszükséglet a vágott darabokhoz (a vágási terv lapjainak száma).
  function tilesNeededForCuts(pieces, tileW, tileH, opts) {
    return planCuts(pieces, tileW, tileH, opts).length;
  }

  // Forgatható-e a laptípus darabja a vágási tervben (nincs mintairány).
  // Amíg a felhasználó nem állítja be: színes lapnál igen, képesnél nem.
  function tileRotatable(t) {
    return t && typeof t.rotatable === "boolean" ? t.rotatable : !(t && t.fillKind === "image");
  }

  // A kiosztó hívja: az aktív felület számait megjeleníti a Kiosztás fülön
  // (felület-szintű burkolat), cache-be tárolja, majd frissíti az Anyag fülön
  // a projekt-szintű mutatókat.
  function updateMaterialReport(data) {
    cacheActiveSurfaceMaterial(data);
    // felület-szintű kiírás a Kiosztás fülre
    if (el.matArea) {
      if (!data) {
        el.matArea.textContent = "–";
        el.matTiles.textContent = "–";
        el.matWaste.textContent = "–";
        el.matFinal.textContent = "–";
      } else {
        const { areaMm2, tilesNeeded, tileAreaMm2 } = data;
        const usedAreaMm2 = tilesNeeded * tileAreaMm2;
        const wastePct = usedAreaMm2 > 0 ? (1 - areaMm2 / usedAreaMm2) * 100 : 0;
        const pct = Math.max(0, state.layout.overagePct || 0);
        const finalTiles = Math.ceil(tilesNeeded * (1 + pct / 100));
        el.matArea.textContent = (areaMm2 / 1e6).toFixed(2) + " m²";
        el.matTiles.textContent = tilesNeeded + " db";
        el.matWaste.textContent = wastePct.toFixed(0) + " %";
        el.matFinal.textContent = finalTiles + " db (+" + pct + "%)";
      }
    }
    updateProjectMaterialReport();
  }

  // Az aktív felület utolsó ismert kiosztás-számai a project-tree-be mentve,
  // hogy a projekt-szintű összesítő végig tudja járni az összes felületet.
  function cacheActiveSurfaceMaterial(data) {
    const s = project && project.surfaces ? project.surfaces[project.activeIndex] : null;
    if (!s) return;
    if (!data) {
      s.lastGroutAreaMm2 = 0;
      s.lastAreaMm2 = 0;
      s.lastTileAreaMm2 = 0;
      s.lastTilesNeeded = 0;
      s.lastWhole = 0;
      s.lastCut = 0;
      s.lastTilesByType = null;
      return;
    }
    s.lastGroutAreaMm2 = data.groutAreaMm2 || 0;
    s.lastAreaMm2 = data.areaMm2 || 0;
    s.lastTileAreaMm2 = data.tileAreaMm2 || 0;
    s.lastTilesNeeded = data.tilesNeeded || 0;
    s.lastWhole = data.whole || 0;
    s.lastCut = data.cut || 0;
    s.lastTilesByType = data.byType || null;
    const base = baseTile();
    s.lastTileThicknessMm = base ? (base.thicknessMm || 8) : 8;
  }

  // Projekt-szintű burkolat-összesítés (az összes felület cache-elt adataiból).
