"use strict";
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
    // Előtétfal panel csak fal-felületen (zárt fal-mode) látszik
    if (el.preWallPanel && project) {
      const s = project.surfaces[project.activeIndex];
      el.preWallPanel.hidden = !(s && s.mode === "wall" && s.closed);
    }
    // Falak generálása panel: generált gyermek-falon (fromFloorId) nincs
    // értelme, és olyan padlón sem látszik, amiből már vannak generált falak
    // (újrageneráláshoz a figyelmeztető sáv "Falak újragenerálása" gombja való).
    if (el.floorWallsPanel && project) {
      const s = project.surfaces[project.activeIndex];
      const isGenWall = !!(s && s.mode === "wall" && s.fromFloorId);
      const floorHasWalls = !!(s && s.mode === "floor" &&
        project.surfaces.some((w) => w.fromFloorId === s.id));
      el.floorWallsPanel.hidden = isGenWall || floorHasWalls;
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
    renderLayersList();
    syncMaterialUI();
    updateProjectMaterialReport();
  }

