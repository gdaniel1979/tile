"use strict";
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
