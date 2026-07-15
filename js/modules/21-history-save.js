"use strict";
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
          "Mentsd a projektet fájlba a cím-sori 💾 gomb menüjéből (Összes projekt mentése JSON)."
        ), 0);
      }
    });
  }
  // Az utolsó pending snap-et a tab bezárása előtt is megpróbáljuk lemezre menteni.
  window.addEventListener("beforeunload", () => {
    if (pendingSnap != null) { try { idbSet(STORE_KEY, pendingSnap); } catch (_) {} }
  });

  function save() {
    needRebuild3D = true; // a felület-adatok megváltozhattak, a 3D textúrákat újra kell építeni
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
