"use strict";
  // ---- Geometria ---------------------------------------------------------
  function edgeCount() {
    const n = state.points.length;
    if (n < 2) return 0;
    return state.closed ? n : n - 1;
  }

  function edgeEndpoints(i) {
    const n = state.points.length;
    return [state.points[i], state.points[(i + 1) % n]];
  }

  function edgeLengthMm(i) {
    const [a, b] = edgeEndpoints(i);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  // Abszolút él-szög fokban, Y-fel konvencióval (0 = kelet, CCW pozitív)
  function edgeAngleDeg(i) {
    const [a, b] = edgeEndpoints(i);
    let deg = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
  }

  // A záró él indexe (csak zárt sokszögnél), egyébként -1
  function closingEdgeIndex() {
    return state.closed ? state.points.length - 1 : -1;
  }

  function shoelaceAreaMm2() {
    const p = state.points;
    if (p.length < 3 || !state.closed) return 0;
    let s = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s) / 2;
  }

  function perimeterMm() {
    let s = 0;
    for (let i = 0; i < edgeCount(); i++) s += edgeLengthMm(i);
    return s;
  }

  // Él hosszának módosítása: p0 rögzített, a downstream csúcsok eltolódnak.
  function setEdgeLength(i, newLenMm) {
    if (newLenMm <= 0) return;
    const [a, b] = edgeEndpoints(i);
    const cur = Math.hypot(b.x - a.x, b.y - a.y);
    if (cur < 1e-6) return;
    const ux = (b.x - a.x) / cur;
    const uy = (b.y - a.y) / cur;
    const delta = newLenMm - cur;
    const dx = ux * delta, dy = uy * delta;
    // Eltoljuk a csúcsokat i+1 .. utolsó (a 0. anchor marad)
    for (let k = i + 1; k < state.points.length; k++) {
      state.points[k].x += dx;
      state.points[k].y += dy;
    }
    afterGeometryChange();
  }

  // Él szögének módosítása: p_i körül forgatjuk a downstream csúcsokat.
  function setEdgeAngle(i, newDeg) {
    const a = state.points[i];
    const curDeg = edgeAngleDeg(i);
    const deltaDeg = newDeg - curDeg;
    // Y-fel konvenció miatt a képernyő-forgás iránya fordított
    const rad = (-deltaDeg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    for (let k = i + 1; k < state.points.length; k++) {
      const px = state.points[k].x - a.x;
      const py = state.points[k].y - a.y;
      state.points[k].x = a.x + px * cos - py * sin;
      state.points[k].y = a.y + px * sin + py * cos;
    }
    afterGeometryChange();
  }

  // A rajzon megjelenő élhossz-feliratok képernyő-téglalapjai (render tölti)
  let labelRects = [];
  let labelEditor = null; // { input, i } amikor épp szerkesztünk egy feliratot

  // A legutóbbi kiosztás statisztikái (export/nyomtatás használja)
  let lastStats = null;        // { whole, cut, tilesNeeded, areaMm2, tileAreaMm2 }
  let lastCutPieces = [];      // [{ w, h }] a vágott darabok mm-ben

