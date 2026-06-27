"use strict";
  // ---- Mértékegység segédfüggvények -------------------------------------
  const toMm = (val) => (state.unit === "cm" ? val * 10 : val);
  const fromMm = (mm) => (state.unit === "cm" ? mm / 10 : mm);
  function fmtLen(mm) {
    const v = fromMm(mm);
    const s = state.unit === "cm" ? v.toFixed(1) : Math.round(v).toString();
    return `${s} ${state.unit}`;
  }

  // ---- Koordináta-transzformációk ---------------------------------------
  // világ (mm) -> képernyő (px). Y lefelé nő mindkét rendszerben.
  const worldToScreen = (p) => ({
    x: p.x * state.view.scale + state.view.ox,
    y: p.y * state.view.scale + state.view.oy,
  });
  const screenToWorld = (sx, sy) => ({
    x: (sx - state.view.ox) / state.view.scale,
    y: (sy - state.view.oy) / state.view.scale,
  });

  function snapWorld(p) {
    if (!state.snap) return p;
    const g = state.gridMm;
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  }

  // Egy pont koordinátáinak rátapasztása a felület határaira (élekre), ha közel van
  function snapToBounds(p) {
    const b = planBounds();
    if (!b) return p;
    const thr = 14 / state.view.scale; // ~14 px-nyi vonzás
    let x = p.x, y = p.y;
    if (Math.abs(x - b.minX) < thr) x = b.minX;
    else if (Math.abs(x - b.maxX) < thr) x = b.maxX;
    if (Math.abs(y - b.minY) < thr) y = b.minY;
    else if (Math.abs(y - b.maxY) < thr) y = b.maxY;
    return { x, y };
  }

  // Ortho kényszer az előző ponthoz képest
  function applyOrtho(p, prev) {
    if (!state.ortho || !prev) return p;
    const dx = Math.abs(p.x - prev.x);
    const dy = Math.abs(p.y - prev.y);
    return dx >= dy ? { x: p.x, y: prev.y } : { x: prev.x, y: p.y };
  }

