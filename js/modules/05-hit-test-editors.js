"use strict";
  // ---- Hit-test ----------------------------------------------------------
  const VERTEX_HIT_PX = 11;
  const EDGE_HIT_PX = 7;

  function vertexAt(sx, sy) {
    for (let i = 0; i < state.points.length; i++) {
      const s = worldToScreen(state.points[i]);
      if (Math.hypot(s.x - sx, s.y - sy) <= VERTEX_HIT_PX) return i;
    }
    return -1;
  }

  // Pont -> szakasz távolság képernyő-pixelben
  function segDistPx(px, py, A, B) {
    const vx = B.x - A.x, vy = B.y - A.y;
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? ((px - A.x) * vx + (py - A.y) * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = A.x + t * vx, cy = A.y + t * vy;
    return Math.hypot(px - cx, py - cy);
  }

  function edgeAt(sx, sy) {
    for (let i = 0; i < edgeCount(); i++) {
      const [a, b] = edgeEndpoints(i);
      const A = worldToScreen(a), B = worldToScreen(b);
      if (segDistPx(sx, sy, A, B) <= EDGE_HIT_PX) return i;
    }
    return -1;
  }

  function deleteVertex(i) {
    if (i == null || i < 0 || i >= state.points.length) return;
    state.points.splice(i, 1);
    if (state.points.length < 3) state.closed = false;
    state.selected = null;
    afterGeometryChange();
  }

  function labelAt(sx, sy) {
    for (const r of labelRects) {
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return r.i;
    }
    return -1;
  }

  // ---- Felirat-szerkesztő (a rajzon, az élhossz átírásához) --------------
  function closeLabelEditor() {
    if (!labelEditor) return;
    const ed = labelEditor;
    labelEditor = null;
    if (ed.input.parentNode) ed.input.parentNode.removeChild(ed.input);
  }

  // Általános, a rajzon megjelenő érték-szerkesztő (élhez és kivágáshoz is)
  function openValueEditor(midScreen, curMm, onCommitMm) {
    closeLabelEditor();
    const input = document.createElement("input");
    input.type = "number";
    input.step = state.unit === "cm" ? "0.1" : "1";
    input.min = "0";
    input.className = "label-editor";
    input.value = fromMm(curMm).toFixed(state.unit === "cm" ? 1 : 0);
    input.style.left = midScreen.x + "px";
    input.style.top = midScreen.y + "px";
    wrap.appendChild(input);
    input.focus();
    input.select();
    labelEditor = { input };

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const v = parseFloat(input.value);
      closeLabelEditor();
      if (v > 0) onCommitMm(toMm(v));
    };
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); commit(); }
      else if (ev.key === "Escape") { ev.preventDefault(); committed = true; closeLabelEditor(); }
    });
    input.addEventListener("blur", commit);
  }

  function openLabelEditor(i) {
    const [a, b] = edgeEndpoints(i);
    const mid = worldToScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    openValueEditor(mid, edgeLengthMm(i), (mm) => setEdgeLength(i, mm));
  }

  function openCutoutEditor(ci, dim) {
    const c = state.cutouts[ci];
    if (!c) return;
    const wpt = dim === "w" ? { x: c.x + c.w / 2, y: c.y } : { x: c.x, y: c.y + c.h / 2 };
    openValueEditor(worldToScreen(wpt), dim === "w" ? c.w : c.h, (mm) => {
      if (dim === "w") c.w = mm; else c.h = mm;
      afterGeometryChange();
    });
  }

