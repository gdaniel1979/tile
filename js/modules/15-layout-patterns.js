"use strict";
  function drawTileFill(type, sx, sy, sw, sh) {
    if (type.fillKind === "image" && type.imageUrl) {
      const img = getImage(type.imageUrl);
      if (img) {
        if (type.imageMode === "repeat") {
          ctx.save();
          ctx.beginPath();
          ctx.rect(sx, sy, sw, sh);
          ctx.clip();
          const aspect = img.height / img.width || 1;
          const cw = REPEAT_MM * state.view.scale;
          const ch = REPEAT_MM * aspect * state.view.scale;
          for (let yy = sy; yy < sy + sh; yy += ch)
            for (let xx = sx; xx < sx + sw; xx += cw)
              ctx.drawImage(img, xx, yy, cw, ch);
          ctx.restore();
        } else {
          ctx.drawImage(img, sx, sy, sw, sh);
        }
        return;
      }
    }
    ctx.fillStyle = type.color || "#cccccc";
    ctx.fillRect(sx, sy, sw, sh);
  }

  // Sokszög (subject) vágása egy KONVEX sokszöggel (clip) – Sutherland–Hodgman.
  function clipPolygonByConvex(subject, clip) {
    let ccx = 0, ccy = 0;
    clip.forEach((c) => { ccx += c.x; ccy += c.y; });
    ccx /= clip.length; ccy /= clip.length;
    let out = subject;
    for (let k = 0; k < clip.length && out.length >= 3; k++) {
      const a = clip[k], b = clip[(k + 1) % clip.length];
      const ex = b.x - a.x, ey = b.y - a.y;
      const side = (px, py) => ex * (py - a.y) - ey * (px - a.x);
      const insideSign = side(ccx, ccy) >= 0 ? 1 : -1;
      const inside = (pt) => side(pt.x, pt.y) * insideSign >= -1e-6;
      const inter = (s, e) => {
        const d1 = side(s.x, s.y), d2 = side(e.x, e.y);
        const t = d1 / (d1 - d2);
        return { x: s.x + t * (e.x - s.x), y: s.y + t * (e.y - s.y) };
      };
      const res = [];
      const m = out.length;
      for (let q = 0; q < m; q++) {
        const cur = out[q], prev = out[(q + m - 1) % m];
        const ci = inside(cur), pi = inside(prev);
        if (ci) { if (!pi) res.push(inter(prev, cur)); res.push(cur); }
        else if (pi) { res.push(inter(prev, cur)); }
      }
      out = res;
    }
    return out;
  }

  // Egy laptípus megjelenése egy (elforgatott) négyszögbe – szín vagy kép
  function drawQuadFill(type, quad) {
    const s = quad.map(worldToScreen);
    ctx.beginPath();
    ctx.moveTo(s[0].x, s[0].y);
    ctx.lineTo(s[1].x, s[1].y);
    ctx.lineTo(s[2].x, s[2].y);
    ctx.lineTo(s[3].x, s[3].y);
    ctx.closePath();
    if (type.fillKind === "image" && type.imageUrl) {
      const img = getImage(type.imageUrl);
      if (img) {
        ctx.save();
        ctx.clip();
        const ax = s[0].x, ay = s[0].y;
        const uX = s[1].x - s[0].x, uY = s[1].y - s[0].y;
        const vX = s[3].x - s[0].x, vY = s[3].y - s[0].y;
        ctx.transform(uX / img.width, uY / img.width, vX / img.height, vY / img.height, ax, ay);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
        return;
      }
    }
    ctx.fillStyle = type.color || "#cccccc";
    ctx.fill();
  }

  // Melyik rács-cellára esik egy világkoordináta (festéshez); null ha fuga/kívül
  function tileIndexAt(wx, wy, g) {
    // halszálka: nincs egyszerű rács-képlet — a kiszámolt lapok közül keressük
    // azt, amelyiknek a négyszögébe a pont esik (a kulcs: "i_j_idx")
    if (g && state.layout.pattern === "herringbone") {
      if (!pointInPolygon(wx, wy, state.points)) return null;
      const res = getLayout();
      const hit = res && res.tiles.find((t) => t.quad && pointInPolygon(wx, wy, t.quad));
      return hit ? { key: hit.key } : null;
    }
    if (g && state.layout.pattern === "diagonal") {
      const th = Math.PI / 4, ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
      const pU = g.tileW + g.grout, pV = g.tileH + g.grout;
      const cx = (g.minX + g.maxX) / 2, cy = (g.minY + g.maxY) / 2;
      const dx = wx - cx, dy = wy - cy;
      const lu = dx * ux + dy * uy, lv = dx * vx + dy * vy;
      const i = Math.floor(lu / pU), j = Math.floor(lv / pV);
      if (lu - i * pU > g.tileW || lv - j * pV > g.tileH) return null; // fugahézag
      if (!pointInPolygon(wx, wy, state.points)) return null;
      return { i, j, key: i + "_" + j };
    }
    if (!g) return null;
    const j = Math.floor((wy - g.originY) / g.pitchY);
    const offFrac = state.layout.pattern === "offset" ? (state.layout.offsetPct || 0) / 100 : 0;
    const rowShift = offFrac ? (((j * offFrac) % 1) * g.pitchX) : 0;
    const i = Math.floor((wx - g.originX - rowShift) / g.pitchX);
    const x0 = g.originX + i * g.pitchX + rowShift;
    const y0 = g.originY + j * g.pitchY;
    if (wx > x0 + g.tileW || wy > y0 + g.tileH) return null; // fugahézag
    if (!pointInPolygon(wx, wy, state.points)) return null;  // sokszögön kívül
    return { i, j, key: i + "_" + j };
  }

  // Festés egy pontnál; igazat ad vissza, ha változott az állapot
  function applyPaintAt(wx, wy) {
    const hit = tileIndexAt(wx, wy, computeGrid());
    if (!hit) return false;
    const sel = state.layout.paintTypeId;
    const ov = state.layout.overrides;
    if (sel == null) return false;
    if (sel === "__erase__") {
      if (ov[hit.key] !== undefined) { delete ov[hit.key]; return true; }
      return false;
    }
    if (!state.tiles.types.some((t) => t.id === sel)) return false;
    if (ov[hit.key] === sel) return false;
    ov[hit.key] = sel;
    return true;
  }

  // =======================================================================
  //  Kiosztás: SZÁMÍTÁS és RAJZOLÁS külön.
  //  computeLayout() nem nyúl a vászonhoz és a DOM-hoz: a lapok világ-
  //  koordinátás listáját, a vágott darabok feliratait és a statisztikát adja
  //  vissza. A render, az export, a 3D és a projekt-szintű anyagszámítás mind
  //  ezt használja; a nézet (zoom/pan) nem befolyásolja, ezért felületenként
  //  gyorsítótárazzuk (getLayout).
  //  Eredmény: { g, tiles: [{ key, typeId, rect:{x,y,w,h} | quad:[4 pont] }],
  //              cutLabels: [{ x, y, w, h, text, code }], needPieces: [{ w, h, typeId }],
  //              cutPlan: [{ typeId, tileW, tileH, tiles: [{ no, pieces, free }] }],
  //              stats, degenerate? }
  // =======================================================================

  function newLayoutAcc() {
    return { total: 0, whole: 0, cut: 0, tilesAreaSumMm2: 0, tiles: [], cutLabels: [], needPieces: [], byType: {} };
  }

  // típusonkénti aggregáció (vízszintes/függőleges base, override-olt is)
  function bumpType(byType, typeObj, isWhole, areaMm2) {
    const id = typeObj.id;
    if (!byType[id]) byType[id] = { id, name: typeObj.name || "lap", area: 0, whole: 0, cut: 0 };
    const t = byType[id];
    t.area += areaMm2;
    if (isWhole) t.whole++; else t.cut++;
  }

  // Anyagkimutatás (reális újrahasznosítással) – a burkolt terület a kivágások
  // nélkül. needW × needH: a lap mérete, amihez a needPieces darabjai igazodnak.
  // A vágási terv (cutPlan) laptípusonként készül — különböző típusú lapok
  // maradéka nem cserélhető —, és ebből jön a szükséges lapszám is. Minden
  // vágott darab kódot kap (pl. „3a” = a terv 3. lapjából az első darab).
  function finishLayout(g, acc, needW, needH) {
    const tileAreaMm2 = needW * needH;
    const areaMm2 = Math.max(0, shoelaceAreaMm2() - cutoutsAreaMm2());
    const cutPlan = [];
    let tileNo = 0;
    [...new Set(acc.needPieces.map((p) => p.typeId))].forEach((typeId) => {
      const idxs = [];
      acc.needPieces.forEach((p, i) => { if (p.typeId === typeId) idxs.push(i); });
      const tType = state.tiles.types.find((x) => x.id === typeId);
      const tiles = planCuts(idxs.map((i) => acc.needPieces[i]), needW, needH, { rotate: tileRotatable(tType) }).map((t) => {
        tileNo++;
        const pieces = t.pieces.map((pc, k) => {
          const li = idxs[pc.i]; // a darab indexe a cutLabels / needPieces tömbben
          const code = tileNo + String.fromCharCode(97 + k);
          acc.cutLabels[li].code = code;
          return { code, li, x: pc.x, y: pc.y, w: pc.w, h: pc.h, rot: pc.rot };
        });
        return { no: tileNo, pieces, free: t.free };
      });
      cutPlan.push({ typeId, tileW: needW, tileH: needH, tiles });
    });
    const cutTilesOf = (typeId) => { const p = cutPlan.find((x) => x.typeId === typeId); return p ? p.tiles.length : 0; };
    const byType = {};
    Object.keys(acc.byType).forEach((id) => {
      const t = acc.byType[id];
      byType[id] = { id: t.id, name: t.name, area: t.area, whole: t.whole, cut: t.cut, needed: t.whole + cutTilesOf(id), tileAreaMm2 };
    });
    const tilesNeeded = acc.whole + cutPlan.reduce((n, p) => n + p.tiles.length, 0);
    // fuga geometriailag: a burkolt területből levonjuk a lerakott lap-darabok összesített területét
    const groutAreaMm2 = Math.max(0, areaMm2 - acc.tilesAreaSumMm2);
    return {
      g, tiles: acc.tiles, cutLabels: acc.cutLabels, cutPlan,
      needPieces: acc.needPieces, // a vágott darabok a lap (needW × needH) tájolásában
      stats: { total: acc.total, whole: acc.whole, cut: acc.cut, tilesNeeded, areaMm2, tileAreaMm2, groutAreaMm2, byType },
    };
  }

  function overrideType(key, base) {
    const ovId = state.layout.overrides[key];
    return ovId ? (state.tiles.types.find((t) => t.id === ovId) || base) : base;
  }

  function computeLayout() {
    const g = computeGrid();
    return g ? computeLayoutFromGrid(g) : null;
  }

  function computeLayoutFromGrid(g) {
    if (state.layout.pattern === "diagonal") return computeDiagonalLayout(g);
    if (state.layout.pattern === "herringbone") return computeHerringboneLayout(g);
    return computeStraightLayout(g);
  }

  // Felületenkénti gyorsítótár: csak akkor számolunk újra, ha a kiosztást
  // meghatározó adatok változtak (a képek, színek a rajzoláskor olvasódnak).
  const layoutCache = new Map(); // felület-id -> { key, res }
  function layoutCacheKey(g) {
    const L = state.layout;
    return JSON.stringify([
      g.base.id, g.minX, g.minY, g.maxX, g.maxY, g.grout, g.tileW, g.tileH, g.originX, g.originY,
      state.points, state.closed, (state.cutouts || []).map((c) => [c.x, c.y, c.w, c.h]),
      L.pattern, L.offsetPct, L.herringboneTilted, L.overrides,
      state.tiles.types.map((t) => [t.id, t.name, tileRotatable(t)]), state.unit,
    ]);
  }
  function getLayout() {
    const g = computeGrid();
    if (!g) return null;
    const s = project && project.surfaces ? project.surfaces[project.activeIndex] : null;
    const sid = s ? s.id : "_";
    const key = layoutCacheKey(g);
    const hit = layoutCache.get(sid);
    if (hit && hit.key === key) return hit.res;
    const res = computeLayoutFromGrid(g);
    layoutCache.set(sid, { key, res });
    return res;
  }

  // EGYENES / ELTOLT (téglakötés) kiosztás
  function computeStraightLayout(g) {
    const { base, minX, minY, maxX, maxY, tileW, tileH, pitchX, pitchY, originX, originY } = g;
    const p = state.points;
    const cutouts = state.cutouts || [];
    // kötésminta: eltolt (téglakötés) soronkénti x-eltolás
    const offFrac = state.layout.pattern === "offset" ? (state.layout.offsetPct || 0) / 100 : 0;

    const i0 = Math.floor((minX - originX) / pitchX) - 2;
    const i1 = Math.ceil((maxX - originX) / pitchX) + 1;
    const j0 = Math.floor((minY - originY) / pitchY) - 1;
    const j1 = Math.ceil((maxY - originY) / pitchY) + 1;

    const acc = newLayoutAcc();
    for (let j = j0; j <= j1; j++) {
      const rowShift = offFrac ? (((j * offFrac) % 1) * pitchX) : 0;
      for (let i = i0; i <= i1; i++) {
        const x0 = originX + i * pitchX + rowShift;
        const y0 = originY + j * pitchY;
        const x1 = x0 + tileW;
        const y1 = y0 + tileH;
        if (x1 < minX || x0 > maxX || y1 < minY || y0 > maxY) continue;

        // A lap burkolható részei maximális téglalapokra bontva
        const subs = cutTilePieces(x0, y0, x1, y1, p, cutouts);
        let area = 0;
        for (const s of subs) area += s.w * s.h;
        if (area < tileW * tileH * 0.004) continue; // gyakorlatilag nincs burkolható rész → kihagyjuk
        acc.tilesAreaSumMm2 += area;

        // egyedi felülírás: a cellához rendelt típus megjelenése, ha van
        const type = overrideType(i + "_" + j, base);

        acc.total++;
        const isWhole = subs.length === 1 && subs[0].w >= tileW - 0.5 && subs[0].h >= tileH - 0.5;
        if (isWhole) {
          acc.whole++;
          bumpType(acc.byType, type, true, area);
        } else {
          acc.cut++;
          // a darabokat összefüggő komponensekre csoportosítjuk
          const comps = groupConnected(subs);
          comps.forEach((comp, idx) => {
            let cbx0 = Infinity, cby0 = Infinity, cbx1 = -Infinity, cby1 = -Infinity, cArea = 0, big = comp[0];
            for (const r of comp) {
              const a = r.w * r.h; cArea += a;
              if (a > big.w * big.h) big = r;
              cbx0 = Math.min(cbx0, r.x); cby0 = Math.min(cby0, r.y);
              cbx1 = Math.max(cbx1, r.x + r.w); cby1 = Math.max(cby1, r.y + r.h);
            }
            const cbw = cbx1 - cbx0, cbh = cby1 - cby0;
            const rectangular = cArea >= cbw * cbh - Math.max(1, cbw * cbh * 0.002);
            const text = rectangular ? fmtDim(cbw, cbh) : ("L " + fmtDim(cbw, cbh) + " / " + fmtDim(big.w, big.h));
            acc.cutLabels.push({ x: big.x + big.w / 2, y: big.y + big.h / 2, w: cbw, h: cbh, text });
            acc.needPieces.push({ w: cbw, h: cbh, typeId: type.id });
            bumpType(acc.byType, type, false, idx === 0 ? area : 0);
          });
        }
        acc.tiles.push({ key: i + "_" + j, typeId: type.id, rect: { x: x0, y: y0, w: tileW, h: tileH } });
      }
    }
    return finishLayout(g, acc, tileW, tileH);
  }

  // ---- Elforgatott lapok (átlós, halszálka): lap-darab a kivágások nélkül ----
  // súlypont × terület (a kivágott részek levonásához összegezhető)
  function polyMoment(pts) {
    let s = 0, mx = 0, my = 0;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length];
      const cr = a.x * b.y - b.x * a.y;
      s += cr; mx += (a.x + b.x) * cr; my += (a.y + b.y) * cr;
    }
    if (Math.abs(s) < 1e-9) return { a: 0, mx: 0, my: 0 };
    const sign = s < 0 ? -1 : 1; // a = |s|/2, mx = cx·a
    return { a: Math.abs(s) / 2, mx: (mx / 6) * sign, my: (my / 6) * sign };
  }
  const inRectStrict = (px, py, c) => px > c.x + 1e-6 && px < c.x + c.w - 1e-6 && py > c.y + 1e-6 && py < c.y + c.h - 1e-6;

  // A lap sokszögbe eső darabjából (piece = sokszög ∩ lap) levonjuk a
  // kivágásokat (cells = cutoutCells(cutouts)). Visszaadja a maradék
  // területét, súlypontját és a lap saját tengelyei (u = (ax,ay),
  // v = (bx,by), origó: o) menti kiterjedését.
  function pieceMinusCutouts(piece, cutouts, cells, o, ax, ay, bx, by) {
    let pminX = Infinity, pminY = Infinity, pmaxX = -Infinity, pmaxY = -Infinity;
    piece.forEach((q) => { pminX = Math.min(pminX, q.x); pmaxX = Math.max(pmaxX, q.x); pminY = Math.min(pminY, q.y); pmaxY = Math.max(pmaxY, q.y); });
    const near = (c) => c.x < pmaxX && c.x + c.w > pminX && c.y < pmaxY && c.y + c.h > pminY;
    const cuts = cutouts.filter(near);

    // terület és súlypont: darab − Σ(darab ∩ kivágás-cella); a cellák nem
    // fedik egymást, így az átfedő kivágások is pontosan egyszer vonódnak le
    const m = polyMoment(piece);
    let area = m.a, mx = m.mx, my = m.my;
    cells.forEach((c) => {
      if (!near(c)) return;
      const part = clipPolygonRect(piece, c.x, c.y, c.x + c.w, c.y + c.h);
      if (part.length < 3) return;
      const pm = polyMoment(part);
      area -= pm.a; mx -= pm.mx; my -= pm.my;
    });
    area = Math.max(0, area);

    // kiterjedés: a maradék tartomány határának csúcsai — a darab csúcsai a
    // kivágásokon kívül, a darab-élek és kivágás-élek metszéspontjai, valamint
    // a darabba eső kivágás-sarkok
    const outside = (px, py) => !cuts.some((c) => inRectStrict(px, py, c));
    const pts = [];
    piece.forEach((q) => { if (outside(q.x, q.y)) pts.push(q); });
    cuts.forEach((c) => {
      const X0 = c.x, X1 = c.x + c.w, Y0 = c.y, Y1 = c.y + c.h;
      for (let k = 0; k < piece.length; k++) {
        const a = piece[k], b = piece[(k + 1) % piece.length];
        const dx = b.x - a.x, dy = b.y - a.y;
        if (Math.abs(dx) > 1e-9) [X0, X1].forEach((X) => {
          const t = (X - a.x) / dx;
          if (t < 0 || t > 1) return;
          const y = a.y + t * dy;
          if (y >= Y0 && y <= Y1 && outside(X, y)) pts.push({ x: X, y });
        });
        if (Math.abs(dy) > 1e-9) [Y0, Y1].forEach((Y) => {
          const t = (Y - a.y) / dy;
          if (t < 0 || t > 1) return;
          const x = a.x + t * dx;
          if (x >= X0 && x <= X1 && outside(x, Y)) pts.push({ x, y: Y });
        });
      }
      [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]].forEach(([x, y]) => {
        if (pointInPolygon(x, y, piece) && outside(x, y)) pts.push({ x, y });
      });
    });
    let lu0 = Infinity, lu1 = -Infinity, lv0 = Infinity, lv1 = -Infinity;
    pts.forEach((q) => {
      const rx = q.x - o.x, ry = q.y - o.y;
      const lu = rx * ax + ry * ay, lv = rx * bx + ry * by;
      lu0 = Math.min(lu0, lu); lu1 = Math.max(lu1, lu); lv0 = Math.min(lv0, lv); lv1 = Math.max(lv1, lv);
    });
    const w = pts.length ? Math.max(0, lu1 - lu0) : 0, h = pts.length ? Math.max(0, lv1 - lv0) : 0;
    const cx = area > 1e-6 ? mx / area : (pminX + pmaxX) / 2;
    const cy = area > 1e-6 ? my / area : (pminY + pmaxY) / 2;
    return { area, w, h, cx, cy };
  }

  // ÁTLÓS (45°) kiosztás – elforgatott rács. A vágási méret a lap saját
  // tengelye mentén (a kivágások levonásával; ferde kontúrnál befoglaló méret).
  function computeDiagonalLayout(g) {
    const { base, minX, minY, maxX, maxY, tileW, tileH, grout } = g;
    const p = state.points;
    const th = Math.PI / 4;
    const ux = Math.cos(th), uy = Math.sin(th);   // lap-szélesség tengely
    const vx = -Math.sin(th), vy = Math.cos(th);  // lap-magasság tengely
    const pU = tileW + grout, pV = tileH + grout;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const cutouts = state.cutouts || [];
    const cells = cutoutCells(cutouts);

    // i,j tartomány a bbox lefedéséhez
    let iMin = Infinity, iMax = -Infinity, jMin = Infinity, jMax = -Infinity;
    [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].forEach(([px, py]) => {
      const dx = px - cx, dy = py - cy;
      const ci = (dx * ux + dy * uy) / pU, cj = (dx * vx + dy * vy) / pV;
      iMin = Math.min(iMin, ci); iMax = Math.max(iMax, ci);
      jMin = Math.min(jMin, cj); jMax = Math.max(jMax, cj);
    });
    iMin = Math.floor(iMin) - 1; iMax = Math.ceil(iMax) + 1;
    jMin = Math.floor(jMin) - 1; jMax = Math.ceil(jMax) + 1;

    const acc = newLayoutAcc();
    for (let j = jMin; j <= jMax; j++) {
      for (let i = iMin; i <= iMax; i++) {
        const Ax = cx + i * pU * ux + j * pV * vx;
        const Ay = cy + i * pU * uy + j * pV * vy;
        const c0 = { x: Ax, y: Ay };
        const c1 = { x: Ax + tileW * ux, y: Ay + tileW * uy };
        const c2 = { x: Ax + tileW * ux + tileH * vx, y: Ay + tileW * uy + tileH * vy };
        const c3 = { x: Ax + tileH * vx, y: Ay + tileH * vy };
        const quad = [c0, c1, c2, c3];
        const qminX = Math.min(c0.x, c1.x, c2.x, c3.x), qmaxX = Math.max(c0.x, c1.x, c2.x, c3.x);
        const qminY = Math.min(c0.y, c1.y, c2.y, c3.y), qmaxY = Math.max(c0.y, c1.y, c2.y, c3.y);
        if (qmaxX < minX || qminX > maxX || qmaxY < minY || qminY > maxY) continue;

        // a lap sokszögbe eső része, a kivágások levonásával
        const piece = clipPolygonByConvex(p, quad);
        if (piece.length < 3) continue;
        const rest = pieceMinusCutouts(piece, cutouts, cells, c0, ux, uy, vx, vy);
        if (rest.area < tileW * tileH * 0.004) continue; // gyakorlatilag nincs burkolható rész
        acc.tilesAreaSumMm2 += rest.area;

        const isWhole = rest.area >= tileW * tileH * 0.985;
        const key = i + "_" + j;
        const type = overrideType(key, base);
        acc.total++;
        if (isWhole) {
          acc.whole++;
          bumpType(acc.byType, type, true, rest.area);
        } else {
          const pw = rest.w, ph = rest.h;
          acc.cut++;
          acc.cutLabels.push({ x: rest.cx, y: rest.cy, w: pw, h: ph, text: "~" + fmtDim(pw, ph) });
          acc.needPieces.push({ w: pw, h: ph, typeId: type.id });
          bumpType(acc.byType, type, false, rest.area);
        }
        acc.tiles.push({ key, typeId: type.id, quad });
      }
    }
    return finishLayout(g, acc, tileW, tileH);
  }

  // HALSZÁLKA (herringbone) — pgg-konstrukció ferde 2D-rácson, cellánként 4 lap.
  // Cell vektorai (W = w+grout, H = h+grout):
  //   u1 = (H+W, W-H), u2 = (W-H, H+W)
  // Cell terület |u1 × u2| = 4WH = pontosan 4 lap-egységnyi → hézagmentes,
  // átfedés nélküli lefedés a teljes síkon. Lapok cellán belül:
  //   V1 (sx, sy, w, h), H1 (sx+W, sy, h, w),
  //   V2 (sx+W, sy+W, w, h), H2 (sx+2W, sy+W, h, w).
  // 45°-os elforgatás (herringboneTilted): a teljes minta elfordul a felület
  // középpontja körül; a u1, u2 vektorok és a lap saját tengelyei is rotálva.
  function computeHerringboneLayout(g) {
    const { base, minX, minY, maxX, maxY, grout, tileW, tileH } = g;
    const p = state.points;
    const w = Math.min(tileW, tileH);
    const h = Math.max(tileW, tileH);
    // négyzetes lap → halszálka degenerál; egyszerű rács szebb
    if (Math.abs(h - w) < 0.01) return { g, tiles: [], cutLabels: [], cutPlan: [], stats: null, degenerate: true };
    const W = w + grout;
    const H = h + grout;
    // Elforgatás: a teljes minta a felület közepe körül 45°-ban
    const tilted = !!state.layout.herringboneTilted;
    const ang = tilted ? Math.PI / 4 : 0;
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    // forgatott lap saját x és y tengelye (lap-szélesség és lap-magasság irány)
    const ax = cosA, ay = sinA;          // saját x-tengely (lap-szélesség)
    const bx = -sinA, by = cosA;         // saját y-tengely (lap-magasság)
    // Cell rács vektorok (forgatva) — a saját tengelyek lineáris kombinációja
    const u1xWorld = (H + W) * ax + (W - H) * bx;
    const u1yWorld = (H + W) * ay + (W - H) * by;
    const u2xWorld = (W - H) * ax + (H + W) * bx;
    const u2yWorld = (W - H) * ay + (H + W) * by;
    // Forgatás középpontja: a felület bbox-közepe
    const ctrX = (minX + maxX) / 2, ctrY = (minY + maxY) / 2;
    const cutouts = state.cutouts || [];
    const cells = cutoutCells(cutouts);

    // Iteráció (i, j) tartománya: invertáljuk az u1World, u2World mátrixot a
    // bbox sarokpontjaira (centerHoz képest). Det = 4WH (forgatás megőrzi).
    const det = 4 * W * H;
    let iMin = Infinity, iMax = -Infinity, jMin = Infinity, jMax = -Infinity;
    [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].forEach(([sx, sy]) => {
      const dx = sx - ctrX, dy = sy - ctrY;
      const ii = (dx * u2yWorld - dy * u2xWorld) / det;
      const jj = (-dx * u1yWorld + dy * u1xWorld) / det;
      iMin = Math.min(iMin, ii); iMax = Math.max(iMax, ii);
      jMin = Math.min(jMin, jj); jMax = Math.max(jMax, jj);
    });
    iMin = Math.floor(iMin) - 2; iMax = Math.ceil(iMax) + 2;
    jMin = Math.floor(jMin) - 2; jMax = Math.ceil(jMax) + 2;

    // lokális → világ-koord transzformáció (a felület közepe körül forgatva)
    const toWorld = (lx, ly) => ({ x: ctrX + lx * ax + ly * bx, y: ctrY + lx * ay + ly * by });

    const acc = newLayoutAcc();
    for (let j = jMin; j <= jMax; j++) {
      for (let i = iMin; i <= iMax; i++) {
        const slx = i * (H + W) + j * (W - H);
        const sly = i * (W - H) + j * (H + W);
        // 4 lap lokális (lx, ly, tw, th) — a forgatott rendszerben ezek lesznek a quad sarkai
        const cellTiles = [
          { lx: slx,            ly: sly,            tw: w, th: h },  // V1
          { lx: slx + W,        ly: sly,            tw: h, th: w },  // H1
          { lx: slx + W,        ly: sly + W,        tw: w, th: h },  // V2
          { lx: slx + 2 * W,    ly: sly + W,        tw: h, th: w },  // H2
        ];
        cellTiles.forEach((t, idx) => {
          const quad = [
            toWorld(t.lx,              t.ly),
            toWorld(t.lx + t.tw,       t.ly),
            toWorld(t.lx + t.tw,       t.ly + t.th),
            toWorld(t.lx,              t.ly + t.th),
          ];
          // bbox check world-ben
          const qminX = Math.min(quad[0].x, quad[1].x, quad[2].x, quad[3].x);
          const qmaxX = Math.max(quad[0].x, quad[1].x, quad[2].x, quad[3].x);
          const qminY = Math.min(quad[0].y, quad[1].y, quad[2].y, quad[3].y);
          const qmaxY = Math.max(quad[0].y, quad[1].y, quad[2].y, quad[3].y);
          if (qmaxX < minX || qminX > maxX || qmaxY < minY || qminY > maxY) return;
          // a lap sokszögbe eső része, a kivágások levonásával; a méretet a lap
          // SAJÁT tengelyei mentén mérjük (origó: quad[0], a lap bal-felső sarka)
          const piece = clipPolygonByConvex(p, quad);
          if (piece.length < 3) return;
          const rest = pieceMinusCutouts(piece, cutouts, cells, quad[0], ax, ay, bx, by);
          if (rest.area < t.tw * t.th * 0.004) return; // gyakorlatilag nincs burkolható rész
          acc.tilesAreaSumMm2 += rest.area;

          const isWhole = rest.area >= t.tw * t.th * 0.985;
          acc.total++;
          const key = i + "_" + j + "_" + idx;
          const type = overrideType(key, base);

          if (isWhole) {
            acc.whole++;
            bumpType(acc.byType, type, true, rest.area);
          } else {
            acc.cut++;
            const pw = rest.w, ph = rest.h;
            acc.cutLabels.push({ x: rest.cx, y: rest.cy, w: pw, h: ph, text: (tilted ? "~" : "") + fmtDim(pw, ph) });
            // Az újrahasznosítás-számítás a lapot h × w (hosszú × rövid) tájolásban
            // nézi: az álló (V) lapok darabjait ehhez elforgatva adjuk át.
            const dims = t.tw === w ? { w: ph, h: pw } : { w: pw, h: ph };
            acc.needPieces.push({ w: dims.w, h: dims.h, typeId: type.id });
            bumpType(acc.byType, type, false, rest.area);
          }
          acc.tiles.push({ key, typeId: type.id, quad });
        });
      }
    }
    return finishLayout(g, acc, h, w);
  }

  // ---- Rajzolás: egy computeLayout-eredmény kirajzolása a (bármely) ctx-re ----
  // opts.codes: a vágott darabok feliratában a vágási terv kódja is (PDF)
  function drawLayoutResult(res, opts) {
    if (!res || res.degenerate) return;
    const { minX, minY, maxX, maxY } = res.g;
    const scale = state.view.scale;
    const base = baseTile();
    const typeById = new Map(state.tiles.types.map((t) => [t.id, t]));

    ctx.save();
    polygonScreenPath();
    ctx.clip();
    // kivágások lyukként: egy nagy téglalap + a nem átfedő kivágás-cellák
    // evenodd-szabállyal (átfedő kivágásoknál sem „töltődik vissza” a lap)
    const cells = cutoutCells(state.cutouts);
    if (cells.length) {
      const m0 = worldToScreen({ x: minX, y: minY }), m1 = worldToScreen({ x: maxX, y: maxY });
      ctx.beginPath();
      ctx.rect(m0.x - 10, m0.y - 10, m1.x - m0.x + 20, m1.y - m0.y + 20);
      cells.forEach((c) => {
        const a = worldToScreen({ x: c.x, y: c.y });
        const b = worldToScreen({ x: c.x + c.w, y: c.y + c.h });
        ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
      });
      ctx.clip("evenodd");
    }

    // fuga háttér (a clip miatt csak a sokszögön belül látszik)
    const tl = worldToScreen({ x: minX, y: minY });
    const br = worldToScreen({ x: maxX, y: maxY });
    ctx.fillStyle = state.tiles.groutColor;
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    res.tiles.forEach((t) => {
      const type = typeById.get(t.typeId) || base;
      if (t.quad) {
        drawQuadFill(type, t.quad);
      } else {
        const s0 = worldToScreen({ x: t.rect.x, y: t.rect.y });
        drawTileFill(type, s0.x, s0.y, t.rect.w * scale, t.rect.h * scale);
      }
    });
    ctx.restore();

    // vágott darabok méret-feliratai (a clip-en kívül, a lapok fölé)
    const withCodes = !!(opts && opts.codes);
    res.cutLabels.forEach((c) => {
      const s = worldToScreen({ x: c.x, y: c.y });
      const text = c.text || fmtDim(c.w, c.h);
      // kódos (PDF) feliratban L-darabnál csak a befoglaló méret — a teljes
      // „L a×b / c×d” méret a vágási terv ábrája alatt szerepel
      if (withCodes && c.code) drawCodeCutLabel(c.code, text.split(" / ")[0], s.x, s.y);
      else drawCutLabel(text, s.x, s.y);
    });
  }

  // Kirajzolás a jelenlegi ctx-re (export, 3D-textúra); a statisztikát nem közli.
  function drawLayout(opts) {
    const res = getLayout();
    drawLayoutResult(res, opts);
    return res;
  }

  // A (látható) aktív felület kiosztás-eredményének közlése: Kiosztás fül
  // számai, anyagkimutatás + felület-cache, export-statisztika.
  function publishLayoutStats(res) {
    // aktív szél-igazításnál a letiltott kézi mezőkben a számolt érték
    if (res && state.layout.alignMode !== "none") {
      if (el.offX.disabled) el.offX.value = fromMm(res.g.offX).toFixed(state.unit === "cm" ? 1 : 0);
      if (el.offY.disabled) el.offY.value = fromMm(res.g.offY).toFixed(state.unit === "cm" ? 1 : 0);
    }
    const st = res && res.stats;
    if (!st) {
      setLayoutCounts(res && res.degenerate ? { total: 0, whole: 0, cut: 0 } : null);
      updateMaterialReport(null);
      lastStats = null;
      lastCutPieces = [];
      return;
    }
    setLayoutCounts(st);
    updateMaterialReport(st);
    lastStats = { whole: st.whole, cut: st.cut, tilesNeeded: st.tilesNeeded, areaMm2: st.areaMm2, tileAreaMm2: st.tileAreaMm2, groutAreaMm2: st.groutAreaMm2 };
    lastCutPieces = res.cutLabels.map((c) => ({ w: c.w, h: c.h }));
  }

  // Festő-paletta (egyedi lapok): „Alap" (radír) + a könyvtár típusai
