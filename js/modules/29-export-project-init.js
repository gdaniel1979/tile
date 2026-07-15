"use strict";
  function initExportUI() {
    // Mentés / Export lenyíló panel (cím-sori 💾 gomb)
    if (el.exportMenuBtn && el.exportMenu) {
      el.exportMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        el.exportMenu.hidden = !el.exportMenu.hidden;
      });
      document.addEventListener("click", (e) => {
        if (el.exportMenu.hidden) return;
        if (!el.exportMenu.contains(e.target) && e.target !== el.exportMenuBtn) {
          el.exportMenu.hidden = true;
        }
      });
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !el.exportMenu.hidden) el.exportMenu.hidden = true;
      });
    }
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
    if (el.genPreWall) {
      el.genPreWall.addEventListener("click", () => {
        const name = (el.pwName.value || "Előtétfal").trim();
        const x = toMm(parseFloat(el.pwX.value)) || 0;
        const bottom = toMm(parseFloat(el.pwBottom.value)) || 0;
        const w = toMm(parseFloat(el.pwWidth.value));
        const h = toMm(parseFloat(el.pwHeight.value));
        const d = toMm(parseFloat(el.pwDepth.value));
        if (!(w > 0 && h > 0 && d > 0)) { alert("Add meg az előtétfal szélességét, magasságát és mélységét pozitív értékkel."); return; }
        generatePreWallOnActive(name, x, bottom, w, h, d);
      });
    }
    if (el.genStairs) {
      el.genStairs.addEventListener("click", () => {
        const name = (el.stName.value || "Lépcső").trim();
        const steps = parseInt(el.stSteps.value, 10);
        const w = toMm(parseFloat(el.stWidth.value));
        const d = toMm(parseFloat(el.stDepth.value));
        const rise = toMm(parseFloat(el.stRise.value));
        if (!(steps > 0 && w > 0 && d > 0 && rise > 0)) { alert("Add meg a fokszámot és mindhárom lépcső-méretet pozitív értékkel."); return; }
        if (steps > 50) { alert("Maximum 50 fok engedélyezett."); return; }
        generateStairs(name, steps, w, d, rise);
      });
    }
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

