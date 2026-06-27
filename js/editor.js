/* =========================================================================
   Lapkiosztás tervező – 1. fázis: Alaprajz szerkesztő
   Minden hossz BELSŐLEG milliméterben tárolódik. A megjelenítés cm/mm.
   ========================================================================= */

(() => {
  "use strict";

  // ---- Állapot -----------------------------------------------------------
  const state = {
    points: [],        // [{x, y}] mm-ben, világkoordináta
    closed: false,
    mode: "floor",     // "floor" | "wall"
    unit: "cm",        // "cm" | "mm"
    snap: true,
    gridMm: 100,       // rácsméret mm-ben (alap: 10 cm)
    ortho: false,
    selected: null,    // kijelölt csúcs indexe
    view: { scale: 0.15, ox: 0, oy: 0 }, // px/mm, és képernyő-origó offszet
    tiles: defaultTiles(),  // burkolat / laptípus könyvtár (2. fázis)
    layout: {
      show: true, offXmm: 0, offYmm: 0, rotated: false, // kiosztás (3. fázis)
      alignMode: "none", thresholdMm: 100, overagePct: 10, // optimalizálás (4. fázis)
      overrides: {}, paintTypeId: null, // egyedi lapok (5. fázis): "i_j" -> typeId
    },
  };

  function defaultTiles() {
    return {
      groutMm: 3,
      groutColor: "#cfcfcf",
      baseId: "t1",
      types: [{
        id: "t1", name: "Alap lap",
        wMm: 300, hMm: 600,
        thicknessMm: 8,               // lapvastagság mm-ben (fuga- és szilikon-térfogathoz)
        fillKind: "color",            // "color" | "image"
        color: "#b9c4cf",
        imageUrl: null,
        imageMode: "full",            // "full" | "repeat"
      }],
    };
  }

  const TILE_PALETTE = ["#b9c4cf", "#d9c2a6", "#a6c2b0", "#c9a6b8", "#9fb1cc", "#cbb89a", "#9ec9c4"];

  const STORAGE_KEY = "tile-planner-phase1";

  // ---- DOM ---------------------------------------------------------------
  const canvas = document.getElementById("board");
  let ctx = canvas.getContext("2d"); // export közben ideiglenesen offscreen ctx-re vált
  const wrap = document.getElementById("canvasWrap");

  const el = {
    modeSeg: document.getElementById("modeSegmented"),
    unitSeg: document.getElementById("unitSegmented"),
    snap: document.getElementById("snapToggle"),
    gridSize: document.getElementById("gridSize"),
    gridUnit: document.getElementById("gridUnit"),
    ortho: document.getElementById("orthoToggle"),
    rectW: document.getElementById("rectW"),
    rectH: document.getElementById("rectH"),
    makeRect: document.getElementById("makeRectBtn"),
    edgeList: document.getElementById("edgeList"),
    closedState: document.getElementById("closedState"),
    area: document.getElementById("areaOut"),
    perim: document.getElementById("perimOut"),
    fit: document.getElementById("fitBtn"),
    clear: document.getElementById("clearBtn"),
    drawHint: document.getElementById("drawHint"),
    // 2. fázis
    tabs: document.getElementById("tabs"),
    groutW: document.getElementById("groutW"),
    groutColor: document.getElementById("groutColor"),
    tileList: document.getElementById("tileList"),
    addTile: document.getElementById("addTileBtn"),
    // 3. fázis
    layoutShow: document.getElementById("layoutShow"),
    tileRotate: document.getElementById("tileRotate"),
    linkToFloor: document.getElementById("linkToFloor"),
    linkToFloorRow: document.getElementById("linkToFloorRow"),
    linkToFloorHint: document.getElementById("linkToFloorHint"),
    offX: document.getElementById("offX"),
    offY: document.getElementById("offY"),
    tileTotal: document.getElementById("tileTotal"),
    tileWhole: document.getElementById("tileWhole"),
    tileCut: document.getElementById("tileCut"),
    // minta (kötés)
    patternSel: document.getElementById("patternSel"),
    offsetRow: document.getElementById("offsetRow"),
    offsetPct: document.getElementById("offsetPct"),
    offsetQuick: document.getElementById("offsetQuick"),
    herringboneTiltRow: document.getElementById("herringboneTiltRow"),
    herringboneTilt: document.getElementById("herringboneTilt"),
    // 4. fázis
    alignSeg: document.getElementById("alignSeg"),
    thr: document.getElementById("thr"),
    thrRow: document.getElementById("thrRow"),
    offHint: document.getElementById("offHint"),
    overage: document.getElementById("overage"),
    matArea: document.getElementById("matArea"),
    matTiles: document.getElementById("matTiles"),
    matWaste: document.getElementById("matWaste"),
    matFinal: document.getElementById("matFinal"),
    // 5. fázis
    paintMode: document.getElementById("paintMode"),
    paintPalette: document.getElementById("paintPalette"),
    clearOverrides: document.getElementById("clearOverrides"),
    // Anyag fül (csak projekt-szintű)
    groutPreset: document.getElementById("groutPreset"),
    silWidth: document.getElementById("silWidth"),
    silDepth: document.getElementById("silDepth"),
    silTube: document.getElementById("silTube"),
    silWaste: document.getElementById("silWaste"),
    prArea: document.getElementById("prArea"),
    prTilesByType: document.getElementById("prTilesByType"),
    prGroutArea: document.getElementById("prGroutArea"),
    prMass: document.getElementById("prMass"),
    prGroutPacks: document.getElementById("prGroutPacks"),
    gluePreset: document.getElementById("gluePreset"),
    glueWaste: document.getElementById("glueWaste"),
    prGlueArea: document.getElementById("prGlueArea"),
    prGlueMass: document.getElementById("prGlueMass"),
    prGluePacks: document.getElementById("prGluePacks"),
    prSilH: document.getElementById("prSilH"),
    prSilV: document.getElementById("prSilV"),
    prSilTot: document.getElementById("prSilTot"),
    prTubes: document.getElementById("prTubes"),
    prEdging: document.getElementById("prEdging"),
    // 6. fázis
    saveLinkedBtn: document.getElementById("saveLinkedBtn"),
    linkJsonBtn: document.getElementById("linkJsonBtn"),
    unlinkJsonBtn: document.getElementById("unlinkJsonBtn"),
    linkedFileName: document.getElementById("linkedFileName"),
    fsaUnsupported: document.getElementById("fsaUnsupported"),
    exportPng: document.getElementById("exportPng"),
    exportPdf: document.getElementById("exportPdf"),
    saveProjJson: document.getElementById("saveProjJson"),
    saveStoreJson: document.getElementById("saveStoreJson"),
    loadJsonBtn: document.getElementById("loadJsonBtn"),
    loadJsonInput: document.getElementById("loadJsonInput"),
    printImg: document.getElementById("printImg"),
    printInfo: document.getElementById("printInfo"),
    // 7. fázis (projekt / több felület)
    projTree: document.getElementById("projTree"),
    addProject: document.getElementById("addProject"),
    wallHeight: document.getElementById("wallHeight"),
    genWalls: document.getElementById("genWalls"),
    cutoutDraw: document.getElementById("cutoutDraw"),
    cutoutList: document.getElementById("cutoutList"),
    cutoutKindSeg: document.getElementById("cutoutKindSeg"),
    untiledColor: document.getElementById("untiledColor"),
    histUndo: document.getElementById("histUndo"),
    histRedo: document.getElementById("histRedo"),
    wallWarn: document.getElementById("wallWarn"),
    wallWarnText: document.getElementById("wallWarnText"),
    wallWarnRegen: document.getElementById("wallWarnRegen"),
    wallWarnHide: document.getElementById("wallWarnHide"),
    projName: document.getElementById("projName"),
  };

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

  // ---- Nézet: fit & zoom -------------------------------------------------
  function fitView() {
    const { w, h } = cssSize();
    if (state.points.length < 2) {
      // Alaphelyzet: origó kicsit beljebb
      state.view.scale = 0.15;
      state.view.ox = 60;
      state.view.oy = 60;
      render();
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.points.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const bw = Math.max(maxX - minX, 1);
    const bh = Math.max(maxY - minY, 1);
    const pad = 80;
    const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
    state.view.scale = Math.max(0.01, Math.min(scale, 5));
    state.view.ox = (w - bw * state.view.scale) / 2 - minX * state.view.scale;
    state.view.oy = (h - bh * state.view.scale) / 2 - minY * state.view.scale;
    render();
  }

  function zoomAt(sx, sy, factor) {
    const before = screenToWorld(sx, sy);
    state.view.scale = Math.max(0.01, Math.min(state.view.scale * factor, 8));
    // Tartsuk az egér alatti pontot a helyén
    state.view.ox = sx - before.x * state.view.scale;
    state.view.oy = sy - before.y * state.view.scale;
    render();
  }

  // ---- Egér-interakció ---------------------------------------------------
  let drag = null;          // { type: "vertex"|"pan"|"edge"|"paint", ... , moved }
  let justDragged = false;  // jelzi, hogy a most lezárt művelet húzás volt
  let paintMode = false;    // egyedi lapok festése (5. fázis)
  let cutoutMode = false;   // kivágás rajzolása (9. fázis)
  let pendingCutout = null; // { x, y, w, h } – épp rajzolt kivágás (mm)
  let newCutoutKind = "opening"; // a következő rajzolt kivágás típusa
  const OPENING_COLOR = "#3f7fe0"; // nyílás (ajtó/ablak) fix színe
  let cutoutLabelRects = []; // a rajzon szerkeszthető kivágás-méretek
  let selectedCutout = -1;   // kijelölt kivágás indexe (méretek + Delete + mozgatás)
  let snapGuides = [];       // húzás közben látható snap-segédvonalak (world-koord.)

  function getMouse(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("mousedown", (e) => {
    justDragged = false;
    const m = getMouse(e);
    if (e.button === 2) {
      drag = { type: "pan", startX: m.x, startY: m.y, ox: state.view.ox, oy: state.view.oy, moved: false };
      return;
    }
    if (e.button === 0) {
      // Kivágás méret-feliratra kattintás: a click megnyitja a szerkesztőt
      if (cutoutLabelAt(m.x, m.y)) return;
      // Festés mód: a kattintás/húzás lapokat fest, nem szerkeszt
      if (paintMode) {
        drag = { type: "paint", moved: false };
        const w = screenToWorld(m.x, m.y);
        if (applyPaintAt(w.x, w.y)) render();
        return;
      }
      // Kivágás rajzolása: téglalap húzása
      if (cutoutMode) {
        const w = snapToBounds(snapWorld(screenToWorld(m.x, m.y)));
        drag = { type: "cutout", x0: w.x, y0: w.y, moved: false };
        pendingCutout = { x: w.x, y: w.y, w: 0, h: 0 };
        return;
      }
      const vi = vertexAt(m.x, m.y);
      if (vi >= 0) {
        state.selected = vi;
        selectedCutout = -1;
        drag = { type: "vertex", index: vi, moved: false };
        inDrag = true;
        afterSelectionChange();
        render();
        return;
      }
      // Kivágás kijelölése + áthelyezés (drag and drop)
      const ci = cutoutAt(m.x, m.y);
      if (ci >= 0) {
        selectedCutout = ci;
        state.selected = null;
        const c = state.cutouts[ci];
        const grab = screenToWorld(m.x, m.y);
        drag = { type: "cutoutMove", ci, ox: c.x, oy: c.y, gx: grab.x, gy: grab.y, moved: false };
        inDrag = true;
        render();
        return;
      }
      // Élhossz-feliratra kattintás: a click majd megnyitja a szerkesztőt,
      // ne induljon helyette él-húzás. (A záró él felirata nem szerkeszthető.)
      const li = labelAt(m.x, m.y);
      if (li >= 0 && li !== closingEdgeIndex()) return;

      const ei = edgeAt(m.x, m.y);
      if (ei >= 0) {
        const j = (ei + 1) % state.points.length;
        const grab = screenToWorld(m.x, m.y);
        drag = {
          type: "edge", i: ei, j,
          origA: { ...state.points[ei] },
          origB: { ...state.points[j] },
          gx: grab.x, gy: grab.y, moved: false,
        };
        inDrag = true;
        state.selected = null;
        afterSelectionChange();
        render();
      }
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const m = getMouse(e);
    drag.moved = true;
    justDragged = true;
    if (drag.type === "pan") {
      state.view.ox = drag.ox + (m.x - drag.startX);
      state.view.oy = drag.oy + (m.y - drag.startY);
      render();
    } else if (drag.type === "vertex") {
      let wp = snapWorld(screenToWorld(m.x, m.y));
      const prev = state.points[(drag.index - 1 + state.points.length) % state.points.length];
      if (state.ortho && (state.closed || drag.index > 0)) wp = applyOrtho(wp, prev);
      state.points[drag.index] = wp;
      afterGeometryChange();
    } else if (drag.type === "edge") {
      const cur = screenToWorld(m.x, m.y);
      let dx = cur.x - drag.gx, dy = cur.y - drag.gy;
      if (state.ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
      if (state.snap) {
        const g = state.gridMm;
        dx = Math.round(dx / g) * g;
        dy = Math.round(dy / g) * g;
      }
      state.points[drag.i] = { x: drag.origA.x + dx, y: drag.origA.y + dy };
      state.points[drag.j] = { x: drag.origB.x + dx, y: drag.origB.y + dy };
      afterGeometryChange();
    } else if (drag.type === "paint") {
      const w = screenToWorld(m.x, m.y);
      if (applyPaintAt(w.x, w.y)) render();
    } else if (drag.type === "cutout") {
      const w = snapToBounds(snapWorld(screenToWorld(m.x, m.y)));
      pendingCutout = {
        x: Math.min(drag.x0, w.x), y: Math.min(drag.y0, w.y),
        w: Math.abs(w.x - drag.x0), h: Math.abs(w.y - drag.y0),
      };
      render();
    } else if (drag.type === "cutoutMove") {
      const c = state.cutouts[drag.ci];
      if (c) {
        const cur = screenToWorld(m.x, m.y);
        let dx = cur.x - drag.gx, dy = cur.y - drag.gy;
        if (state.snap) { const gr = state.gridMm; dx = Math.round(dx / gr) * gr; dy = Math.round(dy / gr) * gr; }
        let nx = drag.ox + dx, ny = drag.oy + dy;
        const snapped = snapCutoutDuringDrag(c, nx, ny);
        c.x = snapped.x; c.y = snapped.y;
        snapGuides = snapped.guides;
        render();
      }
    }
  });

  window.addEventListener("mouseup", () => {
    const wasDrag = drag;
    drag = null;
    if (!wasDrag) return;
    if (wasDrag.type === "cutout") {
      if (pendingCutout && pendingCutout.w > 5 && pendingCutout.h > 5) {
        state.cutouts.push({ ...pendingCutout, kind: newCutoutKind });
        selectedCutout = state.cutouts.length - 1; // az új kivágás kijelölve (méretek látszanak)
        pendingCutout = null;
        afterGeometryChange(); // save → előzmény
      } else {
        pendingCutout = null;
        render();
      }
    } else if (wasDrag.type === "cutoutMove") {
      inDrag = false;
      snapGuides = [];
      if (wasDrag.moved) afterGeometryChange(); // áthelyezés után újragenerálás + előzmény
      else render();
    } else if (wasDrag.type === "paint") {
      save();
    } else if (wasDrag.type === "vertex" || wasDrag.type === "edge") {
      inDrag = false;
      if (wasDrag.moved) pushHistory(); // a húzás végén egyetlen előzmény-bejegyzés
    }
  });

  // Kattintás a vásznon: pont hozzáadása / sokszög zárása
  canvas.addEventListener("click", (e) => {
    if (e.button !== 0) return;
    const m = getMouse(e);
    // Ha épp húztunk csúcsot/panoltunk/kivágást, ne adjunk hozzá pontot
    if (justDragged) { justDragged = false; return; }

    // Kivágás méret-felirat: kattintásra szerkeszthető
    const cl = cutoutLabelAt(m.x, m.y);
    if (cl) { openCutoutEditor(cl.ci, cl.dim); return; }

    if (paintMode) return;   // festést a mousedown kezeli
    if (cutoutMode) return;  // kivágás rajzolását a mousedown/move kezeli

    // Kivágásra kattintás: a kijelölést a mousedown már elvégezte
    if (cutoutAt(m.x, m.y) >= 0) return;

    // Élhossz-felirat: kattintásra megnyílik a szerkesztő mező
    const li = labelAt(m.x, m.y);
    if (li >= 0 && li !== closingEdgeIndex()) { openLabelEditor(li); return; }

    const vi = vertexAt(m.x, m.y);
    if (vi >= 0) {
      // Kezdőpontra kattintás nyitott állapotban => zárás
      if (!state.closed && vi === 0 && state.points.length >= 3) {
        state.closed = true;
        state.selected = null;
        afterGeometryChange();
        return;
      }
      state.selected = vi;
      selectedCutout = -1;
      afterSelectionChange();
      return;
    }

    if (state.closed) {
      // zárt sokszögnél üres kattintás: kijelölések törlése
      if (state.selected !== null || selectedCutout >= 0) {
        state.selected = null;
        selectedCutout = -1;
        afterSelectionChange();
      }
      return;
    }

    // Új pont hozzáadása
    let wp = snapWorld(screenToWorld(m.x, m.y));
    const prev = state.points[state.points.length - 1];
    if (state.ortho) wp = applyOrtho(wp, prev);
    state.points.push(wp);
    state.selected = state.points.length - 1;
    afterGeometryChange();
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    closeLabelEditor();
    const m = getMouse(e);
    zoomAt(m.x, m.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  // Hover-kurzor: jelezze, mi van az egér alatt
  canvas.addEventListener("mousemove", (e) => {
    if (drag) return;
    const m = getMouse(e);
    if (cutoutLabelAt(m.x, m.y)) { canvas.style.cursor = "text"; return; }
    if (cutoutMode) { canvas.style.cursor = "crosshair"; return; }
    if (paintMode) { canvas.style.cursor = "cell"; return; }
    const li = labelAt(m.x, m.y);
    if (li >= 0 && li !== closingEdgeIndex()) canvas.style.cursor = "text";
    else if (vertexAt(m.x, m.y) >= 0) canvas.style.cursor = "pointer";
    else if (cutoutAt(m.x, m.y) >= 0) canvas.style.cursor = "move";
    else if (edgeAt(m.x, m.y) >= 0) canvas.style.cursor = "move";
    else canvas.style.cursor = "crosshair";
  });

  // Dupla kattintás egy pontra: törlés
  canvas.addEventListener("dblclick", (e) => {
    const m = getMouse(e);
    const vi = vertexAt(m.x, m.y);
    if (vi >= 0) deleteVertex(vi);
  });

  // Delete: kijelölt kivágás vagy csúcs törlése; Ctrl+Z/Y: undo/redo
  window.addEventListener("keydown", (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    const inField = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
    if ((e.ctrlKey || e.metaKey) && !inField) {
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); return; }
      if (k === "s") { e.preventDefault(); saveToLinkedFile(); return; }
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return; // mezőben gépelünk
      if (selectedCutout >= 0 && state.cutouts[selectedCutout]) {
        e.preventDefault();
        state.cutouts.splice(selectedCutout, 1);
        selectedCutout = -1;
        afterGeometryChange();
      } else if (state.selected !== null) {
        e.preventDefault();
        deleteVertex(state.selected);
      }
    }
    if (e.key === "Escape") {
      state.selected = null;
      selectedCutout = -1;
      afterSelectionChange();
    }
  });

  // ---- Él-lista UI -------------------------------------------------------
  function renderEdgeList() {
    const list = el.edgeList;
    list.innerHTML = "";
    const n = edgeCount();
    if (n === 0) {
      list.innerHTML = '<p class="empty-note">Még nincs él. Kezdj el rajzolni a vásznon.</p>';
      return;
    }
    const closeIdx = closingEdgeIndex();
    for (let i = 0; i < n; i++) {
      const isClosing = i === closeIdx;
      const item = document.createElement("div");
      item.className = "edge-item" + (isClosing ? " closing" : "");

      // Padló-él neve (zárt padlónál) – ez lesz a generált fal alapneve
      if (state.mode === "floor" && state.closed) {
        const nameField = document.createElement("label");
        nameField.className = "edge-field edge-name-field";
        nameField.innerHTML = `<span>${i + 1}. él neve (pl. háló felőli fal)</span>`;
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.placeholder = "kötelező a falgeneráláshoz";
        nameInput.value = state.edgeNames[i] || "";
        nameInput.addEventListener("change", () => {
          state.edgeNames[i] = nameInput.value.trim();
          save();
        });
        nameField.appendChild(nameInput);
        item.appendChild(nameField);
      }

      // Élvédő jelölőnégyzet — minden ZÁRT felület élein elérhető
      // (fal-felületeken az alsó él = padló-fal találkozás, az oldal-élek =
      // fal-fal sarkok, a felső él = a burkolat befejező-profilja). A szilikon-
      // számítás kihagyja az élvédős éleket, ehelyett az élvédő-aggregátorba
      // gyűjti a hosszt.
      if (state.closed) {
        const edgField = document.createElement("label");
        edgField.className = "edge-field edge-edging-field";
        const edgCheck = document.createElement("input");
        edgCheck.type = "checkbox";
        edgCheck.checked = !!state.edgeEdgings[i];
        edgCheck.addEventListener("change", () => {
          state.edgeEdgings[i] = edgCheck.checked;
          afterGeometryChange();
        });
        const edgLabel = document.createElement("span");
        edgLabel.textContent = "Élvédő profil ezen az élen";
        edgField.append(edgCheck, edgLabel);
        item.appendChild(edgField);
      }

      const idx = document.createElement("div");
      idx.className = "edge-idx";
      idx.textContent = i + 1;
      item.appendChild(idx);

      // Hossz mező
      const lenField = document.createElement("label");
      lenField.className = "edge-field";
      lenField.innerHTML = `<span>hossz (${state.unit})${isClosing ? " – záró" : ""}</span>`;
      const lenInput = document.createElement("input");
      lenInput.type = "number";
      lenInput.step = state.unit === "cm" ? "0.1" : "1";
      lenInput.value = fromMm(edgeLengthMm(i)).toFixed(state.unit === "cm" ? 1 : 0);
      lenInput.disabled = isClosing;
      lenInput.addEventListener("change", () => {
        const mm = toMm(parseFloat(lenInput.value));
        if (mm > 0) setEdgeLength(i, mm);
      });
      lenField.appendChild(lenInput);
      item.appendChild(lenField);

      // Szög mező
      const angField = document.createElement("label");
      angField.className = "edge-field";
      angField.innerHTML = `<span>szög (°)</span>`;
      const angInput = document.createElement("input");
      angInput.type = "number";
      angInput.step = "0.5";
      angInput.value = edgeAngleDeg(i).toFixed(1);
      angInput.disabled = isClosing;
      angInput.addEventListener("change", () => {
        const d = parseFloat(angInput.value);
        if (!Number.isNaN(d)) setEdgeAngle(i, d);
      });
      angField.appendChild(angInput);
      item.appendChild(angField);

      list.appendChild(item);
    }
  }

  // ---- Összegzés / állapot frissítés -------------------------------------
  function updateSummary() {
    const a = shoelaceAreaMm2();
    el.area.textContent = a > 0 ? `${(a / 1e6).toFixed(2)} m²` : "– m²";
    const per = perimeterMm();
    el.perim.textContent = per > 0 ? fmtLen(per) : "–";
    el.closedState.textContent = state.closed ? "zárt" : "nyitott";
  }

  // Csak a kijelölés változott (geometria nem): elég a vászon frissítése
  function afterSelectionChange() {
    render();
  }

  function afterGeometryChange() {
    render();
    renderEdgeList();
    renderCutoutList();
    updateSummary();
    updateDeleteBtn();
    if (project) checkWallSync(); // padló-változás esetén figyelmeztetés a generált falakra
    save();
  }

  // ---- Vezérlők ----------------------------------------------------------
  el.modeSeg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.mode = b.dataset.mode;
    [...el.modeSeg.children].forEach((c) => c.classList.toggle("active", c === b));
    afterGeometryChange();
  });

  el.unitSeg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.unit = b.dataset.unit;
    if (project) project.unit = state.unit; // mértékegység projektszintű
    [...el.unitSeg.children].forEach((c) => c.classList.toggle("active", c === b));
    el.gridUnit.textContent = state.unit;
    document.querySelectorAll(".rect-unit").forEach((s) => (s.textContent = state.unit));
    el.gridSize.value = fromMm(state.gridMm).toFixed(state.unit === "cm" ? 1 : 0);
    document.querySelectorAll(".off-unit").forEach((s) => (s.textContent = state.unit));
    el.offX.value = fromMm(state.layout.offXmm).toFixed(state.unit === "cm" ? 1 : 0);
    el.offY.value = fromMm(state.layout.offYmm).toFixed(state.unit === "cm" ? 1 : 0);
    el.thr.value = fromMm(state.layout.thresholdMm).toFixed(state.unit === "cm" ? 1 : 0);
    afterGeometryChange();
    renderTileLibrary(); // a laptípus-méretek is a kijelzett egységet kövessék
  });

  el.snap.addEventListener("change", () => {
    state.snap = el.snap.checked;
    el.gridSize.disabled = !state.snap;
    save();
  });

  el.gridSize.addEventListener("change", () => {
    const mm = toMm(parseFloat(el.gridSize.value));
    if (mm > 0) { state.gridMm = mm; afterGeometryChange(); }
  });

  el.ortho.addEventListener("change", () => { state.ortho = el.ortho.checked; save(); });

  el.makeRect.addEventListener("click", () => {
    const w = toMm(parseFloat(el.rectW.value));
    const h = toMm(parseFloat(el.rectH.value));
    if (!(w > 0 && h > 0)) return;
    state.points = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
    state.closed = true;
    state.selected = null;
    afterGeometryChange();
    fitView();
  });

  el.fit.addEventListener("click", fitView);

  el.clear.addEventListener("click", () => {
    if (state.points.length && !confirm("Biztosan törlöd az alaprajzot?")) return;
    state.points = [];
    state.closed = false;
    state.selected = null;
    afterGeometryChange();
  });

  // =======================================================================
  //  2. FÁZIS – Laptípus-könyvtár (burkolat)
  // =======================================================================
  function tilesSave() { save(); }

  function randomTileColor() {
    return TILE_PALETTE[Math.floor(Math.random() * TILE_PALETTE.length)];
  }

  function sizeSwatch(sw, type) {
    const maxDim = 84;
    const m = Math.max(type.wMm, type.hMm) || 1;
    const s = maxDim / m;
    sw.style.width = Math.max(12, type.wMm * s) + "px";
    sw.style.height = Math.max(12, type.hMm * s) + "px";
    sw.style.borderColor = state.tiles.groutColor;
  }

  function applyFill(sw, type) {
    if (type.fillKind === "image" && type.imageUrl) {
      sw.style.backgroundImage = `url("${type.imageUrl}")`;
      sw.style.backgroundColor = "";
      if (type.imageMode === "repeat") {
        sw.style.backgroundRepeat = "repeat";
        sw.style.backgroundSize = "22px auto";
      } else {
        sw.style.backgroundRepeat = "no-repeat";
        sw.style.backgroundSize = "100% 100%";
      }
    } else {
      sw.style.backgroundImage = "none";
      sw.style.backgroundColor = type.color;
    }
  }

  function addTileType() {
    const t = state.tiles;
    const base = t.types.find((x) => x.id === t.baseId) || t.types[0];
    const id = "t" + Date.now().toString(36) + Math.floor(Math.random() * 1000);
    t.types.push({
      id,
      name: "Lap " + (t.types.length + 1),
      wMm: base ? base.wMm : 300,
      hMm: base ? base.hMm : 300,
      thicknessMm: base ? (base.thicknessMm || 8) : 8,
      fillKind: "color",
      color: randomTileColor(),
      imageUrl: null,
      imageMode: "full",
    });
    renderTileLibrary();
    tilesSave();
  }

  function deleteTileType(id) {
    if (project.tileTypes.length <= 1) return;
    project.tileTypes = project.tileTypes.filter((x) => x.id !== id);
    state.tiles.types = project.tileTypes; // megosztott referencia frissítése
    const fallback = project.tileTypes[0].id;
    // a törölt típust minden felületen takarítsuk (alap, festések, festő-kijelölés)
    project.surfaces.forEach((s) => {
      if (s.baseId === id) s.baseId = fallback;
      if (s.layout) {
        if (s.layout.paintTypeId === id) s.layout.paintTypeId = fallback;
        if (s.layout.overrides) Object.keys(s.layout.overrides).forEach((k) => { if (s.layout.overrides[k] === id) delete s.layout.overrides[k]; });
      }
    });
    if (state.tiles.baseId === id) state.tiles.baseId = fallback;
    if (state.layout.paintTypeId === id) state.layout.paintTypeId = fallback;
    Object.keys(state.layout.overrides).forEach((k) => { if (state.layout.overrides[k] === id) delete state.layout.overrides[k]; });
    renderTileLibrary();
    render();
    tilesSave();
  }

  function makeTileCard(type) {
    const t = state.tiles;
    const card = document.createElement("div");
    card.className = "tile-card" + (type.id === t.baseId ? " is-base" : "");

    // --- fejléc: név, alap-jelölő, törlés ---
    const head = document.createElement("div");
    head.className = "tile-card-head";

    const name = document.createElement("input");
    name.className = "tile-name";
    name.value = type.name;
    name.addEventListener("change", () => { type.name = name.value.trim() || "Lap"; tilesSave(); });

    const baseLbl = document.createElement("label");
    baseLbl.className = "base-radio";
    const baseRadio = document.createElement("input");
    baseRadio.type = "radio";
    baseRadio.name = "baseTile";
    baseRadio.checked = type.id === t.baseId;
    baseRadio.addEventListener("change", () => {
      if (baseRadio.checked) { t.baseId = type.id; renderTileLibrary(); tilesSave(); }
    });
    baseLbl.appendChild(baseRadio);
    baseLbl.appendChild(document.createTextNode("alap"));

    const del = document.createElement("button");
    del.className = "tile-del";
    del.textContent = "✕";
    del.title = "Típus törlése";
    del.disabled = t.types.length <= 1;
    del.addEventListener("click", () => deleteTileType(type.id));

    head.append(name, baseLbl, del);
    card.appendChild(head);

    // --- törzs: minta + mezők ---
    const body = document.createElement("div");
    body.className = "tile-card-body";

    const sw = document.createElement("div");
    sw.className = "tile-swatch";
    sizeSwatch(sw, type);
    applyFill(sw, type);

    const fields = document.createElement("div");
    fields.className = "tile-fields";

    // méret
    const dim = document.createElement("div");
    dim.className = "dim-row";
    const dec = state.unit === "cm" ? 1 : 0;
    const step = state.unit === "cm" ? "0.1" : "1";
    const wIn = document.createElement("input");
    wIn.type = "number"; wIn.min = "1"; wIn.step = step;
    wIn.value = fromMm(type.wMm).toFixed(dec);
    const x = document.createElement("span"); x.className = "x"; x.textContent = "×";
    const hIn = document.createElement("input");
    hIn.type = "number"; hIn.min = "1"; hIn.step = step;
    hIn.value = fromMm(type.hMm).toFixed(dec);
    const u = document.createElement("span"); u.className = "u"; u.textContent = state.unit;
    wIn.addEventListener("change", () => {
      const mm = toMm(parseFloat(wIn.value));
      if (mm > 0) { type.wMm = mm; sizeSwatch(sw, type); applyFill(sw, type); tilesSave(); }
    });
    hIn.addEventListener("change", () => {
      const mm = toMm(parseFloat(hIn.value));
      if (mm > 0) { type.hMm = mm; sizeSwatch(sw, type); applyFill(sw, type); tilesSave(); }
    });
    dim.append(wIn, x, hIn, u);

    // vastagság (mm, mindig mm-ben — szabványos lap-adatlapokon így van)
    const thickRow = document.createElement("div");
    thickRow.className = "thick-row";
    const thLbl = document.createElement("span");
    thLbl.className = "u"; thLbl.textContent = "Vastagság:";
    const thIn = document.createElement("input");
    thIn.type = "number"; thIn.min = "1"; thIn.step = "0.5";
    thIn.value = (type.thicknessMm != null ? type.thicknessMm : 8);
    const thU = document.createElement("span");
    thU.className = "u"; thU.textContent = "mm";
    thIn.addEventListener("change", () => {
      const v = parseFloat(thIn.value);
      if (v > 0) { type.thicknessMm = v; tilesSave(); }
    });
    thickRow.append(thLbl, thIn, thU);

    // kitöltés típusa + szín
    const fill = document.createElement("div");
    fill.className = "fill-row";
    const kind = document.createElement("select");
    [["color", "Szín"], ["image", "Kép"]].forEach(([v, l]) => {
      const o = document.createElement("option"); o.value = v; o.textContent = l; kind.appendChild(o);
    });
    kind.value = type.fillKind;
    const colorWrap = document.createElement("span");
    colorWrap.className = "fill-color-wrap";
    const color = document.createElement("input");
    color.type = "color"; color.value = type.color;
    color.addEventListener("input", () => { type.color = color.value; applyFill(sw, type); });
    color.addEventListener("change", tilesSave);
    colorWrap.appendChild(color);
    const kindLbl = document.createElement("span");
    kindLbl.className = "u";
    kindLbl.textContent = "Kitöltés:";
    fill.append(kindLbl, kind, colorWrap);

    // kép sor
    const imgRow = document.createElement("div");
    imgRow.className = "image-row";
    const file = document.createElement("input");
    file.type = "file"; file.accept = "image/*";
    const mode = document.createElement("select");
    [["full", "Teljes lap"], ["repeat", "Ismétlődő"]].forEach(([v, l]) => {
      const o = document.createElement("option"); o.value = v; o.textContent = l; mode.appendChild(o);
    });
    mode.value = type.imageMode;
    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        // a textúrát lekicsinyítjük, hogy ne teljen meg a böngésző tárolója (localStorage)
        downscaleImage(r.result, 700, (small) => {
          type.imageUrl = small;
          type.fillKind = "image";
          kind.value = "image";
          updateFillVisibility();
          applyFill(sw, type);
          tilesSave();
        });
      };
      r.readAsDataURL(f);
    });
    mode.addEventListener("change", () => { type.imageMode = mode.value; applyFill(sw, type); tilesSave(); });
    imgRow.append(file, mode);

    function updateFillVisibility() {
      const isImg = kind.value === "image";
      colorWrap.hidden = isImg;
      imgRow.hidden = !isImg;
    }
    kind.addEventListener("change", () => {
      type.fillKind = kind.value;
      updateFillVisibility();
      applyFill(sw, type);
      tilesSave();
    });
    updateFillVisibility();

    fields.append(dim, thickRow, fill, imgRow);
    body.append(sw, fields);
    card.appendChild(body);
    return card;
  }

  function renderTileLibrary() {
    if (!el.tileList) return;
    el.tileList.innerHTML = "";
    state.tiles.types.forEach((type) => el.tileList.appendChild(makeTileCard(type)));
    renderPaintPalette(); // a festő-paletta is kövesse a könyvtárat
  }

  function initTilesUI() {
    // Fülek
    el.tabs.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const tab = b.dataset.tab;
      [...el.tabs.children].forEach((c) => c.classList.toggle("active", c === b));
      document.querySelectorAll("[data-tabpanel]").forEach((p) => {
        p.hidden = p.dataset.tabpanel !== tab;
      });
      // Anyag fülre váltáskor minden felület cache-ét frissítjük (offscreen),
      // hogy a projekt-összesítés ne csak az aktív felületet mutassa.
      if (tab === "material") recomputeAllSurfacesMaterial();
    });

    el.addTile.addEventListener("click", addTileType);

    el.groutW.addEventListener("change", () => {
      const v = parseFloat(el.groutW.value);
      if (v >= 0) { state.tiles.groutMm = v; tilesSave(); }
    });
    el.groutColor.addEventListener("input", () => {
      state.tiles.groutColor = el.groutColor.value;
      renderTileLibrary(); // a minták kerete a fuga színét tükrözi
    });
    el.groutColor.addEventListener("change", tilesSave);
  }

  // =======================================================================
  //  3. FÁZIS – Hálós lapkiosztás generálása + vizualizáció
  // =======================================================================
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

  // Reális lapszükséglet a vágott darabokhoz: egy lapból a kivágott darab
  // mellett a maradék egy másik darabhoz felhasználható, ha elég nagy.
  function tilesNeededForCuts(pieces, tileW, tileH) {
    const offcuts = []; // elérhető maradékok { w, h }
    let tilesUsed = 0;
    const sorted = pieces.slice().sort((a, b) => b.w * b.h - a.w * a.h);
    for (const pc of sorted) {
      let idx = -1;
      for (let k = 0; k < offcuts.length; k++) {
        const o = offcuts[k];
        if (pc.w <= o.w + 0.5 && pc.h <= o.h + 0.5) { idx = k; break; }
      }
      if (idx >= 0) {
        offcuts.splice(idx, 1); // a maradékot felhasználtuk
      } else {
        tilesUsed++;
        // a friss lapból a darab kivágása után megmaradó nagyobbik csík
        const a1 = Math.max(tileW - pc.w, 0) * tileH;
        const a2 = tileW * Math.max(tileH - pc.h, 0);
        if (a1 >= a2) offcuts.push({ w: Math.max(tileW - pc.w, 0), h: tileH });
        else offcuts.push({ w: tileW, h: Math.max(tileH - pc.h, 0) });
      }
    }
    return tilesUsed;
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
  function computeProjectTileNumbers(p) {
    let area = 0, total = 0, whole = 0, cut = 0, needed = 0, usedArea = 0;
    p.surfaces.forEach((s) => {
      const sNeeded = s.lastTilesNeeded || 0;
      if (sNeeded <= 0) return;
      area += s.lastAreaMm2 || 0;
      whole += s.lastWhole || 0;
      cut += s.lastCut || 0;
      total += (s.lastWhole || 0) + (s.lastCut || 0);
      needed += sNeeded;
      usedArea += sNeeded * (s.lastTileAreaMm2 || 0);
    });
    const wastePct = usedArea > 0 ? (1 - area / usedArea) * 100 : 0;
    return { area, total, whole, cut, needed, wastePct };
  }

  // Ugyanaz, csak laptípusonként csoportosítva. ELSŐDLEGESEN a felület
  // lastTilesByType cache-ét használja (ami a tényleges típust mutatja, beleértve
  // az egyedi-lap override-okat is). Fallback: ha az új cache nincs, baseId alapján.
  // Visszaad egy tömböt: [{ id, name, area, whole, cut, needed, usedArea, surfaceNames[] }, ...]
  function computeProjectTileNumbersByType(p) {
    const groups = {};
    const ensure = (id, name) => {
      if (!groups[id]) {
        const t = (p.tileTypes || []).find((x) => x.id === id);
        groups[id] = { id, name: name || (t ? t.name : "ismeretlen lap"), area: 0, whole: 0, cut: 0, needed: 0, usedArea: 0, surfaceNames: new Set() };
      }
      return groups[id];
    };
    p.surfaces.forEach((s) => {
      const bt = s.lastTilesByType;
      if (bt && typeof bt === "object" && Object.keys(bt).length) {
        Object.keys(bt).forEach((tid) => {
          const stats = bt[tid];
          if (!stats || (stats.needed || 0) <= 0 && (stats.whole || 0) <= 0 && (stats.cut || 0) <= 0) return;
          const g = ensure(tid, stats.name);
          g.area += stats.area || 0;
          g.whole += stats.whole || 0;
          g.cut += stats.cut || 0;
          g.needed += stats.needed || 0;
          g.usedArea += (stats.needed || 0) * (stats.tileAreaMm2 || 0);
          g.surfaceNames.add(s.name);
        });
      } else {
        const sNeeded = s.lastTilesNeeded || 0;
        if (sNeeded <= 0) return;
        const g = ensure(s.baseId);
        g.area += s.lastAreaMm2 || 0;
        g.whole += s.lastWhole || 0;
        g.cut += s.lastCut || 0;
        g.needed += sNeeded;
        g.usedArea += sNeeded * (s.lastTileAreaMm2 || 0);
        g.surfaceNames.add(s.name);
      }
    });
    return Object.values(groups).map((g) => ({ ...g, surfaceNames: [...g.surfaceNames] }));
  }

  // Projekt-szintű szilikon (mm-ben adott hosszak).
  function computeSiliconeForProject(p) {
    let horizMm = 0, vertMm = 0;
    let horizN = 0, vertN = 0;
    let edgingMm = 0, edgingN = 0; // élvédő-profil hossza
    // A fal-felületek edgeEdgings-ét nézzük:
    //   - él 2 (alja) = padló-fal találkozás → vízszintes szilikon helyett élvédő
    //   - él 1 (jobb) vagy 3 (bal) = függőleges sarok → vert. szilikon helyett élvédő
    //   - él 0 (tetje) = befejező profil (ha nem mennyezetig burkolunk)
    // Plus minden szabadon megjelölt él (pl. előtétfalon) → élvédő-aggregátor.
    p.surfaces.forEach((floor) => {
      if (floor.mode !== "floor" || !floor.closed || floor.points.length < 3) return;
      const walls = p.surfaces.filter((w) => w.fromFloorId === floor.id);
      if (!walls.length) return;
      const n = floor.points.length;
      // térkép: padló-él index → fal objektum
      const wallByEdge = new Map();
      walls.forEach((w) => {
        if (typeof w.fromEdgeIndex === "number" && w.fromEdgeIndex >= 0 && w.fromEdgeIndex < n) {
          wallByEdge.set(w.fromEdgeIndex, w);
        }
      });
      const wallEdgings = (w) => Array.isArray(w.edgeEdgings) ? w.edgeEdgings : [];

      // Vízszintes hossz (padló-fal találkozás) = a fal alsó éle (él 2)
      walls.forEach((w) => {
        if (typeof w.fromEdgeIndex !== "number") return;
        const i = w.fromEdgeIndex;
        const a = floor.points[i], b = floor.points[(i + 1) % n];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const e = wallEdgings(w);
        if (e[2]) {                 // fal alja élvédős
          edgingMm += len; edgingN++;
        } else {
          horizMm += len; horizN++;
        }
        // fal teteje (él 0) — befejező profil
        if (e[0]) { edgingMm += len; edgingN++; }
      });

      // Függőleges sarkok: a padló-csúcsok, ahol két szomszédos fal van.
      // A k. csúcsra a wallByEdge[k-1] fal JOBB OLDALA (él 1) ÉS a wallByEdge[k]
      // fal BAL OLDALA (él 3) találkozik. Ha bármelyik élvédős, élvédő-profil
      // takar; egyébként szilikon.
      const hMm = floor.wallHeightMm || 0;
      for (let k = 0; k < n; k++) {
        const prevEdge = (k + n - 1) % n;
        const wallPrev = wallByEdge.get(prevEdge);
        const wallCurr = wallByEdge.get(k);
        if (!wallPrev || !wallCurr) continue;
        const ep = wallEdgings(wallPrev);
        const ec = wallEdgings(wallCurr);
        const cornerEdging = !!ep[1] || !!ec[3];
        if (cornerEdging) {
          edgingMm += hMm; edgingN++;
        } else {
          vertMm += hMm; vertN++;
        }
      }
    });

    // Önálló (nem-padló-fal) felületek élvédői (pl. előtétfal kézi rajz): minden
    // zárt felületen az edgeEdgings éleinek hosszait összegezzük az élvédőbe.
    // A padlót és a fenti fal-feldolgozást már megtörténtnek tekintjük.
    p.surfaces.forEach((s) => {
      if (!s.closed || !Array.isArray(s.points) || s.points.length < 3) return;
      if (s.mode === "floor") return;                  // padló élei nem
      if (s.mode === "wall" && s.fromFloorId) return;  // generált fal: már fent feldolgozva
      const edgings = Array.isArray(s.edgeEdgings) ? s.edgeEdgings : [];
      const sn = s.points.length;
      for (let i = 0; i < sn; i++) {
        if (!edgings[i]) continue;
        const a = s.points[i], b = s.points[(i + 1) % sn];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        edgingMm += len; edgingN++;
      }
    });

    // Kivágás-élek (ajtó/ablak/nem-burkolt) — itt van a TÉNYLEGES burkolat-széle.
    // A felület-élektől függetlenül minden felület kivágásait megnézzük.
    p.surfaces.forEach((s) => {
      if (!Array.isArray(s.cutouts)) return;
      s.cutouts.forEach((c) => {
        const eEdg = Array.isArray(c.edgeEdgings) ? c.edgeEdgings : [];
        if (!eEdg.some((x) => x)) return;
        // [top, right, bottom, left] — hosszak: top/bottom = c.w, left/right = c.h
        if (eEdg[0]) { edgingMm += c.w || 0; edgingN++; } // fent
        if (eEdg[1]) { edgingMm += c.h || 0; edgingN++; } // jobb
        if (eEdg[2]) { edgingMm += c.w || 0; edgingN++; } // lent
        if (eEdg[3]) { edgingMm += c.h || 0; edgingN++; } // bal
      });
    });

    return { horizMm, vertMm, horizN, vertN, edgingMm, edgingN };
  }

  // Kartus-szám: hossz × szélesség × mélység → ml → tubusok (felfelé).
  function computeSiliconeTubes(totalLengthMm, m) {
    const widthMm = m.silWidthMm || 5, depthMm = m.silDepthMm || 5;
    const tubeMl = Math.max(1, m.silTubeMl || 310);
    const wasteFrac = Math.max(0, m.silWastePct || 0) / 100;
    const volumeMm3 = totalLengthMm * widthMm * depthMm;
    const volumeMl = volumeMm3 / 1000; // mm³ → ml (1 ml = 1 cm³ = 1000 mm³)
    const tubes = Math.ceil((volumeMl * (1 + wasteFrac)) / tubeMl);
    return { volumeMl, tubes };
  }

  // Projekt-szintű fuga-tömeg az összes felület utolsó ismert (cache-elt) groutArea-jából.
  function computeProjectGroutMass(p) {
    let totalMassKg = 0;
    p.surfaces.forEach((s) => {
      const a = s.lastGroutAreaMm2 || 0;
      const thick = s.lastTileThicknessMm || 8;
      if (a <= 0) return;
      const density = GROUT_DENSITIES[p.material ? p.material.groutPreset : "cg1"] || 1.5;
      const volCm3 = (a * thick) / 1000;
      totalMassKg += (volCm3 * density) / 1000;
    });
    return totalMassKg;
  }

  // Minden felület kiosztásának újraszámolása offscreen vászonra, hogy
  // a projekt-szintű anyagösszesítés ne csak az aktív felületet mutassa.
  // Hívás: Anyag fülre váltáskor (gyors: pár felület, csak cache-elés).
  function recomputeAllSurfacesMaterial() {
    if (!project || !Array.isArray(project.surfaces)) return;
    saveActiveSurface(); // a jelenlegi felület mentése
    const savedIndex = project.activeIndex;
    const savedCtx = ctx;
    const savedView = state.view;
    const off = document.createElement("canvas");
    off.width = 100; off.height = 100;
    const wasSuppress = suppressHistory, wasInDrag = inDrag;
    suppressHistory = true; inDrag = true; // ne pusholjon history-t / ne ment-tárazzon
    ctx = off.getContext("2d");
    state.view = { scale: 1, ox: 0, oy: 0 }; // a koord-rendszer a cache-elt mm-értékeket nem érinti
    try {
      for (let i = 0; i < project.surfaces.length; i++) {
        project.activeIndex = i;
        loadActiveSurface();
        if (shouldDrawLayout()) drawLayout();
        else cacheActiveSurfaceMaterial(null);
      }
    } catch (_) { /* swallow */ }
    project.activeIndex = savedIndex;
    loadActiveSurface();
    ctx = savedCtx;
    state.view = savedView;
    render(); // a látható vászon visszaáll (ezalatt is suppressHistory aktív)
    updateProjectMaterialReport();
    // a frissített cache-t mentjük (history nélkül), hogy reload után is megmaradjon
    try { idbSet(STORE_KEY, JSON.stringify(serializeStore())); } catch (_) {}
    suppressHistory = wasSuppress; inDrag = wasInDrag;
  }

  function updateProjectMaterialReport() {
    if (!el.prMass || !project) return;
    const m = project.material || defaultMaterial();
    const overage = Math.max(0, state.layout && state.layout.overagePct || 0);

    // Burkolat — projekt-szint, laptípusonként bontva
    const tn = computeProjectTileNumbers(project);
    el.prArea.textContent = tn.area > 0 ? (tn.area / 1e6).toFixed(2) + " m²" : "–";
    if (el.prTilesByType) {
      const groups = computeProjectTileNumbersByType(project);
      if (!groups.length) {
        el.prTilesByType.innerHTML = '<div class="mat-row"><span>Lap szükséglet:</span> <strong>–</strong></div>';
      } else {
        const parts = groups.map((g) => {
          const finalTiles = Math.ceil(g.needed * (1 + overage / 100));
          const wastePct = g.usedArea > 0 ? (1 - g.area / g.usedArea) * 100 : 0;
          const surfList = g.surfaceNames.length ? g.surfaceNames.join(", ") : "";
          return '<div class="tile-group">'
            + '<div class="tile-group-h">' + escapeHtml(g.name) + (surfList ? ' <span class="tg-sub">(' + escapeHtml(surfList) + ')</span>' : '') + '</div>'
            + '<div class="mat-row"><span>Burkolt terület:</span> <strong>' + (g.area / 1e6).toFixed(2) + ' m²</strong></div>'
            + '<div class="mat-row"><span>Egész lap:</span> <strong>' + g.whole + ' db</strong></div>'
            + '<div class="mat-row"><span>Vágott helyek:</span> <strong>' + g.cut + ' db</strong></div>'
            + '<div class="mat-row"><span>Szükséges lap (újrahaszn.):</span> <strong>' + g.needed + ' db (hulladék: ' + wastePct.toFixed(0) + ' %)</strong></div>'
            + '<div class="mat-row"><span><strong>Lap tartalékkal:</strong></span> <strong>' + finalTiles + ' db (+' + overage + '%)</strong></div>'
            + '</div>';
        });
        el.prTilesByType.innerHTML = parts.join("");
      }
    }

    // Fuga — projekt-szint
    const gArea = project.surfaces.reduce((acc, s) => acc + (s.lastGroutAreaMm2 || 0), 0);
    const massKg = computeProjectGroutMass(project) * (1 + overage / 100);
    el.prGroutArea.textContent = gArea > 0 ? (gArea / 1e6).toFixed(2) + " m²" : "–";
    el.prMass.textContent = massKg > 0 ? massKg.toFixed(2) + " kg (+" + overage + "%)" : "–";
    if (el.prGroutPacks) {
      const packKg = GROUT_PACK_KG[m.groutPreset] || 5;
      const packName = GROUT_PACK_NAME[m.groutPreset] || "csomag";
      if (massKg > 0 && packKg > 0) {
        const packs = Math.ceil(massKg / packKg);
        el.prGroutPacks.textContent = packs + " db " + packName + " (" + packKg + " kg/" + packName + ")";
      } else {
        el.prGroutPacks.textContent = "–";
      }
    }

    // Ragasztó — projekt-szint (a tn.area-t használjuk, mert ugyanaz a burkolt terület)
    if (el.prGlueArea) {
      const glueWaste = Math.max(0, m.glueWastePct || 0);
      const kgPerM2 = GLUE_KG_PER_M2[m.gluePreset] || 5;
      const glueKg = (tn.area / 1e6) * kgPerM2 * (1 + glueWaste / 100);
      el.prGlueArea.textContent = tn.area > 0 ? (tn.area / 1e6).toFixed(2) + " m² × " + kgPerM2 + " kg/m²" : "–";
      el.prGlueMass.textContent = glueKg > 0 ? glueKg.toFixed(2) + " kg (+" + glueWaste + "% tartalék)" : "–";
      if (glueKg > 0) {
        const packs = Math.ceil(glueKg / GLUE_PACK_KG);
        el.prGluePacks.textContent = packs + " db zsák (" + GLUE_PACK_KG + " kg)";
      } else {
        el.prGluePacks.textContent = "–";
      }
    }

    // Szilikon — projekt-szint
    const sil = computeSiliconeForProject(project);
    const totLen = sil.horizMm + sil.vertMm;
    const fmtLen = (mm) => (mm / 1000).toFixed(2) + " m";
    el.prSilH.textContent = sil.horizN ? fmtLen(sil.horizMm) + " (" + sil.horizN + " fal)" : "–";
    el.prSilV.textContent = sil.vertN ? fmtLen(sil.vertMm) + " (" + sil.vertN + " sarok)" : "–";
    if (totLen > 0) {
      const t = computeSiliconeTubes(totLen, m);
      el.prSilTot.textContent = fmtLen(totLen);
      el.prTubes.textContent = t.tubes + " db kartus (" + t.volumeMl.toFixed(0) + " ml, +" + (m.silWastePct || 0) + "%)";
    } else {
      el.prSilTot.textContent = "–";
      el.prTubes.textContent = "–";
    }
    if (el.prEdging) {
      el.prEdging.textContent = sil.edgingN > 0
        ? fmtLen(sil.edgingMm) + " (" + sil.edgingN + " él)"
        : "–";
    }
  }

  // Fuga: területből → térfogat (cm³) → tömeg (kg). area mm², thick mm, density g/cm³.
  function computeGroutMass(areaMm2, thicknessMm, overagePct) {
    const density = GROUT_DENSITIES[project && project.material ? project.material.groutPreset : "cg1"] || 1.5;
    const volumeCm3 = (areaMm2 * thicknessMm) / 1000; // mm²·mm = mm³ → cm³ : /1000
    const massKg = (volumeCm3 * density) / 1000;
    const finalKg = massKg * (1 + Math.max(0, overagePct || 0) / 100);
    return { areaMm2, volumeCm3, massKg, finalKg, density };
  }

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
  function renderPaintPalette() {
    if (!el.paintPalette) return;
    el.paintPalette.innerHTML = "";
    const sel = state.layout.paintTypeId;
    const items = [{ id: "__erase__", erase: true, name: "Alap" }].concat(state.tiles.types);
    items.forEach((it) => {
      const div = document.createElement("div");
      div.className = "paint-swatch" + (it.erase ? " erase" : "") + (sel === it.id ? " sel" : "");
      div.title = it.erase ? "Vissza az alap lapra" : it.name;
      const sw = document.createElement("div");
      sw.className = "sw";
      if (!it.erase) applyFill(sw, it);
      const nm = document.createElement("div");
      nm.className = "nm";
      nm.textContent = it.name;
      div.append(sw, nm);
      div.addEventListener("click", () => {
        state.layout.paintTypeId = it.id;
        renderPaintPalette();
        save();
      });
      el.paintPalette.appendChild(div);
    });
  }

  // Kivágás-lista (számszerű finomhangolás)
  function renderCutoutList() {
    if (!el.cutoutList) return;
    el.cutoutList.innerHTML = "";
    const cuts = state.cutouts || [];
    if (!cuts.length) {
      el.cutoutList.innerHTML = '<p class="empty-note">Nincs kivágás. Rajzolj egyet a vásznon.</p>';
      return;
    }
    const dec = state.unit === "cm" ? 1 : 0;
    const step = state.unit === "cm" ? "0.1" : "1";
    cuts.forEach((c, idx) => {
      const item = document.createElement("div");
      item.className = "cutout-item";

      const head = document.createElement("div");
      head.className = "cutout-head";
      const sw = document.createElement("span");
      sw.className = "swatch"; sw.style.background = cutoutColor(c.kind);
      const kindSel = document.createElement("select");
      [["opening", "Nyílás"], ["untiled", "Nem burkolt"]].forEach(([v, l]) => {
        const o = document.createElement("option"); o.value = v; o.textContent = l; kindSel.appendChild(o);
      });
      kindSel.value = c.kind;
      kindSel.addEventListener("change", () => { c.kind = kindSel.value; afterGeometryChange(); });
      const fit = document.createElement("button");
      fit.className = "fit"; fit.textContent = "⤧"; fit.title = "Felülethez igazítás (ha lelóg vagy nagyobb mint a felület)";
      fit.addEventListener("click", () => {
        if (fitCutoutToSurface(c)) { selectedCutout = idx; afterGeometryChange(); renderCutoutList(); }
      });
      const del = document.createElement("button");
      del.className = "del"; del.textContent = "✕"; del.title = "Kivágás törlése";
      del.addEventListener("click", () => { state.cutouts.splice(idx, 1); afterGeometryChange(); });
      head.append(sw, kindSel, fit, del);

      const dims = document.createElement("div");
      dims.className = "cutout-dims";
      const mk = (label, get, set) => {
        const lab = document.createElement("label");
        const span = document.createElement("span"); span.textContent = label;
        const inp = document.createElement("input");
        inp.type = "number"; inp.step = step;
        inp.value = fromMm(get()).toFixed(dec);
        inp.addEventListener("change", () => {
          const mm = toMm(parseFloat(inp.value));
          if (!Number.isNaN(mm)) { set(mm); afterGeometryChange(); }
        });
        lab.append(span, inp);
        return lab;
      };
      dims.append(
        mk("X", () => c.x, (v) => (c.x = v)),
        mk("Y", () => c.y, (v) => (c.y = v)),
        mk("Sz", () => c.w, (v) => (c.w = Math.max(0, v))),
        mk("M", () => c.h, (v) => (c.h = Math.max(0, v))),
      );
      item.append(head, dims);

      // Élvédő-élek (a kivágás 4 éle: fent, jobb, lent, bal)
      const edgRow = document.createElement("div");
      edgRow.className = "cutout-edging-row";
      const edgTitle = document.createElement("div");
      edgTitle.className = "cutout-edging-title";
      edgTitle.textContent = "Élvédő profil ezeken az éleken:";
      edgRow.appendChild(edgTitle);
      const edgGrid = document.createElement("div");
      edgGrid.className = "cutout-edging-grid";
      if (!Array.isArray(c.edgeEdgings)) c.edgeEdgings = [false, false, false, false];
      ["fent", "jobb", "lent", "bal"].forEach((label, ei) => {
        const lab = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!c.edgeEdgings[ei];
        cb.addEventListener("change", () => {
          c.edgeEdgings[ei] = cb.checked;
          afterGeometryChange();
        });
        const sp = document.createElement("span");
        sp.textContent = label;
        lab.append(cb, sp);
        edgGrid.appendChild(lab);
      });
      edgRow.appendChild(edgGrid);
      item.append(edgRow);

      // Kép-sor: csak nyílásnál (ajtó/ablak rajz). Méretarány-tartó "contain" megjelenítés.
      if (c.kind === "opening") {
        const imgRow = document.createElement("div");
        imgRow.className = "cutout-img-row";
        const file = document.createElement("input");
        file.type = "file"; file.accept = "image/*";
        file.title = "Kép kiválasztása (ajtó/ablak)";
        file.addEventListener("change", () => {
          const f = file.files && file.files[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            downscaleImage(r.result, 700, (small) => {
              c.imageUrl = small;
              render(); save();
              renderCutoutList();
            });
          };
          r.readAsDataURL(f);
        });
        imgRow.appendChild(file);
        if (c.imageUrl) {
          const thumb = document.createElement("img");
          thumb.src = c.imageUrl; thumb.className = "cutout-thumb";
          thumb.alt = ""; thumb.title = "Aktuális kép";
          const rm = document.createElement("button");
          rm.className = "img-rm"; rm.textContent = "Kép törlése";
          rm.addEventListener("click", () => { c.imageUrl = null; render(); save(); renderCutoutList(); });
          imgRow.append(thumb, rm);
        }
        item.append(imgRow);
      }

      el.cutoutList.appendChild(item);
    });
  }

  function initCutoutUI() {
    el.cutoutKindSeg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      newCutoutKind = b.dataset.kind;
      [...el.cutoutKindSeg.children].forEach((c) => c.classList.toggle("active", c === b));
    });
    el.untiledColor.addEventListener("input", () => {
      if (project) project.untiledColor = el.untiledColor.value;
      render(); renderCutoutList();
    });
    el.untiledColor.addEventListener("change", save);
    el.cutoutDraw.addEventListener("click", () => {
      cutoutMode = !cutoutMode;
      if (cutoutMode) { paintMode = false; el.paintMode.checked = false; }
      el.cutoutDraw.classList.toggle("active-mode", cutoutMode);
      el.cutoutDraw.textContent = cutoutMode ? "✓ Rajzolás bekapcsolva (húzz egy téglalapot)" : "+ Kivágás rajzolása";
      pendingCutout = null;
      render();
    });
  }

  // A kötésminta szerint mutatja/rejti az eltolás-vezérlőket
  function applyPatternUIState() {
    const isOffset = state.layout.pattern === "offset";
    el.offsetRow.style.display = isOffset ? "" : "none";
    el.offsetQuick.style.display = isOffset ? "" : "none";
    const isHerring = state.layout.pattern === "herringbone";
    if (el.herringboneTiltRow) el.herringboneTiltRow.hidden = !isHerring;
    if (el.herringboneTilt) el.herringboneTilt.checked = !!state.layout.herringboneTilted;
  }

  // A szél-igazítás módja szerint engedélyezi/letiltja a kézi eltolást és a küszöböt
  function applyAlignUIState() {
    const active = state.layout.alignMode !== "none";
    el.offX.disabled = active;
    el.offY.disabled = active;
    el.thr.disabled = state.layout.alignMode !== "min";
    el.offHint.style.display = active ? "" : "none";
    [...el.alignSeg.children].forEach((c) =>
      c.classList.toggle("active", c.dataset.align === state.layout.alignMode));
  }

  function initLayoutUI() {
    el.patternSel.addEventListener("change", () => {
      state.layout.pattern = el.patternSel.value;
      applyPatternUIState();
      render(); save();
    });
    if (el.herringboneTilt) {
      el.herringboneTilt.addEventListener("change", () => {
        state.layout.herringboneTilted = !!el.herringboneTilt.checked;
        render(); save();
      });
    }
    el.offsetPct.addEventListener("change", () => {
      const v = parseFloat(el.offsetPct.value);
      if (!Number.isNaN(v)) { state.layout.offsetPct = Math.max(0, Math.min(100, v)); render(); save(); }
    });
    el.offsetQuick.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      state.layout.offsetPct = parseFloat(b.dataset.off);
      el.offsetPct.value = Math.round(state.layout.offsetPct);
      render(); save();
    });
    el.layoutShow.addEventListener("change", () => {
      state.layout.show = el.layoutShow.checked; render(); save();
    });
    el.tileRotate.addEventListener("change", () => {
      state.layout.rotated = el.tileRotate.checked; render(); save();
    });
    if (el.linkToFloor) {
      el.linkToFloor.addEventListener("change", () => {
        state.layout.linkToFloor = el.linkToFloor.checked;
        render(); save();
      });
    }
    el.offX.addEventListener("change", () => {
      const v = parseFloat(el.offX.value);
      if (!Number.isNaN(v)) { state.layout.offXmm = toMm(v); render(); save(); }
    });
    el.offY.addEventListener("change", () => {
      const v = parseFloat(el.offY.value);
      if (!Number.isNaN(v)) { state.layout.offYmm = toMm(v); render(); save(); }
    });
    el.alignSeg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      state.layout.alignMode = b.dataset.align;
      applyAlignUIState();
      render();
      save();
    });
    el.thr.addEventListener("change", () => {
      const v = parseFloat(el.thr.value);
      if (!Number.isNaN(v) && v >= 0) { state.layout.thresholdMm = toMm(v); render(); save(); }
    });
    el.overage.addEventListener("change", () => {
      const v = parseFloat(el.overage.value);
      if (!Number.isNaN(v) && v >= 0) { state.layout.overagePct = v; render(); save(); }
    });
    el.paintMode.addEventListener("change", () => {
      paintMode = el.paintMode.checked;
      if (paintMode) {
        state.selected = null;
        cutoutMode = false; pendingCutout = null;
        el.cutoutDraw.classList.remove("active-mode");
        el.cutoutDraw.textContent = "+ Kivágás rajzolása";
      }
      canvas.style.cursor = paintMode ? "cell" : "crosshair";
      render();
    });
    el.clearOverrides.addEventListener("click", () => {
      if (Object.keys(state.layout.overrides).length === 0) return;
      if (!confirm("Az összes egyedi lapfestés törlése?")) return;
      state.layout.overrides = {};
      render(); save();
    });
  }

  // =======================================================================
  //  7. FÁZIS – Projekt / több felület
  // =======================================================================
  let project = null;
  const PROJECT_KEY = "tile-planner-project";

  function newSurfaceId() { return "s" + Date.now().toString(36) + Math.floor(Math.random() * 1e4); }
  function newProjectId() { return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4); }

  function normLayout(d) {
    d = d || {};
    return {
      pattern: ["straight", "offset", "diagonal", "herringbone"].includes(d.pattern) ? d.pattern : "straight",
      offsetPct: typeof d.offsetPct === "number" ? Math.max(0, Math.min(100, d.offsetPct)) : 50,
      show: d.show !== false,
      offXmm: typeof d.offXmm === "number" ? d.offXmm : 0,
      offYmm: typeof d.offYmm === "number" ? d.offYmm : 0,
      rotated: !!d.rotated,
      herringboneTilted: !!d.herringboneTilted,
      linkToFloor: !!d.linkToFloor,
      alignMode: ["none", "center", "min"].includes(d.alignMode) ? d.alignMode : "none",
      thresholdMm: typeof d.thresholdMm === "number" ? d.thresholdMm : 100,
      overagePct: typeof d.overagePct === "number" ? d.overagePct : 10,
      overrides: (d.overrides && typeof d.overrides === "object") ? d.overrides : {},
      paintTypeId: d.paintTypeId || null,
    };
  }

  function normSurface(d, fallbackBaseId) {
    d = d || {};
    return {
      id: d.id || newSurfaceId(),
      name: d.name || "Felület",
      mode: d.mode === "wall" ? "wall" : "floor",
      points: Array.isArray(d.points) ? d.points : [],
      closed: !!d.closed,
      snap: d.snap !== false,
      gridMm: d.gridMm || 100,
      ortho: !!d.ortho,
      baseId: d.baseId || fallbackBaseId,
      groutMm: typeof d.groutMm === "number" ? d.groutMm : 3,
      groutColor: d.groutColor || "#cfcfcf",
      cutouts: Array.isArray(d.cutouts)
        ? d.cutouts.filter((c) => c && typeof c.w === "number").map((c) => ({
            x: c.x || 0, y: c.y || 0, w: c.w, h: c.h,
            kind: c.kind === "untiled" ? "untiled" : "opening",
            imageUrl: c.imageUrl || null,
            // élvédő a kivágás 4 élén: [top, right, bottom, left]
            edgeEdgings: Array.isArray(c.edgeEdgings) ? c.edgeEdgings.slice(0, 4).map((x) => !!x) : [false, false, false, false],
          }))
        : [],
      edgeNames: Array.isArray(d.edgeNames) ? d.edgeNames.slice() : [],
      edgeEdgings: Array.isArray(d.edgeEdgings) ? d.edgeEdgings.map((x) => !!x) : [],
      layout: normLayout(d.layout),
      fromFloorId: d.fromFloorId || null,
      fromEdgeIndex: typeof d.fromEdgeIndex === "number" ? d.fromEdgeIndex : null,
      wallsSignature: d.wallsSignature || null,
      wallHeightMm: typeof d.wallHeightMm === "number" ? d.wallHeightMm : null,
      warnDismissedSignature: d.warnDismissedSignature || null,
      lastGroutAreaMm2: typeof d.lastGroutAreaMm2 === "number" ? d.lastGroutAreaMm2 : 0,
      lastTileThicknessMm: typeof d.lastTileThicknessMm === "number" ? d.lastTileThicknessMm : 8,
      lastAreaMm2: typeof d.lastAreaMm2 === "number" ? d.lastAreaMm2 : 0,
      lastTileAreaMm2: typeof d.lastTileAreaMm2 === "number" ? d.lastTileAreaMm2 : 0,
      lastTilesNeeded: typeof d.lastTilesNeeded === "number" ? d.lastTilesNeeded : 0,
      lastWhole: typeof d.lastWhole === "number" ? d.lastWhole : 0,
      lastCut: typeof d.lastCut === "number" ? d.lastCut : 0,
      lastTilesByType: (d.lastTilesByType && typeof d.lastTilesByType === "object") ? d.lastTilesByType : null,
    };
  }

  function defaultMaterial() {
    return {
      groutPreset: "cg1",            // "cg1" | "cg2" | "epoxy"
      silWidthMm: 5,
      silDepthMm: 5,
      silTubeMl: 310,
      silWastePct: 15,
      gluePreset: "c2s1",            // "c1" | "c2" | "c2s1"
      glueWastePct: 10,
    };
  }
  // g/cm³ — a Mapei Kerapoxy Easy Design adatlapja szerint a kevert epoxi 1,55 g/cm³
  const GROUT_DENSITIES = { cg1: 1.5, cg2: 1.7, epoxy: 1.55 };
  const GROUT_LABELS = {
    cg1: "Cementes CG1",
    cg2: "Cementes CG2",
    epoxy: "Mapei Kerapoxy Easy Design (epoxi)",
  };
  // standard csomagolási méret (kg/csomag) — cementes átlag 5 kg-os zsák,
  // a Mapei Kerapoxy Easy Design 3 kg-os vödör (gyári kiszerelés)
  const GROUT_PACK_KG = { cg1: 5, cg2: 5, epoxy: 3 };
  const GROUT_PACK_NAME = { cg1: "zsák", cg2: "zsák", epoxy: "vödör" };

  // Ragasztó-fogyasztás (kg/m²) — a fogazatlap-méret függvénye, ez egy átlag.
  // EN 12004 osztály-jelölések: C1 = sima cementes, C2 = fokozott tapadású,
  // S1 = deformálható (rugalmas) — pl. Mapei Keraflex Maxi S1, Schönox Q9.
  const GLUE_KG_PER_M2 = { c1: 4.0, c2: 5.0, c2s1: 5.0 };
  const GLUE_LABELS = {
    c1: "C1 cementes",
    c2: "C2 flexibilis",
    c2s1: "C2 S1 deformálható",
  };
  const GLUE_PACK_KG = 25;

  function defaultProject(name) {
    const dt = defaultTiles();
    const types = dt.types.map((t) => ({ ...t })); // friss példány (projektenként külön könyvtár)
    return {
      id: newProjectId(), name: name || "Projekt", unit: "cm", tileTypes: types, activeIndex: 0, untiledColor: "#8a8f98",
      material: defaultMaterial(),
      surfaces: [normSurface({ name: "Padló", mode: "floor", baseId: types[0].id, groutMm: dt.groutMm, groutColor: dt.groutColor, layout: { paintTypeId: types[0].id } }, types[0].id)],
    };
  }

  function projectFromLegacy(d) {
    const types = (d.tiles && Array.isArray(d.tiles.types) && d.tiles.types.length) ? d.tiles.types : defaultTiles().types;
    const baseId = (d.tiles && d.tiles.baseId && types.some((t) => t.id === d.tiles.baseId)) ? d.tiles.baseId : types[0].id;
    const surf = normSurface({
      name: d.mode === "wall" ? "Fal" : "Padló", mode: d.mode, points: d.points, closed: d.closed,
      snap: d.snap, gridMm: d.gridMm, ortho: d.ortho, baseId,
      groutMm: d.tiles ? d.tiles.groutMm : 3, groutColor: d.tiles ? d.tiles.groutColor : "#cfcfcf",
      layout: d.layout,
    }, baseId);
    return { id: newProjectId(), name: "Projekt", unit: d.unit || "cm", untiledColor: "#8a8f98", tileTypes: types, surfaces: [surf], activeIndex: 0 };
  }

  function normalizeProject(p) {
    if (!p || typeof p !== "object") return defaultProject();
    const types = (Array.isArray(p.tileTypes) && p.tileTypes.length) ? p.tileTypes : defaultTiles().types;
    types.forEach((t) => { if (!(typeof t.thicknessMm === "number" && t.thicknessMm > 0)) t.thicknessMm = 8; });
    let surfaces = (Array.isArray(p.surfaces) && p.surfaces.length)
      ? p.surfaces.map((s) => normSurface(s, types[0].id))
      : [normSurface({ name: "Padló", mode: "floor", baseId: types[0].id }, types[0].id)];
    surfaces.forEach((s) => { if (!types.some((t) => t.id === s.baseId)) s.baseId = types[0].id; });
    let ai = Math.max(0, Math.min(typeof p.activeIndex === "number" ? p.activeIndex : 0, surfaces.length - 1));
    // Migráció: régi mentésekben hiányozhat a wall.fromEdgeIndex (a korábbi normSurface
    // nem őrizte meg). Próbáljuk visszafejteni: 1) a fal szélessége (points[1]-points[0])
    // egyezzen a floor egyik élének hosszával; 2) ha nem egyértelmű, a fromFloorId-szerű
    // falak sorrendje 0..n-1 (ahogy generateWalls hozta létre őket).
    surfaces.forEach((floor) => {
      if (floor.mode !== "floor" || !floor.closed || !Array.isArray(floor.points) || floor.points.length < 3) return;
      const myWalls = surfaces.filter((w) => w.fromFloorId === floor.id);
      if (!myWalls.length) return;
      const fp = floor.points, n = fp.length;
      const edgeLens = [];
      for (let i = 0; i < n; i++) {
        const a = fp[i], b = fp[(i + 1) % n];
        edgeLens.push(Math.hypot(b.x - a.x, b.y - a.y));
      }
      const usedEdges = new Set();
      myWalls.forEach((w, idx) => {
        if (typeof w.fromEdgeIndex === "number" && w.fromEdgeIndex >= 0 && w.fromEdgeIndex < n) {
          usedEdges.add(w.fromEdgeIndex);
        }
      });
      myWalls.forEach((w, idx) => {
        if (typeof w.fromEdgeIndex === "number" && w.fromEdgeIndex >= 0 && w.fromEdgeIndex < n) return;
        let chosen = -1;
        if (Array.isArray(w.points) && w.points.length >= 2) {
          const wWidth = Math.hypot(w.points[1].x - w.points[0].x, w.points[1].y - w.points[0].y);
          let best = -1, bestDiff = Infinity;
          for (let i = 0; i < n; i++) {
            if (usedEdges.has(i)) continue;
            const diff = Math.abs(edgeLens[i] - wWidth);
            if (diff < bestDiff) { bestDiff = diff; best = i; }
          }
          if (best >= 0 && bestDiff < 1.5) chosen = best;
        }
        if (chosen < 0) {
          // fallback: a generálási sorrend (idx)
          if (idx < n && !usedEdges.has(idx)) chosen = idx;
        }
        if (chosen >= 0) { w.fromEdgeIndex = chosen; usedEdges.add(chosen); }
      });
      // ha hiányzik a floor.wallHeightMm, próbáljuk a falak magasságából (points[2].y - points[1].y)
      if (!(typeof floor.wallHeightMm === "number" && floor.wallHeightMm > 0)) {
        const w = myWalls[0];
        if (w && Array.isArray(w.points) && w.points.length >= 3) {
          const hMm = Math.hypot(w.points[2].x - w.points[1].x, w.points[2].y - w.points[1].y);
          if (hMm > 0) floor.wallHeightMm = hMm;
        }
      }
    });
    const mat = Object.assign(defaultMaterial(), (p.material && typeof p.material === "object") ? p.material : {});
    if (!(mat.groutPreset in GROUT_DENSITIES)) mat.groutPreset = "cg1";
    if (!(mat.gluePreset in GLUE_KG_PER_M2)) mat.gluePreset = "c2s1";
    ["silWidthMm", "silDepthMm", "silTubeMl", "silWastePct", "glueWastePct"].forEach((k) => {
      if (!(typeof mat[k] === "number" && mat[k] >= 0)) mat[k] = defaultMaterial()[k];
    });
    return { id: p.id || newProjectId(), name: p.name || "Projekt", unit: p.unit === "mm" ? "mm" : "cm", untiledColor: p.untiledColor || "#8a8f98", tileTypes: types, surfaces, activeIndex: ai, material: mat };
  }

  // A state <-> aktív felület szinkronizálása
  function saveActiveSurface() {
    const s = project.surfaces[project.activeIndex];
    if (!s) return;
    s.mode = state.mode;
    s.points = state.points;
    s.closed = state.closed;
    s.snap = state.snap; s.gridMm = state.gridMm; s.ortho = state.ortho;
    s.baseId = state.tiles.baseId; s.groutMm = state.tiles.groutMm; s.groutColor = state.tiles.groutColor;
    s.cutouts = state.cutouts;
    s.edgeNames = state.edgeNames;
    s.edgeEdgings = state.edgeEdgings;
    s.layout = state.layout;
  }

  function loadActiveSurface() {
    const s = project.surfaces[project.activeIndex];
    state.mode = s.mode;
    state.points = s.points;
    state.closed = s.closed;
    state.snap = s.snap; state.gridMm = s.gridMm; state.ortho = s.ortho;
    state.selected = null;
    state.unit = project.unit;
    state.tiles = { types: project.tileTypes, baseId: s.baseId, groutMm: s.groutMm, groutColor: s.groutColor };
    if (!Array.isArray(s.cutouts)) s.cutouts = [];
    state.cutouts = s.cutouts;
    if (!Array.isArray(s.edgeNames)) s.edgeNames = [];
    state.edgeNames = s.edgeNames;
    if (!Array.isArray(s.edgeEdgings)) s.edgeEdgings = [];
    state.edgeEdgings = s.edgeEdgings;
    state.layout = s.layout;
  }

  // ---- Tár (több projekt) ----------------------------------------------
  let store = null;
  const STORE_KEY = "tile-planner-store";

  // ---- IndexedDB tároló (a localStorage 5-10 MB-os limitje helyett) ----
  // Egyetlen "kv" object store, key-value (key="tile-planner-store",
  // value = JSON-stringre szerializált store snapshot).
  const IDB_NAME = "tile-planner-db";
  const IDB_STORE = "kv";
  let idbConnPromise = null;
  function idbOpen() {
    if (idbConnPromise) return idbConnPromise;
    idbConnPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("Az IndexedDB nem elérhető")); return; }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return idbConnPromise;
  }
  function idbGet(key) {
    return idbOpen().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }
  function idbSet(key, value) {
    return idbOpen().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  function activeProject() {
    return store.projects.find((p) => p.id === store.activeProjectId) || store.projects[0];
  }

  function serializeProject() { saveActiveSurface(); return project; }
  function serializeStore() { saveActiveSurface(); return store; }

  // ---- Visszavonás / újra (undo/redo) ----------------------------------
  let history = [];
  let hIndex = -1;
  let suppressHistory = false; // visszaállítás közben ne rögzítsünk előzményt
  let inDrag = false;          // folyamatos húzás közben ne rögzítsünk minden képkockát
  const HISTORY_MAX = 80;

  function pushHistoryWith(snap) {
    if (hIndex >= 0 && history[hIndex] === snap) return; // nincs valódi változás
    if (hIndex < history.length - 1) history = history.slice(0, hIndex + 1);
    history.push(snap);
    if (history.length > HISTORY_MAX) history.shift();
    hIndex = history.length - 1;
    updateUndoRedoButtons();
  }
  function pushHistory() { pushHistoryWith(JSON.stringify(serializeStore())); }

  let saveFailed = false;
  let pendingSnap = null;     // utoljára kért snapshot, ami még nincs IDB-be írva
  let flushScheduled = false; // throttle: egy timer várja a flush-t
  function flushToIDB() {
    flushScheduled = false;
    const snap = pendingSnap;
    if (snap == null) return;
    pendingSnap = null;
    idbSet(STORE_KEY, snap).then(() => { saveFailed = false; }).catch((e) => {
      if (!saveFailed) {
        saveFailed = true;
        setTimeout(() => alert(
          "A terv nem mentődött el (IndexedDB hiba): " + (e && e.message || e) + "\n\n" +
          "Mentsd a projektet fájlba az Export fülön (Összes projekt mentése JSON)."
        ), 0);
      }
    });
  }
  // Az utolsó pending snap-et a tab bezárása előtt is megpróbáljuk lemezre menteni.
  window.addEventListener("beforeunload", () => {
    if (pendingSnap != null) { try { idbSet(STORE_KEY, pendingSnap); } catch (_) {} }
  });

  function save() {
    const snap = JSON.stringify(serializeStore());
    pendingSnap = snap; // mindig a legfrissebb snap, a flush csak ezt írja ki
    if (!flushScheduled) {
      flushScheduled = true;
      setTimeout(flushToIDB, 60); // ~60 ms throttle, hogy sűrű save-eknél ne fojtsunk meg minden frame-et
    }
    if (!suppressHistory && !inDrag) pushHistoryWith(snap);
  }

  function restoreSnapshot(snap) {
    suppressHistory = true;
    try {
      store = normalizeStore(JSON.parse(snap));
      project = activeProject();
      loadActiveSurface();
      refreshAll();
    } catch (_) {}
    suppressHistory = false;
    updateUndoRedoButtons();
  }
  function undo() {
    if (hIndex <= 0) return;
    hIndex--;
    restoreSnapshot(history[hIndex]);
  }
  function redo() {
    if (hIndex >= history.length - 1) return;
    hIndex++;
    restoreSnapshot(history[hIndex]);
  }
  function updateUndoRedoButtons() {
    if (el.histUndo) el.histUndo.disabled = hIndex <= 0;
    if (el.histRedo) el.histRedo.disabled = hIndex >= history.length - 1;
  }

  function normalizeStore(s) {
    if (!s || !Array.isArray(s.projects) || !s.projects.length) {
      const p = defaultProject();
      return { projects: [p], activeProjectId: p.id };
    }
    const projects = s.projects.map(normalizeProject);
    let aid = s.activeProjectId;
    if (!projects.some((p) => p.id === aid)) aid = projects[0].id;
    return { projects, activeProjectId: aid };
  }

  async function loadStoreAsync() {
    // 1. Friss adat IndexedDB-ből (új tárolás 2026-06-24 óta).
    try {
      const raw = await idbGet(STORE_KEY);
      if (raw) { store = normalizeStore(JSON.parse(raw)); return; }
    } catch (_) {}
    // 2. Migráció: ha még csak localStorage-ban van adat, beemeljük IDB-be.
    //    A localStorage-t MEGTARTJUK biztonsági mentésnek (a következő save() már
    //    nem írja át, mert IDB-be megy).
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        store = normalizeStore(JSON.parse(raw));
        try { await idbSet(STORE_KEY, raw); } catch (_) {}
        return;
      }
    } catch (_) {}
    // 3. Régebbi formátum migráció (egyetlen projekt vagy az ősi terv).
    let p = null;
    try { const r = localStorage.getItem(PROJECT_KEY); if (r) p = normalizeProject(JSON.parse(r)); } catch (_) {}
    if (!p) { try { const o = localStorage.getItem(STORAGE_KEY); if (o) p = projectFromLegacy(JSON.parse(o)); } catch (_) {} }
    if (!p) p = defaultProject();
    store = { projects: [p], activeProjectId: p.id };
  }

  // teljes UI-frissítés projekt- vagy felületváltás után
  function refreshAll() {
    syncControlsFromState();
    renderTileLibrary();
    renderEdgeList();
    updateSummary();
    renderProjectTree();
    if (el.projName) el.projName.value = project.name;
    updateCanvasTitle();
    checkWallSync();
    fitView();
    save();
  }

  // A vászon-fejléc frissítése: "Projekt — Felület"
  function updateCanvasTitle() {
    const t = document.getElementById("canvasTitle");
    if (!t || !project) return;
    const s = project.surfaces[project.activeIndex];
    if (!s) { t.innerHTML = ""; return; }
    const pn = escapeHtml(project.name || "Projekt");
    const sn = escapeHtml(s.name || "Felület");
    t.innerHTML = pn + '<span class="sep">—</span><span class="surf">' + sn + '</span>';
  }

  // ---- Fa-lista (projektek + felületek) --------------------------------
  function treeRow(cls) { const d = document.createElement("div"); d.className = "tree-row " + cls; return d; }
  function treeBtn(label, cls, title) {
    const b = document.createElement("button");
    b.className = "tree-btn " + (cls || "");
    b.textContent = label; b.title = title || "";
    return b;
  }

  // melyik projektek vannak kibontva (session-szintű állapot, nem perzisztens).
  // Default: az aktív projekt kibontva; a caret-tel a felhasználó bármelyiket
  // be- vagy kicsukhatja, az aktívat is.
  const expandedProjects = new Set();
  function toggleProjectExpanded(id) {
    if (expandedProjects.has(id)) expandedProjects.delete(id);
    else expandedProjects.add(id);
    renderProjectTree();
  }

  function renderProjectTree() {
    const root = el.projTree;
    root.innerHTML = "";
    store.projects.forEach((p) => {
      const isActive = p.id === store.activeProjectId;
      const isOpen = expandedProjects.has(p.id);
      const prow = treeRow("tree-proj" + (isActive ? " active" : ""));
      const caret = document.createElement("span");
      caret.className = "caret"; caret.textContent = isOpen ? "▾" : "▸";
      caret.title = isOpen ? "Összecsukás" : "Kinyitás";
      caret.addEventListener("click", (e) => { e.stopPropagation(); toggleProjectExpanded(p.id); });
      const nm = document.createElement("span");
      nm.className = "tree-name"; nm.textContent = p.name;
      prow.append(caret, nm);
      prow.addEventListener("click", (e) => { if (e.target.closest(".tree-btn")) return; switchProject(p.id); });
      const edit = treeBtn("✎", "", "Projekt átnevezése");
      edit.addEventListener("click", (e) => { e.stopPropagation(); renameProjectFn(p.id); });
      const del = treeBtn("✕", "del", "Projekt törlése");
      del.disabled = store.projects.length <= 1;
      del.addEventListener("click", (e) => { e.stopPropagation(); deleteProjectFn(p.id); });
      prow.append(edit, del);
      root.appendChild(prow);

      if (isOpen) {
        p.surfaces.forEach((s, i) => {
          const isSurfActive = isActive && i === p.activeIndex;
          const srow = treeRow("tree-surf" + (isSurfActive ? " active" : ""));
          const ic = document.createElement("span");
          ic.className = "micon"; ic.textContent = s.mode === "floor" ? "▭" : "▯";
          const sn = document.createElement("span");
          sn.className = "tree-name"; sn.textContent = s.name;
          srow.append(ic, sn);
          srow.addEventListener("click", (e) => {
            if (e.target.closest(".tree-btn")) return;
            // ha más projekt, először váltunk projektet, aztán erre a felületre
            if (!isActive) { switchProject(p.id); switchSurface(i); }
            else switchSurface(i);
          });
          const se = treeBtn("✎", "", "Felület átnevezése");
          se.addEventListener("click", (e) => { e.stopPropagation(); if (!isActive) switchProject(p.id); renameSurfaceFn(i); });
          const sd = treeBtn("✕", "del", "Felület törlése");
          sd.disabled = p.surfaces.length <= 1;
          sd.addEventListener("click", (e) => { e.stopPropagation(); if (!isActive) switchProject(p.id); deleteSurfaceFn(i); });
          srow.append(se, sd);
          root.appendChild(srow);
        });
        if (isActive) {
          const add = document.createElement("div");
          add.className = "tree-add"; add.textContent = "+ Felület";
          add.addEventListener("click", addSurface);
          root.appendChild(add);
        }
      }
    });
  }

  // ---- Projekt-műveletek -----------------------------------------------
  function switchProject(id) {
    if (id === store.activeProjectId) { expandedProjects.add(id); renderProjectTree(); return; }
    saveActiveSurface();
    store.activeProjectId = id;
    expandedProjects.add(id); // az új aktív projekt automatikusan kinyitva
    project = activeProject();
    loadActiveSurface();
    refreshAll();
  }

  function addProjectFn() {
    saveActiveSurface();
    const name = prompt("Új projekt neve:", "Projekt " + (store.projects.length + 1));
    if (name === null) return;
    const p = defaultProject(name.trim() || "Projekt");
    store.projects.push(p);
    store.activeProjectId = p.id;
    project = p;
    loadActiveSurface();
    refreshAll();
  }

  function renameProjectFn(id) {
    const p = store.projects.find((x) => x.id === id);
    if (!p) return;
    const name = prompt("Projekt neve:", p.name);
    if (name === null) return;
    p.name = name.trim() || p.name;
    renderProjectTree();
    if (p === project && el.projName) el.projName.value = project.name;
    updateCanvasTitle();
    save();
  }

  function deleteProjectFn(id) {
    if (store.projects.length <= 1) { alert("Legalább egy projektnek maradnia kell."); return; }
    const p = store.projects.find((x) => x.id === id);
    if (!p) return;
    if (!confirm("Töröljük a(z) „" + p.name + "” projektet (minden felületével)?")) return;
    const wasActive = id === store.activeProjectId;
    store.projects = store.projects.filter((x) => x.id !== id);
    if (wasActive) {
      store.activeProjectId = store.projects[0].id;
      project = activeProject();
      loadActiveSurface();
    }
    refreshAll();
  }

  // ---- Felület-műveletek (az aktív projektben) -------------------------
  function afterSurfaceSwitch() { refreshAll(); }

  function switchSurface(index) {
    saveActiveSurface();
    project.activeIndex = Math.max(0, Math.min(index, project.surfaces.length - 1));
    loadActiveSurface();
    refreshAll();
  }

  function blankSurface(name, mode) {
    const baseId = project.tileTypes[0] ? project.tileTypes[0].id : "t1";
    return normSurface({ name, mode, baseId, layout: { paintTypeId: baseId } }, baseId);
  }

  function addSurface() {
    saveActiveSurface();
    const n = project.surfaces.filter((s) => s.mode === "wall").length + 1;
    const name = prompt("Új felület neve:", "Fal " + n);
    if (name === null) return;
    project.surfaces.push(blankSurface(name.trim() || "Felület", "wall"));
    project.activeIndex = project.surfaces.length - 1;
    loadActiveSurface();
    refreshAll();
  }

  function renameSurfaceFn(index) {
    const i = (typeof index === "number") ? index : project.activeIndex;
    const s = project.surfaces[i];
    if (!s) return;
    const name = prompt("Felület neve:", s.name);
    if (name === null) return;
    s.name = name.trim() || s.name;
    renderProjectTree();
    updateCanvasTitle();
    save();
  }

  function deleteSurfaceFn(index) {
    if (project.surfaces.length <= 1) { alert("Legalább egy felületnek maradnia kell."); return; }
    const i = (typeof index === "number") ? index : project.activeIndex;
    const s = project.surfaces[i];
    if (!s) return;
    if (!confirm("Töröljük a(z) „" + s.name + "” felületet?")) return;
    const wasActive = i === project.activeIndex;
    project.surfaces.splice(i, 1);
    if (wasActive) {
      project.activeIndex = Math.max(0, Math.min(i, project.surfaces.length - 1));
      loadActiveSurface();
    } else if (i < project.activeIndex) {
      project.activeIndex -= 1;
    }
    refreshAll();
  }

  // ---- Falak generálása a padlóból + szinkron-figyelmeztetés ------------
  function floorEdgeLengths(s) {
    const p = s.points, n = p.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push(Math.hypot(b.x - a.x, b.y - a.y));
    }
    return out;
  }
  function floorSignature(s) { return floorEdgeLengths(s).map((l) => Math.round(l)).join(","); }

  function generateWalls(floor, hMm) {
    if (!(hMm > 0)) return;
    saveActiveSurface();
    // a korábbi, ebből a padlóból generált falak törlése
    project.surfaces = project.surfaces.filter((s) => s.fromFloorId !== floor.id);
    const edges = floorEdgeLengths(floor);
    const names = floor.edgeNames || [];
    edges.forEach((len, idx) => {
      const wname = (names[idx] && names[idx].trim()) ? names[idx].trim() : "Fal " + (idx + 1);
      const w = blankSurface(wname, "wall");
      w.points = [{ x: 0, y: 0 }, { x: len, y: 0 }, { x: len, y: hMm }, { x: 0, y: hMm }];
      w.closed = true;
      w.fromFloorId = floor.id;
      w.fromEdgeIndex = idx;
      project.surfaces.push(w);
    });
    floor.wallsSignature = floorSignature(floor);
    floor.wallHeightMm = hMm;
    floor.warnDismissedSignature = null;
    project.activeIndex = project.surfaces.findIndex((s) => s.fromFloorId === floor.id);
    if (project.activeIndex < 0) project.activeIndex = project.surfaces.indexOf(floor);
    loadActiveSurface();
    afterSurfaceSwitch();
    alert(edges.length + " fal létrehozva a(z) „" + floor.name + "” padlóból.");
  }

  function generateWallsFromActive() {
    saveActiveSurface();
    const floor = project.surfaces[project.activeIndex];
    if (floor.mode !== "floor") { alert("Az aktív felület nem padló. Válts a padlóra (vagy állítsd a típusát Padlóra az Alaprajz fülön)."); return; }
    if (!floor.closed || floor.points.length < 3) { alert("Előbb rajzolj egy zárt padló-alaprajzot."); return; }
    // élnevek kötelezősége
    const n = floor.points.length; // zárt padlónál n él
    const names = floor.edgeNames || [];
    const missing = [];
    for (let i = 0; i < n; i++) if (!(names[i] && names[i].trim())) missing.push(i + 1);
    if (missing.length) {
      alert("A falgeneráláshoz minden padló-élnek nevet kell adni.\nHiányzó él(ek): " + missing.join(", ") + ".\nAdd meg a neveket az Alaprajz fül „Élek” listájában.");
      return;
    }
    const hMm = toMm(parseFloat(el.wallHeight.value));
    if (!(hMm > 0)) { alert("Adj meg érvényes falmagasságot."); return; }
    generateWalls(floor, hMm);
  }

  let staleFloorRef = null;
  function checkWallSync() {
    let stale = null;
    for (const f of project.surfaces) {
      if (f.mode === "floor" && f.wallsSignature) {
        const hasWalls = project.surfaces.some((w) => w.fromFloorId === f.id);
        if (!hasWalls) continue;
        const sig = floorSignature(f);
        if (sig !== f.wallsSignature && sig !== f.warnDismissedSignature) { stale = f; break; }
      }
    }
    staleFloorRef = stale;
    if (!stale) { el.wallWarn.hidden = true; return; }
    el.wallWarnText.textContent =
      "Figyelem: a(z) „" + stale.name + "” padló megváltozott a falak generálása óta — a belőle készült falak NEM frissültek automatikusan (pillanatkép). Teendő: generáld újra a falakat (a régiek lecserélődnek), vagy szerkeszd kézzel az érintett falakat.";
    el.wallWarn.hidden = false;
  }

  // =======================================================================
  //  6. FÁZIS – Export / mentés (PNG, PDF/nyomtatás, JSON)
  // =======================================================================
  function triggerDownload(filename, url) {
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => a.remove(), 0);
  }

  function planBounds() {
    const p = state.points;
    if (p.length < 2) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    p.forEach((pt) => {
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    });
    return { minX, minY, maxX, maxY };
  }

  // A teljes terv kirajzolása egy offscreen vászonra, PNG dataURL-ként
  function buildPlanImage(maxPx) {
    const b = planBounds();
    if (!b) return null;
    const wmm = Math.max(b.maxX - b.minX, 1), hmm = Math.max(b.maxY - b.minY, 1);
    const padPx = 48;
    const scale = (maxPx - 2 * padPx) / Math.max(wmm, hmm);
    const outW = Math.round(wmm * scale) + 2 * padPx;
    const outH = Math.round(hmm * scale) + 2 * padPx;
    const off = document.createElement("canvas");
    off.width = outW; off.height = outH;

    const savedCtx = ctx, savedView = state.view;
    ctx = off.getContext("2d");
    state.view = { scale, ox: padPx - b.minX * scale, oy: padPx - b.minY * scale };
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    if (shouldDrawLayout()) drawLayout();
    drawCutouts();
    drawPolygon({ hideVertices: true });
    const url = off.toDataURL("image/png");

    ctx = savedCtx; state.view = savedView;
    render(); // a képernyő helyreállítása
    return url;
  }

  function exportPNG() {
    const url = buildPlanImage(2000);
    if (!url) { alert("Előbb rajzolj egy (zárt) alaprajzot."); return; }
    triggerDownload("lapkiosztas.png", url);
  }

  function materialNumbers() {
    if (!lastStats) return null;
    const s = lastStats;
    const usedArea = s.tilesNeeded * s.tileAreaMm2;
    const wastePct = usedArea > 0 ? (1 - s.areaMm2 / usedArea) * 100 : 0;
    const pct = Math.max(0, state.layout.overagePct || 0);
    const finalTiles = Math.ceil(s.tilesNeeded * (1 + pct / 100));
    let groutKg = null;
    if (s.groutAreaMm2 != null) {
      const base = baseTile();
      const thick = base ? (base.thicknessMm || 8) : 8;
      groutKg = computeGroutMass(s.groutAreaMm2, thick, pct).finalKg;
    }
    return { whole: s.whole, cut: s.cut, tilesNeeded: s.tilesNeeded, wastePct, pct, finalTiles, groutKg };
  }

  function groupedCutList() {
    const map = new Map();
    lastCutPieces.forEach((c) => {
      const k = fmtDim(c.w, c.h);
      map.set(k, (map.get(k) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // Egész projekt nyomtatása: összesítő + felületenkénti szakaszok
  function printPlan() {
    if (!project.surfaces.some((s) => s.points.length >= 2)) {
      alert("Előbb rajzolj legalább egy felületet.");
      return;
    }
    saveActiveSurface();
    const savedIndex = project.activeIndex;
    const sections = [];
    const agg = {};
    let totalAreaMm2 = 0;

    for (let i = 0; i < project.surfaces.length; i++) {
      project.activeIndex = i;
      loadActiveSurface();
      const s = project.surfaces[i];
      let img = null, m = null, cuts = [];
      if (s.points.length >= 2) {
        img = buildPlanImage(1000); // render → drawLayout → lastStats beáll
        m = materialNumbers();
        cuts = groupedCutList();
      }
      sections.push({ name: s.name, mode: s.mode, img, m, cuts });
      if (m && lastStats) {
        totalAreaMm2 += lastStats.areaMm2;
        const t = project.tileTypes.find((x) => x.id === s.baseId);
        if (!agg[s.baseId]) agg[s.baseId] = { name: t ? t.name : "?", tiles: 0, finalTiles: 0 };
        agg[s.baseId].tiles += m.tilesNeeded;
        agg[s.baseId].finalTiles += m.finalTiles;
      }
    }

    project.activeIndex = savedIndex;
    loadActiveSurface();
    render();
    populateProjectPrint(sections, agg, totalAreaMm2);
    setTimeout(() => window.print(), 200);
  }

  function populateProjectPrint(sections, agg, totalAreaMm2) {
    el.printImg.style.display = "none";
    const unit = state.unit;
    const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
    let html = "<h2>Összesítő</h2><table>";
    html += row("Projekt", escapeHtml(project.name));
    html += row("Felületek", project.surfaces.length + " db");
    html += row("Összes burkolt terület", (totalAreaMm2 / 1e6).toFixed(2) + " m²");
    html += "</table>";

    const keys = Object.keys(agg);
    if (keys.length) {
      html += "<h2>Lapszükséglet típusonként (egész projekt)</h2>";
      html += "<table><tr><th>Laptípus</th><th>Szükséges</th><th>Tartalékkal</th></tr>";
      keys.forEach((k) => {
        const a = agg[k];
        html += `<tr><td>${escapeHtml(a.name)}</td><td>${a.tiles} db</td><td>${a.finalTiles} db</td></tr>`;
      });
      html += "</table>";
    }

    // Anyagszükséglet: ragasztó + fuga (összes) + szilikon (sarok-hosszak, kartusok)
    const mat = project.material || defaultMaterial();
    const overage = Math.max(0, state.layout && state.layout.overagePct || 0);
    const groutKg = computeProjectGroutMass(project) * (1 + overage / 100);
    const sil = computeSiliconeForProject(project);
    const totLen = sil.horizMm + sil.vertMm;
    // Ragasztó: totalAreaMm2 (a felület-cache-ek összege)
    const totalAreaForGlue = project.surfaces.reduce((acc, s) => acc + (s.lastAreaMm2 || 0), 0);
    const glueWaste = Math.max(0, mat.glueWastePct || 0);
    const glueKgPerM2 = GLUE_KG_PER_M2[mat.gluePreset] || 5;
    const glueKg = (totalAreaForGlue / 1e6) * glueKgPerM2 * (1 + glueWaste / 100);
    if (groutKg > 0 || totLen > 0 || glueKg > 0) {
      html += "<h2>Anyagszükséglet</h2><table>";
      if (glueKg > 0) {
        const glueLbl = GLUE_LABELS[mat.gluePreset] || "Ragasztó";
        html += row("Ragasztó (" + escapeHtml(glueLbl) + ")", glueKg.toFixed(2) + " kg (+" + glueWaste + "% tartalék)");
        const gluePacks = Math.ceil(glueKg / GLUE_PACK_KG);
        html += row("Ragasztó csomag szükséglet", gluePacks + " db zsák (" + GLUE_PACK_KG + " kg)");
      }
      if (groutKg > 0) {
        const lbl = GROUT_LABELS[mat.groutPreset] || "Fuga";
        html += row("Fuga (" + escapeHtml(lbl) + ")", groutKg.toFixed(2) + " kg (+" + overage + "% tartalék)");
        const packKg = GROUT_PACK_KG[mat.groutPreset] || 5;
        const packName = GROUT_PACK_NAME[mat.groutPreset] || "csomag";
        if (packKg > 0) {
          const packs = Math.ceil(groutKg / packKg);
          html += row("Fuga csomag szükséglet", packs + " db " + escapeHtml(packName) + " (" + packKg + " kg)");
        }
      }
      if (totLen > 0) {
        const t = computeSiliconeTubes(totLen, mat);
        const fmtLen = (mm) => (mm / 1000).toFixed(2) + " m";
        if (sil.horizN) html += row("Szilikon — padló-fal sarok", fmtLen(sil.horizMm) + " (" + sil.horizN + " fal)");
        if (sil.vertN) html += row("Szilikon — fal-fal sarok", fmtLen(sil.vertMm) + " (" + sil.vertN + " sarok)");
        html += row("Szilikon összesen", fmtLen(totLen) + " · " + mat.silWidthMm + "×" + mat.silDepthMm + " mm hézag");
        html += row("Kartus szükséglet", t.tubes + " db (" + mat.silTubeMl + " ml, +" + mat.silWastePct + "% tartalék)");
      }
      if (sil.edgingN > 0) {
        const fmtLen = (mm) => (mm / 1000).toFixed(2) + " m";
        html += row("Élvédő profil", fmtLen(sil.edgingMm) + " (" + sil.edgingN + " él)");
      }
      html += "</table>";
    }

    sections.forEach((sec) => {
      html += `<h2>${escapeHtml(sec.name)} (${sec.mode === "floor" ? "padló" : "fal"})</h2>`;
      if (sec.img) html += `<img src="${sec.img}" style="max-width:100%;border:1px solid #999" />`;
      html += '<div class="pa-grid"><div class="pa-col"><table>';
      if (sec.m) {
        html += row("Egész lap", sec.m.whole + " db");
        html += row("Vágott hely", sec.m.cut + " db");
        html += row("Szükséges lap (újrahaszn.)", sec.m.tilesNeeded + " db");
        html += row("Hulladék", sec.m.wastePct.toFixed(0) + " %");
        html += row("Lap tartalékkal (+" + sec.m.pct + "%)", sec.m.finalTiles + " db");
        if (sec.m.groutKg != null) {
          html += row("Fuga", sec.m.groutKg.toFixed(2) + " kg");
        }
      } else {
        html += row("Kiosztás", "nincs");
      }
      html += '</table></div><div class="pa-col"><strong>Vágási lista (' + unit + ")</strong>";
      if (sec.cuts && sec.cuts.length) {
        html += "<table><tr><th>Méret</th><th>Darab</th></tr>";
        sec.cuts.forEach(([k, n]) => { html += `<tr><td>${k}</td><td>${n} db</td></tr>`; });
        html += "</table>";
      } else {
        html += "<p>—</p>";
      }
      html += "</div></div>";
    });
    el.printInfo.innerHTML = html;
  }

  const safeFile = (s) => (s || "terv").replace(/[^\w\-]+/g, "_");

  function saveProjectJSON() {
    const blob = new Blob([JSON.stringify(serializeProject(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    triggerDownload(safeFile(project.name) + ".json", url);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function saveStoreJSON() {
    const blob = new Blob([JSON.stringify(serializeStore(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    triggerDownload("osszes-projekt.json", url);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function loadJSONFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (d && Array.isArray(d.projects)) {
          // teljes tár visszaállítása
          if (!confirm("Teljes tár betöltése: ez lecseréli a jelenlegi projektjeidet. Folytatod?")) return;
          store = normalizeStore(d);
          project = activeProject();
          loadActiveSurface();
          refreshAll();
        } else if (d && Array.isArray(d.surfaces)) {
          // egyetlen projekt hozzáadása új projektként
          const p = normalizeProject(d);
          p.id = newProjectId(); // ütközés elkerülése
          store.projects.push(p);
          store.activeProjectId = p.id;
          project = p;
          loadActiveSurface();
          refreshAll();
        } else {
          alert("Ismeretlen fájlformátum.");
        }
      } catch (e) {
        alert("Hibás vagy sérült fájl.");
      }
    };
    r.readAsText(file);
  }

  function initMaterialUI() {
    if (!el.groutPreset) return;
    const m = () => (project.material = project.material || defaultMaterial());
    el.groutPreset.addEventListener("change", () => {
      m().groutPreset = el.groutPreset.value in GROUT_DENSITIES ? el.groutPreset.value : "cg1";
      // a friss aktív felület mutatóit is újra kell festeni; render() újrarajzolja a layoutot
      render(); save();
    });
    const numHandler = (input, key, min) => () => {
      const v = parseFloat(input.value);
      if (v >= (min || 0)) { m()[key] = v; updateProjectMaterialReport(); save(); }
    };
    el.silWidth.addEventListener("change", numHandler(el.silWidth, "silWidthMm", 0.1));
    el.silDepth.addEventListener("change", numHandler(el.silDepth, "silDepthMm", 0.1));
    el.silTube.addEventListener("change", numHandler(el.silTube, "silTubeMl", 50));
    el.silWaste.addEventListener("change", numHandler(el.silWaste, "silWastePct", 0));
    if (el.gluePreset) {
      el.gluePreset.addEventListener("change", () => {
        m().gluePreset = el.gluePreset.value in GLUE_KG_PER_M2 ? el.gluePreset.value : "c2s1";
        updateProjectMaterialReport(); save();
      });
    }
    if (el.glueWaste) el.glueWaste.addEventListener("change", numHandler(el.glueWaste, "glueWastePct", 0));
  }

  function syncMaterialUI() {
    if (!el.groutPreset || !project) return;
    const m = project.material || defaultMaterial();
    el.groutPreset.value = m.groutPreset || "cg1";
    el.silWidth.value = m.silWidthMm;
    el.silDepth.value = m.silDepthMm;
    el.silTube.value = m.silTubeMl;
    el.silWaste.value = m.silWastePct;
    if (el.gluePreset) el.gluePreset.value = m.gluePreset || "c2s1";
    if (el.glueWaste) el.glueWaste.value = m.glueWastePct;
  }

  // ---- Csatolt JSON-fájl (File System Access API) ---------------------
  // A felhasználó kiválaszt egy JSON-fájlt (pl. OneDrive-ban), a böngésző
  // megőriz egy "handle"-t, és a Mentés gomb közvetlenül felülírja a fájlt.
  // A handle az IDB-ben perzisztálódik, így reload után is megmarad
  // (engedélyt egyszer újra kérünk).
  let linkedHandle = null;
  const fsaSupported = typeof window !== "undefined"
    && typeof window.showOpenFilePicker === "function"
    && window.isSecureContext;

  function updateLinkedUI() {
    if (!el.saveLinkedBtn) return;
    if (linkedHandle) {
      el.saveLinkedBtn.disabled = false;
      el.saveLinkedBtn.title = "Mentés a csatolt fájlba: " + (linkedHandle.name || "?") + " (Ctrl+S)";
      if (el.linkedFileName) el.linkedFileName.textContent = linkedHandle.name || "(ismeretlen)";
      if (el.unlinkJsonBtn) el.unlinkJsonBtn.hidden = false;
    } else {
      el.saveLinkedBtn.disabled = true;
      el.saveLinkedBtn.title = "Mentés a csatolt JSON-fájlba (előbb csatolj egyet az Export fülön)";
      if (el.linkedFileName) el.linkedFileName.textContent = "—";
      if (el.unlinkJsonBtn) el.unlinkJsonBtn.hidden = true;
    }
  }

  async function ensureRWPermission(handle) {
    if (!handle || !handle.queryPermission) return false;
    const opts = { mode: "readwrite" };
    const cur = await handle.queryPermission(opts);
    if (cur === "granted") return true;
    const req = await handle.requestPermission(opts);
    return req === "granted";
  }

  async function linkJsonFile() {
    if (!fsaSupported) {
      alert("Ez a böngésző nem támogatja a File System Access API-t. Használj Chrome-ot vagy Edge-et.");
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "Projekt-tár (JSON)", accept: { "application/json": [".json"] } }],
        multiple: false,
      });
      // először töltsük be a fájl tartalmát az appba (mintha a "Betöltés" gombbal csinálnánk)
      const file = await handle.getFile();
      const text = await file.text();
      try {
        const d = JSON.parse(text);
        if (d && Array.isArray(d.projects)) {
          if (!confirm("Csatoláskor a fájl tartalmával felülírjuk a jelenlegi tárat. Folytatod?")) return;
          store = normalizeStore(d);
          project = activeProject();
          loadActiveSurface();
          refreshAll();
        } else if (d && Array.isArray(d.surfaces)) {
          const p = normalizeProject(d);
          p.id = newProjectId();
          store.projects.push(p);
          store.activeProjectId = p.id;
          project = p;
          loadActiveSurface();
          refreshAll();
        } else {
          alert("Ismeretlen fájlformátum.");
          return;
        }
      } catch (e) {
        alert("Hibás vagy sérült fájl: " + e.message);
        return;
      }
      // csak sikeres betöltés után kapcsoljuk a handle-t
      linkedHandle = handle;
      await idbSet("linkedHandle", handle);
      updateLinkedUI();
    } catch (e) {
      if (e && e.name === "AbortError") return; // user mégse
      alert("Csatolás nem sikerült: " + (e && e.message || e));
    }
  }

  async function saveToLinkedFile() {
    if (!linkedHandle) {
      alert('Nincs csatolt fájl. Az Export fülön a „Tár megnyitása írhatóan…” gombbal csatolhatsz egyet.');
      return;
    }
    const ok = await ensureRWPermission(linkedHandle);
    if (!ok) { alert("A fájl írásához engedély kell."); return; }
    try {
      const snap = JSON.stringify(serializeStore(), null, 2);
      const w = await linkedHandle.createWritable();
      await w.write(snap);
      await w.close();
      // vizuális visszajelzés a gombon
      if (el.saveLinkedBtn) {
        el.saveLinkedBtn.textContent = "✓";
        setTimeout(() => { if (el.saveLinkedBtn) el.saveLinkedBtn.textContent = "💾"; }, 800);
      }
    } catch (e) {
      alert("Mentés nem sikerült: " + (e && e.message || e));
    }
  }

  async function unlinkJsonFile() {
    linkedHandle = null;
    try { await idbSet("linkedHandle", null); } catch (_) {}
    updateLinkedUI();
  }

  // Reload után: visszatöltjük a handle-t IDB-ből.
  async function restoreLinkedHandle() {
    if (!fsaSupported) return;
    try {
      const h = await idbGet("linkedHandle");
      if (h && typeof h.queryPermission === "function") {
        linkedHandle = h;
        updateLinkedUI();
      }
    } catch (_) {}
  }

  function initExportUI() {
    el.exportPng.addEventListener("click", exportPNG);
    el.exportPdf.addEventListener("click", printPlan);
    el.saveProjJson.addEventListener("click", saveProjectJSON);
    el.saveStoreJson.addEventListener("click", saveStoreJSON);
    el.loadJsonBtn.addEventListener("click", () => el.loadJsonInput.click());
    el.loadJsonInput.addEventListener("change", () => {
      const f = el.loadJsonInput.files && el.loadJsonInput.files[0];
      if (f) loadJSONFile(f);
      el.loadJsonInput.value = "";
    });
    el.projName.addEventListener("change", () => {
      project.name = el.projName.value.trim() || "Projekt";
      renderProjectTree();
      updateCanvasTitle();
      save();
    });
    // Csatolt fájl
    if (!fsaSupported) {
      if (el.fsaUnsupported) el.fsaUnsupported.hidden = false;
      if (el.linkJsonBtn) el.linkJsonBtn.disabled = true;
    }
    if (el.linkJsonBtn) el.linkJsonBtn.addEventListener("click", linkJsonFile);
    if (el.unlinkJsonBtn) el.unlinkJsonBtn.addEventListener("click", unlinkJsonFile);
    if (el.saveLinkedBtn) el.saveLinkedBtn.addEventListener("click", saveToLinkedFile);
    updateLinkedUI();
  }

  function initProjectUI() {
    el.addProject.addEventListener("click", addProjectFn);
    el.histUndo.addEventListener("click", undo);
    el.histRedo.addEventListener("click", redo);
    el.genWalls.addEventListener("click", generateWallsFromActive);
    el.wallWarnRegen.addEventListener("click", () => {
      if (staleFloorRef) generateWalls(staleFloorRef, staleFloorRef.wallHeightMm || toMm(parseFloat(el.wallHeight.value)) || 2700);
    });
    el.wallWarnHide.addEventListener("click", () => {
      if (staleFloorRef) {
        staleFloorRef.warnDismissedSignature = floorSignature(staleFloorRef);
        el.wallWarn.hidden = true;
        save();
      }
    });
  }

  function syncControlsFromState() {
    [...el.modeSeg.children].forEach((c) => c.classList.toggle("active", c.dataset.mode === state.mode));
    [...el.unitSeg.children].forEach((c) => c.classList.toggle("active", c.dataset.unit === state.unit));
    el.snap.checked = state.snap;
    el.gridSize.disabled = !state.snap;
    el.ortho.checked = state.ortho;
    el.gridUnit.textContent = state.unit;
    document.querySelectorAll(".rect-unit").forEach((s) => (s.textContent = state.unit));
    el.gridSize.value = fromMm(state.gridMm).toFixed(state.unit === "cm" ? 1 : 0);
    el.groutW.value = state.tiles.groutMm;
    el.groutColor.value = state.tiles.groutColor;
    el.patternSel.value = state.layout.pattern || "straight";
    el.offsetPct.value = Math.round(state.layout.offsetPct);
    applyPatternUIState();
    el.layoutShow.checked = state.layout.show;
    el.tileRotate.checked = state.layout.rotated;
    // Padló-rácshoz illesztés: csak generált falon látszik
    if (el.linkToFloorRow && el.linkToFloor && project) {
      const s = project.surfaces[project.activeIndex];
      const showLink = !!(s && s.mode === "wall" && s.fromFloorId && typeof s.fromEdgeIndex === "number");
      el.linkToFloorRow.hidden = !showLink;
      if (el.linkToFloorHint) el.linkToFloorHint.hidden = !showLink;
      el.linkToFloor.checked = !!state.layout.linkToFloor;
    }
    document.querySelectorAll(".off-unit").forEach((s) => (s.textContent = state.unit));
    el.offX.value = fromMm(state.layout.offXmm).toFixed(state.unit === "cm" ? 1 : 0);
    el.offY.value = fromMm(state.layout.offYmm).toFixed(state.unit === "cm" ? 1 : 0);
    el.thr.value = fromMm(state.layout.thresholdMm).toFixed(state.unit === "cm" ? 1 : 0);
    el.overage.value = state.layout.overagePct;
    applyAlignUIState();
    // festés: alapból kikapcsolva; ha nincs kijelölt festő-típus, az alap legyen
    paintMode = false;
    el.paintMode.checked = false;
    if (state.layout.paintTypeId == null) state.layout.paintTypeId = state.tiles.baseId;
    renderPaintPalette();
    // kivágás vezérlők
    cutoutMode = false;
    selectedCutout = -1;
    pendingCutout = null;
    el.cutoutDraw.classList.remove("active-mode");
    el.cutoutDraw.textContent = "+ Kivágás rajzolása";
    el.untiledColor.value = (project && project.untiledColor) || "#8a8f98";
    [...el.cutoutKindSeg.children].forEach((c) => c.classList.toggle("active", c.dataset.kind === newCutoutKind));
    renderCutoutList();
    syncMaterialUI();
    updateProjectMaterialReport();
  }

  // ---- Indítás -----------------------------------------------------------
  async function init() {
    await loadStoreAsync();
    project = activeProject();
    expandedProjects.add(store.activeProjectId); // induláskor az aktív projekt kinyitva
    loadActiveSurface();
    el.projName.value = project.name;
    syncControlsFromState();
    initTilesUI();
    initLayoutUI();
    initMaterialUI();
    initExportUI();
    initProjectUI();
    initCutoutUI();
    renderProjectTree();
    renderTileLibrary();
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
    renderEdgeList();
    updateSummary();
    checkWallSync();
    updateCanvasTitle();
    fitView();
    pushHistory(); // kezdő állapot az előzménytárban
    restoreLinkedHandle(); // ha van csatolt JSON-fájl IDB-ben, visszatöltjük a handle-t
  }

  init();
})();
