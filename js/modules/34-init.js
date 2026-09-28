"use strict";
  // ---- Indítás -----------------------------------------------------------
  async function init() {
    await loadStoreAsync();
    project = activeProject();
    expandedProjects.add(store.activeProjectId); // induláskor az aktív projekt kinyitva
    loadActiveSurface();
    initShell(); // menüszalag, panelek, téma, ikonok
    el.projName.value = project.name;
    syncControlsFromState();
    initTilesUI();
    initLayoutUI();
    initMaterialUI();
    initExportUI();
    initProjectUI();
    initCutoutUI();
    init3DUI();
    initSidebarResizer();
    initLayersPanel();
    initQuoteUI();
    renderProjectTree();
    renderTileLibrary();
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
    renderEdgeList();
    updateSummary();
    checkWallSync();
    updateCanvasTitle();
    fitView();
    restoreRibbonTab(); // a legutóbb használt menüszalag-fül
    pushHistory(); // kezdő állapot az előzménytárban
    restoreLinkedHandle(); // ha van csatolt JSON-fájl IDB-ben, visszatöltjük a handle-t
  }

  init();
