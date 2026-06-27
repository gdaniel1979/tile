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

  function drawLayout() {
    const g = computeGrid();
    if (!g) { setLayoutCounts(null); updateMaterialReport(null); return; }
    const { base, minX, minY, maxX, maxY, tileW, tileH, pitchX, pitchY, originX, originY, offX, offY } = g;
    const p = state.points;
    const scale = state.view.scale;

    // aktív szél-igazításnál a letiltott kézi mezőkben a számolt érték
    if (state.layout.alignMode !== "none") {
      if (el.offX.disabled) el.offX.value = fromMm(offX).toFixed(state.unit === "cm" ? 1 : 0);
      if (el.offY.disabled) el.offY.value = fromMm(offY).toFixed(state.unit === "cm" ? 1 : 0);
    }

    // átlós minta: külön (elforgatott) renderelő ág
    if (state.layout.pattern === "diagonal") { drawDiagonalLayout(g); return; }
    // halszálka (herringbone): saját elrendezés ferde rácsra L-párokkal
    if (state.layout.pattern === "herringbone") { drawHerringboneLayout(g); return; }

    // kötésminta: eltolt (téglakötés) soronkénti x-eltolás
    const offFrac = state.layout.pattern === "offset" ? (state.layout.offsetPct || 0) / 100 : 0;

    const i0 = Math.floor((minX - originX) / pitchX) - 2;
    const i1 = Math.ceil((maxX - originX) / pitchX) + 1;
    const j0 = Math.floor((minY - originY) / pitchY) - 1;
    const j1 = Math.ceil((maxY - originY) / pitchY) + 1;

    const cutouts = state.cutouts || [];
    ctx.save();
    polygonScreenPath();
    // a kivágásokat lyukként adjuk a path-hoz (evenodd kitöltési szabály)
    cutouts.forEach((c) => {
      const a = worldToScreen({ x: c.x, y: c.y });
      const b = worldToScreen({ x: c.x + c.w, y: c.y + c.h });
      ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    });
    ctx.clip("evenodd");

    // fuga háttér (a clip miatt csak a sokszögön belül látszik)
    const tl = worldToScreen({ x: minX, y: minY });
    const br = worldToScreen({ x: maxX, y: maxY });
    ctx.fillStyle = state.tiles.groutColor;
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    let total = 0, whole = 0, cut = 0;
    let tilesAreaSumMm2 = 0; // a ténylegesen lerakott (esetleg vágott) lapok területének összege
    const cutLabels = []; // { x, y, w, h } – világkoordinátában, a vágott darabokhoz
    const types = state.tiles.types;
    const overrides = state.layout.overrides;
    const byType = {}; // typeId -> { id, name, area, whole, cut, cutLabels[] }
    const bumpType = (typeObj, isWhole, areaMm2, labelDims) => {
      const id = typeObj.id;
      if (!byType[id]) byType[id] = { id, name: typeObj.name || "lap", area: 0, whole: 0, cut: 0, cutLabels: [] };
      const g = byType[id];
      g.area += areaMm2;
      if (isWhole) g.whole++; else g.cut++;
      if (labelDims) g.cutLabels.push(labelDims);
    };

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
        tilesAreaSumMm2 += area;

        // egyedi felülírás: a cellához rendelt típus megjelenése, ha van
        const ovId = overrides[i + "_" + j];
        const type = ovId ? (types.find((t) => t.id === ovId) || base) : base;

        total++;
        const isWhole = subs.length === 1 && subs[0].w >= tileW - 0.5 && subs[0].h >= tileH - 0.5;
        const typeCutDims = []; // ehhez a laphoz tartozó cut-darabok (újrahaszn. szám.)
        if (isWhole) {
          whole++;
        } else {
          cut++;
          // a darabokat összefüggő komponensekre csoportosítjuk
          const comps = groupConnected(subs);
          for (const comp of comps) {
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
            cutLabels.push({ x: big.x + big.w / 2, y: big.y + big.h / 2, w: cbw, h: cbh, text });
            typeCutDims.push({ w: cbw, h: cbh });
          }
        }
        // típusonkénti aggregáció (vízszintes/függőleges base, override-olt is)
        if (isWhole) bumpType(type, true, area, null);
        else typeCutDims.forEach((d, idx) => bumpType(type, false, idx === 0 ? area : 0, d));

        const s0 = worldToScreen({ x: x0, y: y0 });
        const sw = tileW * scale, sh = tileH * scale;
        drawTileFill(type, s0.x, s0.y, sw, sh);
      }
    }

    ctx.restore();

    // vágott darabok méret-feliratai (a clip-en kívül, a lapok fölé)
    cutLabels.forEach((c) => {
      const s = worldToScreen({ x: c.x, y: c.y });
      drawCutLabel(c.text || fmtDim(c.w, c.h), s.x, s.y);
    });

    setLayoutCounts({ total, whole, cut });

    // anyagkimutatás (reális újrahasznosítással) – a burkolt terület a kivágások nélkül
    const cutTilesNeeded = tilesNeededForCuts(cutLabels, tileW, tileH);
    const areaMm2 = Math.max(0, shoelaceAreaMm2() - cutoutsAreaMm2());
    const tilesNeeded = whole + cutTilesNeeded;
    // típusonkénti szükséges lap-számok (újrahaszn. a típus saját cut-darabjaira)
    const byTypeOut = {};
    Object.keys(byType).forEach((id) => {
      const g = byType[id];
      const needed = g.whole + tilesNeededForCuts(g.cutLabels, tileW, tileH);
      byTypeOut[id] = { id: g.id, name: g.name, area: g.area, whole: g.whole, cut: g.cut, needed, tileAreaMm2: tileW * tileH };
    });
    // fuga geometriailag: a burkolt területből levonjuk a lerakott lap-darabok összesített területét
    const groutAreaMm2 = Math.max(0, areaMm2 - tilesAreaSumMm2);
    updateMaterialReport({ areaMm2, tilesNeeded, tileAreaMm2: tileW * tileH, groutAreaMm2, whole, cut, byType: byTypeOut });

    // statisztikák megőrzése export/nyomtatáshoz
    lastStats = { whole, cut, tilesNeeded, areaMm2, tileAreaMm2: tileW * tileH, groutAreaMm2 };
    lastCutPieces = cutLabels.map((c) => ({ w: c.w, h: c.h }));
  }

  // ÁTLÓS (45°) kiosztás – elforgatott rács. A vágási méret a lap saját
  // tengelye mentén (közelítő a kivágásoknál és a kontúr ferde éleinél).
  function drawDiagonalLayout(g) {
    const { base, minX, minY, maxX, maxY, tileW, tileH, grout } = g;
    const p = state.points;
    const scale = state.view.scale;
    const th = Math.PI / 4;
    const ux = Math.cos(th), uy = Math.sin(th);   // lap-szélesség tengely
    const vx = -Math.sin(th), vy = Math.cos(th);  // lap-magasság tengely
    const pU = tileW + grout, pV = tileH + grout;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const cutouts = state.cutouts || [];
    const types = state.tiles.types, overrides = state.layout.overrides;
    const inCutPt = (px, py) => { for (const c of cutouts) if (px > c.x && px < c.x + c.w && py > c.y && py < c.y + c.h) return true; return false; };

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

    ctx.save();
    polygonScreenPath();
    cutouts.forEach((c) => { const a = worldToScreen({ x: c.x, y: c.y }), b = worldToScreen({ x: c.x + c.w, y: c.y + c.h }); ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y); });
    ctx.clip("evenodd");
    const tl = worldToScreen({ x: minX, y: minY }), br = worldToScreen({ x: maxX, y: maxY });
    ctx.fillStyle = state.tiles.groutColor;
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    let total = 0, whole = 0, cut = 0;
    let tilesAreaSumMm2 = 0;
    const cutLabels = [];
    const byType = {};
    const bumpType = (typeObj, isWhole, areaMm2, labelDims) => {
      const id = typeObj.id;
      if (!byType[id]) byType[id] = { id, name: typeObj.name || "lap", area: 0, whole: 0, cut: 0, cutLabels: [] };
      const g = byType[id];
      g.area += areaMm2;
      if (isWhole) g.whole++; else g.cut++;
      if (labelDims) g.cutLabels.push(labelDims);
    };

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

        const cenx = (c0.x + c2.x) / 2, ceny = (c0.y + c2.y) / 2;
        let cornersInCut = 0, anyInside = false;
        quad.forEach((q) => { const inP = pointInPolygon(q.x, q.y, p); if (inP) anyInside = true; if (inCutPt(q.x, q.y)) cornersInCut++; });
        const centerIn = pointInPolygon(cenx, ceny, p), centerCut = inCutPt(cenx, ceny);
        if (!anyInside && !centerIn) continue;
        if (centerCut && cornersInCut === 4) continue; // gyakorlatilag kivágásban

        // a lap sokszögbe eső része (a kivágásokat itt nem vonjuk le – közelítés)
        const piece = clipPolygonByConvex(p, quad);
        if (piece.length < 3) continue;
        let pieceArea = 0;
        for (let k = 0; k < piece.length; k++) { const a = piece[k], b = piece[(k + 1) % piece.length]; pieceArea += a.x * b.y - b.x * a.y; }
        pieceArea = Math.abs(pieceArea) / 2;
        if (pieceArea < tileW * tileH * 0.004) continue;
        tilesAreaSumMm2 += pieceArea;

        const touchesCut = centerCut || cornersInCut > 0;
        const isWhole = pieceArea >= tileW * tileH * 0.985 && !touchesCut;
        let label = null;
        if (!isWhole) {
          let lu0 = Infinity, lu1 = -Infinity, lv0 = Infinity, lv1 = -Infinity, pcx = 0, pcy = 0;
          piece.forEach((q) => {
            const rx = q.x - Ax, ry = q.y - Ay;
            const lu = rx * ux + ry * uy, lv = rx * vx + ry * vy;
            lu0 = Math.min(lu0, lu); lu1 = Math.max(lu1, lu); lv0 = Math.min(lv0, lv); lv1 = Math.max(lv1, lv);
            pcx += q.x; pcy += q.y;
          });
          pcx /= piece.length; pcy /= piece.length;
          const pw = Math.max(0, lu1 - lu0), ph = Math.max(0, lv1 - lv0);
          label = { x: pcx, y: pcy, w: pw, h: ph, text: "~" + fmtDim(pw, ph) };
        }

        total++;
        if (isWhole) whole++; else { cut++; cutLabels.push(label); }

        const ovId = overrides[i + "_" + j];
        const type = ovId ? (types.find((t) => t.id === ovId) || base) : base;
        if (isWhole) bumpType(type, true, pieceArea, null);
        else bumpType(type, false, pieceArea, label ? { w: label.w, h: label.h } : null);
        drawQuadFill(type, quad);
      }
    }
    ctx.restore();

    cutLabels.forEach((c) => { const s = worldToScreen({ x: c.x, y: c.y }); drawCutLabel(c.text, s.x, s.y); });
    setLayoutCounts({ total, whole, cut });
    const cutTilesNeeded = tilesNeededForCuts(cutLabels.map((c) => ({ w: c.w, h: c.h })), tileW, tileH);
    const areaMm2 = Math.max(0, shoelaceAreaMm2() - cutoutsAreaMm2());
    const tilesNeeded = whole + cutTilesNeeded;
    const byTypeOut = {};
    Object.keys(byType).forEach((id) => {
      const g = byType[id];
      const needed = g.whole + tilesNeededForCuts(g.cutLabels, tileW, tileH);
      byTypeOut[id] = { id: g.id, name: g.name, area: g.area, whole: g.whole, cut: g.cut, needed, tileAreaMm2: tileW * tileH };
    });
    const groutAreaMm2 = Math.max(0, areaMm2 - tilesAreaSumMm2);
    updateMaterialReport({ areaMm2, tilesNeeded, tileAreaMm2: tileW * tileH, groutAreaMm2, whole, cut, byType: byTypeOut });
    lastStats = { whole, cut, tilesNeeded, areaMm2, tileAreaMm2: tileW * tileH, groutAreaMm2 };
    lastCutPieces = cutLabels.map((c) => ({ w: c.w, h: c.h }));
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
  function drawHerringboneLayout(g) {
    const { base, minX, minY, maxX, maxY, grout, tileW, tileH } = g;
    const p = state.points;
    const scale = state.view.scale;
    let w = Math.min(tileW, tileH);
    let h = Math.max(tileW, tileH);
    if (Math.abs(h - w) < 0.01) {
      // négyzetes lap → halszálka degenerál; egyszerű rács szebb
      setLayoutCounts({ total: 0, whole: 0, cut: 0 });
      updateMaterialReport(null);
      return;
    }
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
    const types = state.tiles.types;
    const overrides = state.layout.overrides;

    ctx.save();
    polygonScreenPath();
    cutouts.forEach((c) => {
      const a = worldToScreen({ x: c.x, y: c.y });
      const b = worldToScreen({ x: c.x + c.w, y: c.y + c.h });
      ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    });
    ctx.clip("evenodd");
    const tl = worldToScreen({ x: minX, y: minY }), br = worldToScreen({ x: maxX, y: maxY });
    ctx.fillStyle = state.tiles.groutColor;
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    let total = 0, whole = 0, cut = 0;
    let tilesAreaSumMm2 = 0;
    const cutLabels = [];
    const byType = {};
    const bumpType = (typeObj, isWhole, areaMm2, labelDims) => {
      const id = typeObj.id;
      if (!byType[id]) byType[id] = { id, name: typeObj.name || "lap", area: 0, whole: 0, cut: 0, cutLabels: [] };
      const gr = byType[id];
      gr.area += areaMm2;
      if (isWhole) gr.whole++; else gr.cut++;
      if (labelDims) gr.cutLabels.push(labelDims);
    };
    const inCutPt = (px, py) => { for (const c of cutouts) if (px > c.x && px < c.x + c.w && py > c.y && py < c.y + c.h) return true; return false; };

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
          // középpont kivágás-check
          const tcx = (quad[0].x + quad[2].x) / 2, tcy = (quad[0].y + quad[2].y) / 2;
          if (inCutPt(tcx, tcy)) return;
          const piece = clipPolygonByConvex(p, quad);
          if (piece.length < 3) return;
          let pieceArea = 0;
          for (let k = 0; k < piece.length; k++) {
            const a = piece[k], b = piece[(k + 1) % piece.length];
            pieceArea += a.x * b.y - b.x * a.y;
          }
          pieceArea = Math.abs(pieceArea) / 2;
          if (pieceArea < t.tw * t.th * 0.004) return;
          tilesAreaSumMm2 += pieceArea;

          const tileArea = t.tw * t.th;
          const isWhole = pieceArea >= tileArea * 0.985;
          total++;
          const ovKey = i + "_" + j + "_" + idx;
          const ovId = overrides[ovKey];
          const type = ovId ? (types.find((x) => x.id === ovId) || base) : base;

          if (isWhole) {
            whole++;
            bumpType(type, true, pieceArea, null);
          } else {
            cut++;
            // a vágott darab méretét a lap SAJÁT tengelyei mentén mérjük (forgatott rendszerben)
            // origó: a lap bal-felső sarka (quad[0]) világ-koordinátában.
            let lu0 = Infinity, lu1 = -Infinity, lv0 = Infinity, lv1 = -Infinity, pcx = 0, pcy = 0;
            piece.forEach((q) => {
              const rx = q.x - quad[0].x, ry = q.y - quad[0].y;
              const lu = rx * ax + ry * ay;
              const lv = rx * bx + ry * by;
              lu0 = Math.min(lu0, lu); lu1 = Math.max(lu1, lu);
              lv0 = Math.min(lv0, lv); lv1 = Math.max(lv1, lv);
              pcx += q.x; pcy += q.y;
            });
            pcx /= piece.length; pcy /= piece.length;
            const pw = Math.max(0, lu1 - lu0), ph = Math.max(0, lv1 - lv0);
            cutLabels.push({ x: pcx, y: pcy, w: pw, h: ph, text: (tilted ? "~" : "") + fmtDim(pw, ph) });
            bumpType(type, false, pieceArea, { w: pw, h: ph });
          }
          drawQuadFill(type, quad);
        });
      }
    }
    ctx.restore();

    cutLabels.forEach((c) => { const s = worldToScreen({ x: c.x, y: c.y }); drawCutLabel(c.text, s.x, s.y); });
    setLayoutCounts({ total, whole, cut });
    const cutTilesNeeded = tilesNeededForCuts(cutLabels.map((c) => ({ w: c.w, h: c.h })), h, w);
    const areaMm2 = Math.max(0, shoelaceAreaMm2() - cutoutsAreaMm2());
    const tilesNeeded = whole + cutTilesNeeded;
    const byTypeOut = {};
    Object.keys(byType).forEach((id) => {
      const gr = byType[id];
      const needed = gr.whole + tilesNeededForCuts(gr.cutLabels, h, w);
      byTypeOut[id] = { id: gr.id, name: gr.name, area: gr.area, whole: gr.whole, cut: gr.cut, needed, tileAreaMm2: w * h };
    });
    const groutAreaMm2 = Math.max(0, areaMm2 - tilesAreaSumMm2);
    updateMaterialReport({ areaMm2, tilesNeeded, tileAreaMm2: w * h, groutAreaMm2, whole, cut, byType: byTypeOut });
    lastStats = { whole, cut, tilesNeeded, areaMm2, tileAreaMm2: w * h, groutAreaMm2 };
    lastCutPieces = cutLabels.map((c) => ({ w: c.w, h: c.h }));
  }

  // Festő-paletta (egyedi lapok): „Alap" (radír) + a könyvtár típusai
