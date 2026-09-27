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
  function pushHistory() { pushHistoryWith(historySnapshot()); }

  // ---- Tömör előzmény-snapshot: a képek (data URL-ek) csak egyszer élnek a
  // memóriában, a snapshotokban egy rövid token helyettesíti őket. Így 80
  // előzmény-lépés sem sokszorozza meg a feltöltött lapképeket.
  const IMG_TOKEN_PREFIX = "\u0001img:";
  const imageTokenByUrl = new Map(); // dataURL -> token
  const imageUrlByToken = new Map(); // token -> dataURL
  function compactReplacer(_k, v) {
    if (typeof v === "string" && v.length > 1024 && v.startsWith("data:")) {
      let t = imageTokenByUrl.get(v);
      if (!t) {
        t = IMG_TOKEN_PREFIX + imageTokenByUrl.size;
        imageTokenByUrl.set(v, t);
        imageUrlByToken.set(t, v);
      }
      return t;
    }
    return v;
  }
  function expandReviver(_k, v) {
    if (typeof v === "string" && v.startsWith(IMG_TOKEN_PREFIX)) return imageUrlByToken.get(v) || null;
    return v;
  }
  function historySnapshot() { return JSON.stringify(serializeStore(), compactReplacer); }

  let saveFailed = false;
  let idbReadFailed = false;  // ha induláskor nem tudtuk kiolvasni a tárat, NEM írjuk felül
  let pendingFlush = false;   // van-e még IDB-be ki nem írt változás
  let flushScheduled = false; // throttle: egy timer várja a flush-t
  function flushToIDB() {
    flushScheduled = false;
    if (!pendingFlush || idbReadFailed) return;
    pendingFlush = false;
    // a teljes (képekkel együtti) JSON csak itt, throttle-ölve készül el
    const snap = JSON.stringify(serializeStore());
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
  // A ki nem írt változást azonnal mentjük, ha a lap háttérbe kerül / bezárul
  // (a beforeunload-ban indított aszinkron írást a böngésző nem mindig várja meg,
  // a visibilitychange → hidden viszont korábban és megbízhatóbban fut).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushToIDB();
  });
  window.addEventListener("beforeunload", flushToIDB);

  function save() {
    needRebuild3D = true; // a felület-adatok megváltozhattak, a 3D textúrákat újra kell építeni
    // Húzás közben (csúcs/él/kivágás mozgatása) csak rajzolunk — a mouseup
    // egyetlen save()-vel menti és rögzíti előzménybe a végállapotot.
    if (inDrag) return;
    pendingFlush = true;
    if (!flushScheduled) {
      flushScheduled = true;
      setTimeout(flushToIDB, 60); // ~60 ms throttle, hogy sűrű save-eknél ne fojtsunk meg minden frame-et
    }
    if (!suppressHistory) pushHistoryWith(historySnapshot());
  }

  function restoreSnapshot(snap) {
    suppressHistory = true;
    try {
      store = normalizeStore(JSON.parse(snap, expandReviver));
      project = activeProject();
      loadActiveSurface();
      refreshAll();
    } catch (e) {
      console.error("Előzmény-visszaállítás nem sikerült:", e);
    }
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
    //    Ha az olvasás hibás, NEM lépünk tovább csendben egy üres/régi tárra,
    //    amit az első save() rámentene a jó adatra: a sérült nyers adatot
    //    biztonsági kulcsra mentjük, és ebben a munkamenetben nem írunk IDB-be.
    let raw = null;
    try {
      raw = await idbGet(STORE_KEY);
    } catch (e) {
      idbReadFailed = true;
      console.error("IndexedDB olvasási hiba:", e);
      alert("A mentett tervek nem olvashatók be (IndexedDB hiba: " + (e && e.message || e) + ").\n\n" +
        "Ebben a munkamenetben az automatikus mentés KI VAN KAPCSOLVA, hogy a meglévő adat ne íródjon felül. " +
        "Próbáld újratölteni az oldalt; a munkádat a 💾 menüből JSON-fájlba mentheted.");
    }
    if (raw) {
      try { store = normalizeStore(JSON.parse(raw)); return; } catch (e) {
        console.error("Sérült tár az IndexedDB-ben:", e);
        const backupKey = STORE_KEY + "-corrupt-" + Date.now();
        try { await idbSet(backupKey, raw); } catch (_) {}
        alert("A mentett tár sérült, nem tölthető be. A nyers adat biztonsági kulcsra mentve (" + backupKey + "), " +
          "az app üres/régebbi állapottal indul.");
      }
    }
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
