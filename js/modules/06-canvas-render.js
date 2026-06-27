"use strict";
  // ---- Rajzolás ----------------------------------------------------------
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const r = wrap.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + "px";
    canvas.style.height = r.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
    if (el.board3d && el.board3d.style.display !== "none") { resize3DCanvas(); render3D(); }
  }

  function cssSize() {
    const r = wrap.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  function drawGrid() {
    const { w, h } = cssSize();
    const g = state.gridMm * state.view.scale; // rács px
    if (g < 6) return; // túl sűrű, kihagyjuk
    // Az első rácsvonal képernyő-pozíciója
    const startX = ((state.view.ox % g) + g) % g;
    const startY = ((state.view.oy % g) + g) % g;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    for (let x = startX; x < w; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = startY; y < h; y += g) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    // Origó (0,0) jelölés
    const o = worldToScreen({ x: 0, y: 0 });
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(o.x - 8, o.y); ctx.lineTo(o.x + 8, o.y);
    ctx.moveTo(o.x, o.y - 8); ctx.lineTo(o.x, o.y + 8);
    ctx.stroke();
  }

  function drawPolygon(opts) {
    const hideVertices = !!(opts && opts.hideVertices);
    const p = state.points;
    if (p.length === 0) return;

    // Kitöltés (zárt) – ha a kiosztás látszik, a lapok adják a kitöltést
    if (state.closed && p.length >= 3 && !shouldDrawLayout()) {
      ctx.beginPath();
      p.forEach((pt, i) => {
        const s = worldToScreen(pt);
        i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fillStyle = state.mode === "floor"
        ? "rgba(76,154,255,0.10)"
        : "rgba(63,185,80,0.10)";
      ctx.fill();
    }

    // Élek
    ctx.lineWidth = 2;
    ctx.strokeStyle = state.mode === "floor" ? "#4c9aff" : "#3fb950";
    ctx.beginPath();
    p.forEach((pt, i) => {
      const s = worldToScreen(pt);
      i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
    });
    if (state.closed) ctx.closePath();
    ctx.stroke();

    // Élvédős élek piros vastag vonallal felülrajzolva (minden zárt felületen)
    if (state.closed && Array.isArray(state.edgeEdgings)) {
      ctx.save();
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#e5534b"; // var(--danger)
      for (let i = 0; i < edgeCount(); i++) {
        if (!state.edgeEdgings[i]) continue;
        const [a, b] = edgeEndpoints(i);
        const sa = worldToScreen(a), sb = worldToScreen(b);
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Élhossz-címkék (kattintással szerkeszthetők) + padló-élnév
    const showNames = state.mode === "floor" && state.closed;
    for (let i = 0; i < edgeCount(); i++) {
      const [a, b] = edgeEndpoints(i);
      const mid = worldToScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const r = drawLabel(fmtLen(edgeLengthMm(i)), mid.x, mid.y);
      labelRects.push({ i, ...r });
      if (showNames) {
        const name = (state.edgeNames || [])[i];
        if (name) drawCutLabel(name, mid.x, mid.y + 15);
      }
    }

    // Csúcsok (exportnál elrejtve a tisztább képért)
    if (!hideVertices) {
      p.forEach((pt, i) => {
        const s = worldToScreen(pt);
        const isSel = i === state.selected;
        const isFirst = i === 0 && !state.closed;
        ctx.beginPath();
        ctx.arc(s.x, s.y, isFirst ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = isSel ? "#ffcc4c" : isFirst ? "#fff" : "#cfe2ff";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#0f1419";
        ctx.stroke();
      });
    }
  }

  function drawLabel(text, x, y) {
    ctx.font = "12px system-ui, sans-serif";
    const padX = 5;
    const tw = ctx.measureText(text).width;
    const bw = tw + padX * 2, bh = 18;
    const rx = x - bw / 2, ry = y - bh / 2;
    ctx.fillStyle = "rgba(15,20,25,0.85)";
    roundRect(rx, ry, bw, bh, 4);
    ctx.fill();
    ctx.fillStyle = "#e6edf3";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    return { x: rx, y: ry, w: bw, h: bh };
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function render() {
    const { w, h } = cssSize();
    ctx.clearRect(0, 0, w, h);
    labelRects = [];
    cutoutLabelRects = [];
    drawGrid();
    if (shouldDrawLayout()) {
      drawLayout();
    } else {
      setLayoutCounts(null);
      updateMaterialReport(null);
      lastStats = null;
      lastCutPieces = [];
    }
    drawCutouts();
    drawSnapGuides();
    drawPolygon();
  }

  // Snap-segédvonalak (húzás közben): sárga szaggatott vonal a snap-él mentén.
  function drawSnapGuides() {
    if (!snapGuides.length) return;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#ffcc4c";
    snapGuides.forEach((g) => {
      ctx.beginPath();
      if (g.axis === "x") {
        const p1 = worldToScreen({ x: g.v, y: g.a });
        const p2 = worldToScreen({ x: g.v, y: g.b });
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      } else {
        const p1 = worldToScreen({ x: g.a, y: g.v });
        const p2 = worldToScreen({ x: g.b, y: g.v });
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
    });
    ctx.restore();
  }

