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
    delSel: document.getElementById("delSelBtn"),
    undo: document.getElementById("undoBtn"),
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
    // 6. fázis
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
    genLayoutBtn: document.getElementById("genLayoutBtn"),
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
    drawPolygon();
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
        // él-snap: a kivágás bármely éle a felület határához ragad, ha közel van
        const b = planBounds();
        if (b) {
          const thr = 14 / state.view.scale;
          if (Math.abs(nx - b.minX) < thr) nx = b.minX;
          else if (Math.abs((nx + c.w) - b.maxX) < thr) nx = b.maxX - c.w;
          if (Math.abs(ny - b.minY) < thr) ny = b.minY;
          else if (Math.abs((ny + c.h) - b.maxY) < thr) ny = b.maxY - c.h;
        }
        c.x = nx; c.y = ny;
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
      if (wasDrag.moved) afterGeometryChange(); // áthelyezés után újragenerálás + előzmény
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

  function updateDeleteBtn() {
    el.delSel.disabled = state.selected === null;
  }

  // Csak a kijelölés változott (geometria nem): elég a vászon + gomb frissítése
  function afterSelectionChange() {
    render();
    updateDeleteBtn();
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

  el.delSel.addEventListener("click", () => {
    if (state.selected !== null) deleteVertex(state.selected);
  });

  el.undo.addEventListener("click", () => {
    if (state.closed) { state.closed = false; }
    else if (state.points.length > 0) { state.points.pop(); }
    state.selected = null;
    afterGeometryChange();
  });

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
        type.imageUrl = r.result;
        type.fillKind = "image";
        kind.value = "image";
        updateFillVisibility();
        applyFill(sw, type);
        tilesSave();
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

    fields.append(dim, fill, imgRow);
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

  function updateMaterialReport(data) {
    if (!el.matArea) return;
    if (!data) {
      el.matArea.textContent = "–";
      el.matTiles.textContent = "–";
      el.matWaste.textContent = "–";
      el.matFinal.textContent = "–";
      return;
    }
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
      ctx.setLineDash(selected ? [] : [6, 4]);
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.fillStyle = hexAlpha(col, selected ? 0.32 : 0.22);
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeStyle = selected ? "#ffcc4c" : col;
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
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

  // Melyik kivágás téglalapjába esik egy képernyő-pont (felülről lefelé)
  function cutoutAt(sx, sy) {
    const cuts = state.cutouts || [];
    for (let i = cuts.length - 1; i >= 0; i--) {
      const c = cuts[i];
      const a = worldToScreen({ x: c.x, y: c.y });
      const b = worldToScreen({ x: c.x + c.w, y: c.y + c.h });
      if (sx >= a.x && sx <= b.x && sy >= a.y && sy <= b.y) return i;
    }
    return -1;
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

  // Melyik rács-cellára esik egy világkoordináta (festéshez); null ha fuga/kívül
  function tileIndexAt(wx, wy, g) {
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
    const cutLabels = []; // { x, y, w, h } – világkoordinátában, a vágott darabokhoz
    const types = state.tiles.types;
    const overrides = state.layout.overrides;

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

        total++;
        const isWhole = subs.length === 1 && subs[0].w >= tileW - 0.5 && subs[0].h >= tileH - 0.5;
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
          }
        }

        const s0 = worldToScreen({ x: x0, y: y0 });
        const sw = tileW * scale, sh = tileH * scale;
        // egyedi felülírás: a cellához rendelt típus megjelenése, ha van
        const ovId = overrides[i + "_" + j];
        const type = ovId ? (types.find((t) => t.id === ovId) || base) : base;
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
    updateMaterialReport({ areaMm2, tilesNeeded, tileAreaMm2: tileW * tileH });

    // statisztikák megőrzése export/nyomtatáshoz
    lastStats = { whole, cut, tilesNeeded, areaMm2, tileAreaMm2: tileW * tileH };
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
      const del = document.createElement("button");
      del.className = "del"; del.textContent = "✕"; del.title = "Kivágás törlése";
      del.addEventListener("click", () => { state.cutouts.splice(idx, 1); afterGeometryChange(); });
      head.append(sw, kindSel, del);

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
      pattern: ["straight", "offset", "diagonal"].includes(d.pattern) ? d.pattern : "straight",
      offsetPct: typeof d.offsetPct === "number" ? Math.max(0, Math.min(100, d.offsetPct)) : 50,
      show: d.show !== false,
      offXmm: typeof d.offXmm === "number" ? d.offXmm : 0,
      offYmm: typeof d.offYmm === "number" ? d.offYmm : 0,
      rotated: !!d.rotated,
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
          }))
        : [],
      edgeNames: Array.isArray(d.edgeNames) ? d.edgeNames.slice() : [],
      layout: normLayout(d.layout),
      fromFloorId: d.fromFloorId || null,
      wallsSignature: d.wallsSignature || null,
      wallHeightMm: typeof d.wallHeightMm === "number" ? d.wallHeightMm : null,
      warnDismissedSignature: d.warnDismissedSignature || null,
    };
  }

  function defaultProject(name) {
    const dt = defaultTiles();
    const types = dt.types.map((t) => ({ ...t })); // friss példány (projektenként külön könyvtár)
    return {
      id: newProjectId(), name: name || "Projekt", unit: "cm", tileTypes: types, activeIndex: 0, untiledColor: "#8a8f98",
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
    let surfaces = (Array.isArray(p.surfaces) && p.surfaces.length)
      ? p.surfaces.map((s) => normSurface(s, types[0].id))
      : [normSurface({ name: "Padló", mode: "floor", baseId: types[0].id }, types[0].id)];
    surfaces.forEach((s) => { if (!types.some((t) => t.id === s.baseId)) s.baseId = types[0].id; });
    let ai = Math.max(0, Math.min(typeof p.activeIndex === "number" ? p.activeIndex : 0, surfaces.length - 1));
    return { id: p.id || newProjectId(), name: p.name || "Projekt", unit: p.unit === "mm" ? "mm" : "cm", untiledColor: p.untiledColor || "#8a8f98", tileTypes: types, surfaces, activeIndex: ai };
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
    state.layout = s.layout;
  }

  // ---- Tár (több projekt) ----------------------------------------------
  let store = null;
  const STORE_KEY = "tile-planner-store";

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

  function save() {
    const snap = JSON.stringify(serializeStore());
    try { localStorage.setItem(STORE_KEY, snap); } catch (_) {}
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

  function loadStore() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) { store = normalizeStore(JSON.parse(raw)); return; } } catch (_) {}
    // migráció: egyetlen korábbi projekt / régi terv -> tár
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
    checkWallSync();
    fitView();
    save();
  }

  // ---- Fa-lista (projektek + felületek) --------------------------------
  function treeRow(cls) { const d = document.createElement("div"); d.className = "tree-row " + cls; return d; }
  function treeBtn(label, cls, title) {
    const b = document.createElement("button");
    b.className = "tree-btn " + (cls || "");
    b.textContent = label; b.title = title || "";
    return b;
  }

  function renderProjectTree() {
    const root = el.projTree;
    root.innerHTML = "";
    store.projects.forEach((p) => {
      const isActive = p.id === store.activeProjectId;
      const prow = treeRow("tree-proj" + (isActive ? " active" : ""));
      const caret = document.createElement("span");
      caret.className = "caret"; caret.textContent = isActive ? "▾" : "▸";
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

      if (isActive) {
        p.surfaces.forEach((s, i) => {
          const srow = treeRow("tree-surf" + (i === p.activeIndex ? " active" : ""));
          const ic = document.createElement("span");
          ic.className = "micon"; ic.textContent = s.mode === "floor" ? "▭" : "▯";
          const sn = document.createElement("span");
          sn.className = "tree-name"; sn.textContent = s.name;
          srow.append(ic, sn);
          srow.addEventListener("click", (e) => { if (e.target.closest(".tree-btn")) return; switchSurface(i); });
          const se = treeBtn("✎", "", "Felület átnevezése");
          se.addEventListener("click", (e) => { e.stopPropagation(); renameSurfaceFn(i); });
          const sd = treeBtn("✕", "del", "Felület törlése");
          sd.disabled = p.surfaces.length <= 1;
          sd.addEventListener("click", (e) => { e.stopPropagation(); deleteSurfaceFn(i); });
          srow.append(se, sd);
          root.appendChild(srow);
        });
        const add = document.createElement("div");
        add.className = "tree-add"; add.textContent = "+ Felület";
        add.addEventListener("click", addSurface);
        root.appendChild(add);
      }
    });
  }

  // ---- Projekt-műveletek -----------------------------------------------
  function switchProject(id) {
    if (id === store.activeProjectId) { renderProjectTree(); return; }
    saveActiveSurface();
    store.activeProjectId = id;
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
    return { whole: s.whole, cut: s.cut, tilesNeeded: s.tilesNeeded, wastePct, pct, finalTiles };
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
      save();
    });
  }

  function initProjectUI() {
    el.addProject.addEventListener("click", addProjectFn);
    el.histUndo.addEventListener("click", undo);
    el.histRedo.addEventListener("click", redo);
    el.genWalls.addEventListener("click", generateWallsFromActive);
    el.genLayoutBtn.addEventListener("click", () => {
      // a kiosztás (újra)generálása a kivágások/nyílások kihagyásával
      state.layout.show = true;
      if (el.layoutShow) el.layoutShow.checked = true;
      cutoutMode = false; paintMode = false; pendingCutout = null;
      selectedCutout = -1;
      el.paintMode.checked = false;
      el.cutoutDraw.classList.remove("active-mode");
      el.cutoutDraw.textContent = "+ Kivágás rajzolása";
      render();
      save();
    });
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
  }

  // ---- Indítás -----------------------------------------------------------
  function init() {
    loadStore();
    project = activeProject();
    loadActiveSurface();
    el.projName.value = project.name;
    syncControlsFromState();
    initTilesUI();
    initLayoutUI();
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
    fitView();
    pushHistory(); // kezdő állapot az előzménytárban
  }

  init();
})();
