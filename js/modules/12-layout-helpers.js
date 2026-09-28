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
  // opts.factoryEdges: a darab gyári élt igénylő oldalai (piece.fe = {t,r,b,l})
  //   csak a lap szélére kerülhetnek; ilyenkor a szabad rész mind a 4 sarkát és
  //   a 180°-os megfordítást is kipróbálja (a 90°/270° továbbra is opts.rotate).
  // Több darab-sorrendet kipróbál, és a legkevesebb lapot adót választja.
  // pieces: [{ w, h, fe?, ... }] → [{ pieces: [{ i, x, y, w, h, rot, fe }], free: [{ x, y, w, h }] }]
  //   i = a darab indexe a bemeneti tömbben; x, y, w, h = helye és mérete a
  //   lapon (mm, forgatás után); rot = 0/90/180/270 (fok, óramutató szerint);
  //   fe = a gyári élt igénylő oldalak a lapon elhelyezett állásban;
  //   free = a lap még fel nem használt részei.
  const CUT_TOL = 0.5; // mm tűrés az illesztésnél
  function planCuts(pieces, tileW, tileH, opts) {
    const o = { rotate: !!(opts && opts.rotate), factoryEdges: !!(opts && opts.factoryEdges) };
    const idx = pieces.map((p, i) => i);
    const orders = [
      (a, b) => pieces[b].w * pieces[b].h - pieces[a].w * pieces[a].h,                                          // terület
      (a, b) => Math.max(pieces[b].w, pieces[b].h) - Math.max(pieces[a].w, pieces[a].h),                      // hosszabb oldal
      (a, b) => pieces[b].h - pieces[a].h || pieces[b].w - pieces[a].w,                                        // magasság
      (a, b) => pieces[b].w - pieces[a].w || pieces[b].h - pieces[a].h,                                        // szélesség
    ];
    let best = null;
    for (const cmp of orders) {
      const plan = packGuillotine(pieces, idx.slice().sort((a, b) => cmp(a, b) || a - b), tileW, tileH, o);
      if (!best || plan.length < best.length) best = plan;
    }
    // Elforgatott minták (átlós, 45°-os halszálka): ha minden darab valódi alakja
    // (poly) ismert, a sokszög-párosítást is kipróbáljuk — pl. két fél-háromszög
    // egy lapból —, és a kevesebb lapot adó terv nyer.
    if (pieces.length && pieces.every((p) => Array.isArray(p.poly) && p.poly.length >= 3)) {
      const byArea = idx.slice().sort((a, b) => polyArea(pieces[b].poly) - polyArea(pieces[a].poly) || a - b);
      for (const ord of [byArea, idx.slice().sort((a, b) => orders[1](a, b) || a - b)]) {
        const plan = packPolygons(pieces, ord, tileW, tileH, o);
        if (plan.length < best.length) best = plan;
      }
    }
    return best;
  }

  // ---- Sokszög-darabok párosítása egy lapon belül -------------------------
  // A darab a lap saját keretében, a „természetes” helyén (poly) van; a lapon
  // belül csak a lapot önmagába vivő forgatásokkal mozdítható: 0°, 180°, és
  // négyzetes + forgatható lapnál 90°/270° (óramutató szerint). Eltolás nincs —
  // így a darab lap-széli (gyári) oldalai a lap szélén maradnak. Két darab akkor
  // fér egy lapra, ha nem fedik egymást.
  function transformPoly(poly, rot, W, H) {
    if (rot === 180) return poly.map((q) => ({ x: W - q.x, y: H - q.y }));
    if (rot === 90) return poly.map((q) => ({ x: H - q.y, y: q.x }));   // négyzetes lapnál W = H
    if (rot === 270) return poly.map((q) => ({ x: q.y, y: W - q.x }));
    return poly;
  }
  function convexHull(pts) {
    const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [], upper = [];
    for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }
  // átfedés: a ∩ conv(b) területe (b konvex burkával — óvatos, sosem enged átfedést)
  const OVERLAP_MM2 = 1;
  function polysOverlap(a, b) {
    if (a.x1 <= b.x0 + CUT_TOL || b.x1 <= a.x0 + CUT_TOL || a.y1 <= b.y0 + CUT_TOL || b.y1 <= a.y0 + CUT_TOL) return false;
    if (b.hull.length < 3) return false;
    const inter = clipPolygonByConvex(a.poly, b.hull);
    return inter.length >= 3 && polyArea(inter) > OVERLAP_MM2;
  }
  function polyShape(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    poly.forEach((q) => { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); });
    return { poly, hull: convexHull(poly), area: polyArea(poly), x0, y0, x1, y1 };
  }
  function packPolygons(pieces, order, W, H, o) {
    const rots = [0, 180].concat(o.rotate && Math.abs(W - H) <= CUT_TOL ? [90, 270] : []);
    const tiles = [];
    for (const i of order) {
      const pc = pieces[i];
      const cands = rots.map((rot) => ({ rot, ...polyShape(transformPoly(pc.poly, rot, W, H)) }));
      let pick = null;
      tiles.forEach((t) => cands.forEach((c) => {
        if (c.area > t.freeArea + OVERLAP_MM2) return;          // területre sem férne el
        if (pick && t.freeArea - c.area >= pick.rest) return;
        if (t.shapes.some((q) => polysOverlap(c, q) || polysOverlap(q, c))) return;
        pick = { t, c, rest: t.freeArea - c.area };
      }));
      if (!pick) {
        const t = { shapes: [], pieces: [], freeArea: W * H };
        tiles.push(t);
        pick = { t, c: cands[0] };
      }
      const c = pick.c;
      pick.t.shapes.push(c);
      pick.t.freeArea -= c.area;
      pick.t.pieces.push({ i, x: c.x0, y: c.y0, w: c.x1 - c.x0, h: c.y1 - c.y0, rot: c.rot, poly: c.poly,
        fe: rotateEdges((o.factoryEdges && pc.fe) || NO_EDGES, c.rot) });
    }
    return tiles.map((t) => ({ pieces: t.pieces, free: [] }));
  }

  const NO_EDGES = { t: false, r: false, b: false, l: false };
  // gyári-él oldalak elforgatása óramutató szerint (90°: a bal oldal kerül felülre)
  function rotateEdges(fe, rot) {
    if (rot === 90) return { t: fe.l, r: fe.t, b: fe.r, l: fe.b };
    if (rot === 180) return { t: fe.b, r: fe.l, b: fe.t, l: fe.r };
    if (rot === 270) return { t: fe.r, r: fe.b, b: fe.l, l: fe.t };
    return fe;
  }

  function packGuillotine(pieces, order, tileW, tileH, o) {
    const tiles = [];
    // a darab lehetséges állásai (méret + a gyári-él oldalak az adott állásban)
    const orientations = (pc) => {
      const fe = (o.factoryEdges && pc.fe) || NO_EDGES;
      const list = [{ w: pc.w, h: pc.h, rot: 0 }];
      if (o.factoryEdges) list.push({ w: pc.w, h: pc.h, rot: 180 });
      if (o.rotate && (o.factoryEdges || Math.abs(pc.w - pc.h) > CUT_TOL)) {
        list.push({ w: pc.h, h: pc.w, rot: 90 });
        if (o.factoryEdges) list.push({ w: pc.h, h: pc.w, rot: 270 });
      }
      return list.map((x) => ({ ...x, fe: rotateEdges(fe, x.rot) }));
    };
    // elhelyezés egy szabad részben: melyik sarokba kerülhet (gyári él szabály nélkül csak bal-felső)
    const cornersIn = (f, ori) => {
      const xs = o.factoryEdges ? [f.x, f.x + f.w - ori.w] : [f.x];
      const ys = o.factoryEdges ? [f.y, f.y + f.h - ori.h] : [f.y];
      const out = [];
      xs.forEach((x) => ys.forEach((y) => {
        const fe = ori.fe;
        if (fe.l && x > CUT_TOL) return;
        if (fe.t && y > CUT_TOL) return;
        if (fe.r && x + ori.w < tileW - CUT_TOL) return;
        if (fe.b && y + ori.h < tileH - CUT_TOL) return;
        out.push({ x: Math.max(f.x, x), y: Math.max(f.y, y) });
      }));
      return out;
    };
    for (const i of order) {
      const pc = pieces[i];
      const oris = orientations(pc);
      // legjobb szabad rész a már megkezdett lapokon (best area fit)
      let pick = null;
      tiles.forEach((t) => t.free.forEach((f, fi) => {
        oris.forEach((ori) => {
          if (ori.w > f.w + CUT_TOL || ori.h > f.h + CUT_TOL) return;
          const rest = f.w * f.h - ori.w * ori.h;
          const shortSide = Math.min(f.w - ori.w, f.h - ori.h);
          if (pick && !(rest < pick.rest - 1e-6 || (Math.abs(rest - pick.rest) <= 1e-6 && shortSide < pick.shortSide))) return;
          const c = cornersIn(f, ori)[0];
          if (c) pick = { t, fi, ori, at: c, rest, shortSide };
        });
      }));
      if (!pick) {
        // új lap: az első olyan állás/sarok, ami a szabálynak megfelel
        const t = { pieces: [], free: [{ x: 0, y: 0, w: tileW, h: tileH }] };
        tiles.push(t);
        for (const ori of oris) {
          if (ori.w > tileW + CUT_TOL || ori.h > tileH + CUT_TOL) continue;
          const c = cornersIn(t.free[0], ori)[0];
          if (c) { pick = { t, fi: 0, ori, at: c }; break; }
        }
        if (!pick) pick = { t, fi: 0, ori: oris[0], at: { x: 0, y: 0 } }; // biztonsági tartalék
      }
      const f = pick.t.free[pick.fi], ori = pick.ori, at = pick.at;
      pick.t.pieces.push({ i, x: at.x, y: at.y, w: ori.w, h: ori.h, rot: ori.rot, fe: ori.fe });
      // guillotine-vágás a sarokba tett darab körül: a nagyobb megmaradó csík legyen minél nagyobb
      const pw = Math.min(ori.w, f.w), ph = Math.min(ori.h, f.h);
      const left = at.x <= f.x + CUT_TOL, top = at.y <= f.y + CUT_TOL;
      const rw = f.w - pw, bh = f.h - ph;
      const sideX = left ? f.x + pw : f.x;            // a darab melletti oszlop
      const restY = top ? f.y + ph : f.y;             // a darab alatti/fölötti sáv
      const pieceY = top ? f.y : f.y + bh;
      const pieceX = left ? f.x : f.x + rw;
      const splitA = [{ x: sideX, y: f.y, w: rw, h: f.h }, { x: pieceX, y: restY, w: pw, h: bh }];   // függőleges vágás végig
      const splitB = [{ x: sideX, y: pieceY, w: rw, h: ph }, { x: f.x, y: restY, w: f.w, h: bh }];   // vízszintes vágás végig
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
