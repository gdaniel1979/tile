"use strict";
  function shouldDrawLayout() {
    return state.layout.show && state.closed && state.points.length >= 3 && !!baseTile();
  }

  // ---- Kivágások (nem burkolt téglalapok) ------------------------------
  function rectContains(c, x0, y0, x1, y1) {
    return x0 >= c.x && y0 >= c.y && x1 <= c.x + c.w && y1 <= c.y + c.h;
  }
  function rectsOverlap(c, x0, y0, x1, y1) {
    return !(x1 <= c.x || x0 >= c.x + c.w || y1 <= c.y || y0 >= c.y + c.h);
  }
  function cutoutsAreaMm2() {
    let a = 0;
    (state.cutouts || []).forEach((c) => { a += Math.max(0, c.w) * Math.max(0, c.h); });
    return a;
  }

  // Egy lap (x0..y1) burkolható résztéglalapjai: a KONTÚR csúcskoordinátáit és
  // a KIVÁGÁS-éleket rácsvonalként használva felbontjuk, és a cellákat a valódi
  // sokszöggel (pointInPolygon) + kivágásokkal osztályozzuk. Konkáv kontúrra is jó.
  function cutTilePieces(x0, y0, x1, y1, outline, cutouts) {
    const xs = new Set([x0, x1]);
    const ys = new Set([y0, y1]);
    const inx = (v) => v > x0 + 0.01 && v < x1 - 0.01;
    const iny = (v) => v > y0 + 0.01 && v < y1 - 0.01;

    // rácsvonalak CSAK azokból a kontúr-élekből, amelyek ténylegesen metszik a lapot
    const n = outline.length;
    for (let k = 0; k < n; k++) {
      const a = outline[k], b = outline[(k + 1) % n];
      const eMinX = Math.min(a.x, b.x), eMaxX = Math.max(a.x, b.x);
      const eMinY = Math.min(a.y, b.y), eMaxY = Math.max(a.y, b.y);
      if (eMaxX <= x0 || eMinX >= x1 || eMaxY <= y0 || eMinY >= y1) continue;
      if (Math.abs(a.x - b.x) < 0.01) {            // függőleges él
        if (inx(a.x)) xs.add(a.x);
      } else if (Math.abs(a.y - b.y) < 0.01) {     // vízszintes él
        if (iny(a.y)) ys.add(a.y);
      } else {                                     // ferde él – a lap-metszéspontok
        const dx = b.x - a.x, dy = b.y - a.y;
        const cand = [];
        [x0, x1].forEach((X) => { const t = (X - a.x) / dx; if (t >= 0 && t <= 1) cand.push({ x: X, y: a.y + t * dy }); });
        [y0, y1].forEach((Y) => { const t = (Y - a.y) / dy; if (t >= 0 && t <= 1) cand.push({ x: a.x + t * dx, y: Y }); });
        if (a.x > x0 && a.x < x1 && a.y > y0 && a.y < y1) cand.push(a);
        if (b.x > x0 && b.x < x1 && b.y > y0 && b.y < y1) cand.push(b);
        cand.forEach((pt) => { if (inx(pt.x)) xs.add(pt.x); if (iny(pt.y)) ys.add(pt.y); });
      }
    }
    // kivágás-élek (csak az átfedő kivágásokból)
    cutouts.forEach((c) => {
      if (c.x + c.w <= x0 || c.x >= x1 || c.y + c.h <= y0 || c.y >= y1) return;
      [c.x, c.x + c.w].forEach((cx) => { if (inx(cx)) xs.add(cx); });
      [c.y, c.y + c.h].forEach((cy) => { if (iny(cy)) ys.add(cy); });
    });
    const X = [...xs].sort((a, b) => a - b);
    const Y = [...ys].sort((a, b) => a - b);
    const nx = X.length - 1, ny = Y.length - 1;
    if (nx < 1 || ny < 1) return [];

    // cellák osztályozása (burkolható-e a középpontja)
    const T = [];
    for (let i = 0; i < nx; i++) {
      T[i] = [];
      for (let j = 0; j < ny; j++) {
        const ax = X[i], bx = X[i + 1], ay = Y[j], by = Y[j + 1];
        if (bx - ax < 0.5 || by - ay < 0.5) { T[i][j] = false; continue; }
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        let ok = pointInPolygon(mx, my, outline);
        if (ok) for (const c of cutouts) { if (mx > c.x && mx < c.x + c.w && my > c.y && my < c.y + c.h) { ok = false; break; } }
        T[i][j] = ok;
      }
    }

    // mohó összevonás maximális téglalapokká (jobbra, majd lefelé)
    const used = [];
    for (let i = 0; i < nx; i++) used[i] = new Array(ny).fill(false);
    const rects = [];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        if (!T[i][j] || used[i][j]) continue;
        let w = 1;
        while (i + w < nx && T[i + w][j] && !used[i + w][j]) w++;
        let h = 1;
        let canDown = true;
        while (j + h < ny && canDown) {
          for (let k = 0; k < w; k++) { if (!T[i + k][j + h] || used[i + k][j + h]) { canDown = false; break; } }
          if (canDown) h++;
        }
        for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) used[i + a][j + b] = true;
        rects.push({ x: X[i], y: Y[j], w: X[i + w] - X[i], h: Y[j + h] - Y[j] });
      }
    }
    return rects;
  }

  // Téglalapok összefüggő komponensekre csoportosítása (érintkező téglalapok)
  function groupConnected(rects) {
    const n = rects.length;
    const parent = rects.map((_, i) => i);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const eps = 0.5;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = rects[i], b = rects[j];
        const xTouch = Math.abs((a.x + a.w) - b.x) < eps || Math.abs((b.x + b.w) - a.x) < eps;
        const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > eps;
        const yTouch = Math.abs((a.y + a.h) - b.y) < eps || Math.abs((b.y + b.h) - a.y) < eps;
        const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > eps;
        if ((xTouch && yOverlap) || (yTouch && xOverlap)) parent[find(i)] = find(j);
      }
    }
    const groups = {};
    for (let i = 0; i < n; i++) { const r = find(i); (groups[r] = groups[r] || []).push(rects[i]); }
    return Object.values(groups);
  }

  // Egy téglalap (rx0..ry1) felbontása a kivágások KIHAGYÁSÁVAL keletkező
  // burkolható résztéglalapokra (tengelypárhuzamos rácsfelbontás).
  function tileableRectPieces(rx0, ry0, rx1, ry1, cutouts) {
    const xs = new Set([rx0, rx1]);
    const ys = new Set([ry0, ry1]);
    cutouts.forEach((c) => {
      const cx0 = Math.max(c.x, rx0), cx1 = Math.min(c.x + c.w, rx1);
      const cy0 = Math.max(c.y, ry0), cy1 = Math.min(c.y + c.h, ry1);
      if (cx1 > cx0 && cy1 > cy0) { xs.add(cx0); xs.add(cx1); ys.add(cy0); ys.add(cy1); }
    });
    const X = [...xs].sort((a, b) => a - b);
    const Y = [...ys].sort((a, b) => a - b);
    const pieces = [];
    for (let i = 0; i < X.length - 1; i++) {
      for (let j = 0; j < Y.length - 1; j++) {
        const ax = X[i], bx = X[i + 1], ay = Y[j], by = Y[j + 1];
        if (bx - ax < 0.5 || by - ay < 0.5) continue;
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        let inCut = false;
        for (const c of cutouts) {
          if (mx > c.x && mx < c.x + c.w && my > c.y && my < c.y + c.h) { inCut = true; break; }
        }
        if (!inCut) pieces.push({ x: ax, y: ay, w: bx - ax, h: by - ay });
      }
    }
    return pieces;
  }

  function hexAlpha(hex, a) {
    const h = (hex || "#888888").replace("#", "");
    const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function cutoutColor(kind) {
    return kind === "untiled" ? ((project && project.untiledColor) || "#8a8f98") : OPENING_COLOR;
  }

  function drawCutouts() {
    cutoutLabelRects = [];
    const cuts = state.cutouts || [];
    if (!cuts.length && !pendingCutout) return;
    ctx.save();
    cuts.forEach((c, ci) => {
      const col = cutoutColor(c.kind);
      const selected = ci === selectedCutout;
      const a = worldToScreen({ x: c.x, y: c.y });
      const b = worldToScreen({ x: c.x + c.w, y: c.y + c.h });
      const sw = b.x - a.x, sh = b.y - a.y;
      const img = c.imageUrl ? getImage(c.imageUrl) : null;
      ctx.setLineDash(selected ? [] : [6, 4]);
      ctx.lineWidth = selected ? 2.5 : 1.5;
      if (img) {
        // kép a teljes nyílást kitölti (a méretek a tényleges ajtó/ablak méretét reprezentálják)
        ctx.drawImage(img, a.x, a.y, sw, sh);
      } else {
        ctx.fillStyle = hexAlpha(col, selected ? 0.32 : 0.22);
        ctx.fillRect(a.x, a.y, sw, sh);
      }
      ctx.strokeStyle = selected ? "#ffcc4c" : col;
      ctx.strokeRect(a.x, a.y, sw, sh);
      ctx.setLineDash([]);
      // Élvédős kivágás-élek piros vastag vonallal felülrajzolva
      const eEdg = Array.isArray(c.edgeEdgings) ? c.edgeEdgings : [];
      if (eEdg.some((x) => x)) {
        ctx.save();
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#e5534b";
        // [top, right, bottom, left]
        const edges = [
          [a.x, a.y, b.x, a.y],   // top
          [b.x, a.y, b.x, b.y],   // right
          [a.x, b.y, b.x, b.y],   // bottom
          [a.x, a.y, a.x, b.y],   // left
        ];
        edges.forEach(([x1, y1, x2, y2], ei) => {
          if (!eEdg[ei]) return;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        });
        ctx.restore();
      }
      // a méret-feliratok csak a kijelölt (szerkesztett) kivágáson látszanak
      if (selected) {
        const topMid = worldToScreen({ x: c.x + c.w / 2, y: c.y });
        const leftMid = worldToScreen({ x: c.x, y: c.y + c.h / 2 });
        cutoutLabelRects.push({ ci, dim: "w", ...drawLabel(fmtLen(c.w), topMid.x, topMid.y) });
        cutoutLabelRects.push({ ci, dim: "h", ...drawLabel(fmtLen(c.h), leftMid.x, leftMid.y) });
      }
    });
    if (pendingCutout) {
      const col = cutoutColor(newCutoutKind);
      const a = worldToScreen({ x: pendingCutout.x, y: pendingCutout.y });
      const b = worldToScreen({ x: pendingCutout.x + pendingCutout.w, y: pendingCutout.y + pendingCutout.h });
      ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
      ctx.fillStyle = hexAlpha(col, 0.3);
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeStyle = col;
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function cutoutLabelAt(sx, sy) {
    for (const r of cutoutLabelRects) {
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return r;
    }
    return null;
  }

  // Melyik kivágás téglalapjába esik egy képernyő-pont (felülről lefelé).
  // 4 px-es padding-gal: nagyon vékony lelógó/kis kivágást is könnyebb megfogni.
  function cutoutAt(sx, sy) {
    const cuts = state.cutouts || [];
    const pad = 4;
    for (let i = cuts.length - 1; i >= 0; i--) {
      const c = cuts[i];
      const a = worldToScreen({ x: c.x, y: c.y });
      const b = worldToScreen({ x: c.x + c.w, y: c.y + c.h });
      if (sx >= a.x - pad && sx <= b.x + pad && sy >= a.y - pad && sy <= b.y + pad) return i;
    }
    return -1;
  }

  // Húzott kivágás snap-elése: a felület-bbox ÉS a többi kivágás 4-4 éléhez.
  // Bármelyik él (bal/jobb/fent/lent) találkozhat bármelyik kandidátussal.
  // Visszaadja az új x,y-t + a snap-eléshez tartozó "guide"-vonalakat (vizuális).
  function snapCutoutDuringDrag(c, nx, ny) {
    const thr = 14 / state.view.scale;
    const b = planBounds();
    const candX = [], candY = [];
    if (b) {
      candX.push({ v: b.minX, y0: b.minY, y1: b.maxY });
      candX.push({ v: b.maxX, y0: b.minY, y1: b.maxY });
      candY.push({ v: b.minY, x0: b.minX, x1: b.maxX });
      candY.push({ v: b.maxY, x0: b.minX, x1: b.maxX });
    }
    (state.cutouts || []).forEach((o) => {
      if (o === c) return;
      candX.push({ v: o.x, y0: o.y, y1: o.y + o.h });
      candX.push({ v: o.x + o.w, y0: o.y, y1: o.y + o.h });
      candY.push({ v: o.y, x0: o.x, x1: o.x + o.w });
      candY.push({ v: o.y + o.h, x0: o.x, x1: o.x + o.w });
    });
    const guides = [];
    // X tengely: a bal vagy a jobb él a legközelebbi kandidátushoz tapad
    let bestX = { diff: thr, val: nx, guide: null };
    for (const cand of candX) {
      // bal él találkozik a kandidátussal
      const d1 = Math.abs(nx - cand.v);
      if (d1 < bestX.diff) bestX = { diff: d1, val: cand.v, guide: { axis: "x", v: cand.v, a: cand.y0, b: cand.y1 } };
      // jobb él találkozik a kandidátussal
      const d2 = Math.abs((nx + c.w) - cand.v);
      if (d2 < bestX.diff) bestX = { diff: d2, val: cand.v - c.w, guide: { axis: "x", v: cand.v, a: cand.y0, b: cand.y1 } };
    }
    let bestY = { diff: thr, val: ny, guide: null };
    for (const cand of candY) {
      const d1 = Math.abs(ny - cand.v);
      if (d1 < bestY.diff) bestY = { diff: d1, val: cand.v, guide: { axis: "y", v: cand.v, a: cand.x0, b: cand.x1 } };
      const d2 = Math.abs((ny + c.h) - cand.v);
      if (d2 < bestY.diff) bestY = { diff: d2, val: cand.v - c.h, guide: { axis: "y", v: cand.v, a: cand.x0, b: cand.x1 } };
    }
    if (bestX.guide) guides.push(bestX.guide);
    if (bestY.guide) guides.push(bestY.guide);
    return { x: bestX.val, y: bestY.val, guides };
  }

  // A kivágást a felület-bbox-ra illeszti: ha nagyobb mint a bbox, lekicsinyíti;
  // majd a bbox-ba clamp-eli a pozíciót. Visszaadja, módosult-e.
  function fitCutoutToSurface(c) {
    const b = planBounds();
    if (!b) return false;
    const bw = b.maxX - b.minX, bh = b.maxY - b.minY;
    let changed = false;
    if (c.w > bw) { c.w = bw; changed = true; }
    if (c.h > bh) { c.h = bh; changed = true; }
    const nx = Math.max(b.minX, Math.min(c.x, b.maxX - c.w));
    const ny = Math.max(b.minY, Math.min(c.y, b.maxY - c.h));
    if (nx !== c.x || ny !== c.y) { c.x = nx; c.y = ny; changed = true; }
    return changed;
  }

  function setLayoutCounts(c) {
    if (!el.tileTotal) return;
    if (!c) {
      el.tileTotal.textContent = "–";
      el.tileWhole.textContent = "–";
      el.tileCut.textContent = "–";
      return;
    }
    el.tileTotal.textContent = c.total;
    el.tileWhole.textContent = c.whole;
    el.tileCut.textContent = c.cut;
  }

  // A rács paramétereinek kiszámítása (drawLayout és a festés is ezt használja)
  function computeGrid() {
    const base = baseTile();
    const p = state.points;
    if (!base || p.length < 3) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    p.forEach((pt) => {
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    });
    const grout = Math.max(0, state.tiles.groutMm);
    const tileW = state.layout.rotated ? base.hMm : base.wMm;
    const tileH = state.layout.rotated ? base.wMm : base.hMm;
    if (!(tileW > 0 && tileH > 0)) return null;
    const pitchX = tileW + grout, pitchY = tileH + grout;
    let offX = state.layout.offXmm, offY = state.layout.offYmm;
    if (state.layout.alignMode !== "none") {
      const thr = state.layout.thresholdMm;
      offX = alignAxis(maxX - minX, tileW, grout, state.layout.alignMode, thr);
      offY = alignAxis(maxY - minY, tileH, grout, state.layout.alignMode, thr);
    }
    // Padló-fal kötésvonal-illesztés: ha generált fal vagyunk és a kapcsoló be
    // van kapcsolva, az x-eltolódást a padló-rácsból számoljuk (csak vízszintes/
    // függőleges padló-élnél működik, ferde élnél nincs hatása).
    if (state.layout.linkToFloor && project && project.surfaces) {
      const s = project.surfaces[project.activeIndex];
      if (s && s.mode === "wall" && s.fromFloorId && typeof s.fromEdgeIndex === "number") {
        const floor = project.surfaces.find((x) => x.id === s.fromFloorId);
        if (floor && floor.points && floor.points.length >= 3 && floor.layout) {
          const fi = s.fromEdgeIndex, fn = floor.points.length;
          if (fi >= 0 && fi < fn) {
            const a = floor.points[fi], b = floor.points[(fi + 1) % fn];
            const dx = b.x - a.x, dy = b.y - a.y;
            // padló-rács pitch a saját baseTile + grout alapján
            const fBase = (project.tileTypes || []).find((t) => t.id === floor.baseId);
            if (fBase) {
              const fGrout = Math.max(0, floor.groutMm || 0);
              const fTileW = floor.layout.rotated ? fBase.hMm : fBase.wMm;
              const fTileH = floor.layout.rotated ? fBase.wMm : fBase.hMm;
              const fPitchX = fTileW + fGrout, fPitchY = fTileH + fGrout;
              // padló bbox + offXmm/offYmm — világ-koord. első rácsvonalak helye
              let fMinX = Infinity, fMinY = Infinity, fMaxX = -Infinity, fMaxY = -Infinity;
              floor.points.forEach((pt) => {
                fMinX = Math.min(fMinX, pt.x); fMaxX = Math.max(fMaxX, pt.x);
                fMinY = Math.min(fMinY, pt.y); fMaxY = Math.max(fMaxY, pt.y);
              });
              let fOffX = floor.layout.offXmm || 0, fOffY = floor.layout.offYmm || 0;
              if (floor.layout.alignMode !== "none") {
                fOffX = alignAxis(fMaxX - fMinX, fTileW, fGrout, floor.layout.alignMode, floor.layout.thresholdMm);
                fOffY = alignAxis(fMaxY - fMinY, fTileH, fGrout, floor.layout.alignMode, floor.layout.thresholdMm);
              }
              const mod = (x, m) => ((x % m) + m) % m;
              // Padló-él irányának eldöntése: csak vízszintes/függőleges éleknél
              if (Math.abs(dy) < 0.5) {
                // vízszintes padló-él → fal x-tengelye = ±x világ-tengely
                // padló-rács első vonalainak világ-x pozíciói: fMinX + fOffX + k * fPitchX
                // a fal x=0 pozíciója a P_start = a. Ha dx > 0, a fal jobbra megy (= +x);
                // ha dx < 0, balra megy (= -x).
                const dirSign = dx > 0 ? 1 : -1;
                // a padló-rács VONAL világ-x = fMinX + fOffX. A fal x=0 = a.x.
                // a fal saját x = dirSign * (worldX - a.x).
                // 0 helye a falon = dirSign * (fMinX + fOffX - a.x) modulo pitchX.
                offX = mod(dirSign * (fMinX + fOffX - a.x), fPitchX);
              } else if (Math.abs(dx) < 0.5) {
                // függőleges padló-él
                const dirSign = dy > 0 ? 1 : -1;
                offX = mod(dirSign * (fMinY + fOffY - a.y), fPitchY);
              }
            }
          }
        }
      }
    }
    return {
      base, minX, minY, maxX, maxY, grout, tileW, tileH, pitchX, pitchY,
      offX, offY, originX: minX + offX, originY: minY + offY,
    };
  }

  // Egy laptípus megjelenésének kirajzolása egy képernyő-téglalapba
