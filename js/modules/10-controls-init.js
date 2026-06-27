"use strict";
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

