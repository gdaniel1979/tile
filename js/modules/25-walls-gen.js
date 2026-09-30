"use strict";
  // ---- Falak generálása a padlóból + automatikus igazítás ------------
  function floorEdgeLengths(s) {
    const p = s.points, n = p.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push(Math.hypot(b.x - a.x, b.y - a.y));
    }
    return out;
  }
  function floorSignature(s) { return floorEdgeLengths(s).map((l) => Math.round(l)).join(","); }

  function wallSize(w) {
    let len = 0, h = 0;
    (w.points || []).forEach((pt) => { if (pt.x > len) len = pt.x; if (pt.y > h) h = pt.y; });
    return { len, h };
  }

  // Téglalap (kivágás) beigazítása a W × H felületbe: eltolás, ha kell kicsinyítés
  function fitRectInto(c, W, H) {
    const o = { x: c.x, y: c.y, w: c.w, h: c.h };
    c.w = Math.min(c.w, W); c.h = Math.min(c.h, H);
    c.x = Math.max(0, Math.min(c.x, W - c.w));
    c.y = Math.max(0, Math.min(c.y, H - c.h));
    return o.x !== c.x || o.y !== c.y || o.w !== c.w || o.h !== c.h;
  }
  // előtétfal: ha a kivágása keskenyebb lett, az eleje és a teteje is
  function resizePreWallChildren(groupId, oldW, newW) {
    project.surfaces.forEach((s) => {
      if (s.groupId !== groupId || s.groupKind !== "preWall") return;
      const { len, h } = wallSize(s);
      if (Math.abs(len - oldW) < 0.5) s.points = [{ x: 0, y: 0 }, { x: newW, y: 0 }, { x: newW, y: h }, { x: 0, y: h }];
    });
  }

  // A padlóból generált falak igazítása a padló éleihez — HELYBEN: a meglévő falak
  // mérete és neve frissül (kivágásaik, kiosztás-beállításaik, élvédőik és az
  // előtétfalak megmaradnak), az új élekhez új fal készül, a megszűnt élek falai
  // (gyermekeikkel) törlődnek. Ha egy fal kisebb lett, a kilógó kivágásai
  // beigazodnak. hMm: új falmagasság (null = a falak a saját magasságukat tartják).
  // explicit (a „Falak generálása” gomb): a kézzel törölt falakat is újra létrehozza.
  function syncWallsToFloor(floor, hMm, explicit) {
    if (explicit) floor.noWallEdges = [];
    const skip = new Set(floor.noWallEdges || []);
    const edges = floorEdgeLengths(floor);
    const names = floor.edgeNames || [];
    const byEdge = new Map(), orphans = [];
    project.surfaces.forEach((s) => {
      if (s.fromFloorId !== floor.id) return;
      const i = s.fromEdgeIndex;
      if (typeof i === "number" && i >= 0 && i < edges.length && !byEdge.has(i)) byEdge.set(i, s);
      else orphans.push(s);
    });
    const anyWall = byEdge.values().next().value;
    const defaultH = hMm || floor.wallHeightMm || (anyWall && wallSize(anyWall).h) || 2700;
    const r = { created: [], updated: [], renamed: [], removed: orphans.map((s) => s.name), fitted: [] };
    edges.forEach((len, idx) => {
      const wname = (names[idx] && names[idx].trim()) ? names[idx].trim() : "Fal " + (idx + 1);
      let w = byEdge.get(idx);
      if (!w && skip.has(idx)) return; // a felhasználó törölte ennek az élnek a falát
      if (!w) {
        w = blankSurface(wname, "wall"); w.fromFloorId = floor.id; w.fromEdgeIndex = idx;
        project.surfaces.push(w);
        r.created.push(wname);
      }
      const old = wallSize(w);
      const h = hMm || old.h || defaultH;
      const resized = Math.abs(old.len - len) > 0.01 || Math.abs(old.h - h) > 0.01 || !w.closed;
      if (!resized && w.name === wname) return;
      const isNew = r.created.includes(wname) && w.name === wname;
      if (w.name !== wname) r.renamed.push(w.name + " → " + wname);
      else if (!isNew) r.updated.push(wname);
      w.name = wname;
      if (!resized) return;
      w.points = [{ x: 0, y: 0 }, { x: len, y: 0 }, { x: len, y: h }, { x: 0, y: h }];
      w.closed = true;
      (w.cutouts || []).forEach((c, ci) => {
        const oldW = c.w;
        if (!fitRectInto(c, len, h)) return;
        r.fitted.push(wname + ": " + (c.name || (c.groupId ? "előtétfal" : c.kind === "opening" ? "nyílás " + (ci + 1) : "kivágás " + (ci + 1))));
        if (c.groupId && c.w !== oldW) resizePreWallChildren(c.groupId, oldW, c.w);
      });
    });
    if (orphans.length) removeSurfaces(withDescendants(orphans.map((s) => s.id)));
    floor.wallsSignature = floorSignature(floor);
    if (hMm) floor.wallHeightMm = hMm;
    r.changed = !!(r.created.length || r.updated.length || r.renamed.length || r.removed.length);
    return r;
  }

  // Falak generálása / frissítése a gombbal (Rajzolás fül → Falak generálása)
  function generateWalls(floor, hMm) {
    if (!(hMm > 0)) return;
    saveActiveSurface();
    const r = syncWallsToFloor(floor, hMm, true);
    project.activeIndex = project.surfaces.findIndex((s) => s.fromFloorId === floor.id);
    if (project.activeIndex < 0) project.activeIndex = project.surfaces.indexOf(floor);
    loadActiveSurface();
    refreshAll();
    const updated = floorEdgeLengths(floor).length - r.created.length;
    alert("A(z) „" + floor.name + "” padlóból: " + (r.created.length ? r.created.length + " fal létrehozva" : "") +
      (r.created.length && updated ? ", " : "") + (updated ? updated + " fal frissítve (kivágásaik és beállításaik megmaradtak)" : "") +
      (r.removed.length ? ", " + r.removed.length + " megszűnt él fala törölve" : "") + ".");
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

  // ---- Automatikus igazítás: a generált falak mindig követik a padlót ------------
  // A save() hívja (húzás közben nem, visszavonáskor nem): ha egy padló élei (hossz,
  // név, darabszám) eltérnek a belőle generált falaktól, a falak helyben igazodnak,
  // és egy rövid, nem felugró üzenet szól róla. Egy Ctrl+Z a padlót és a falakat
  // együtt állítja vissza (egy előzmény-lépés).
  let wallSyncBusy = false;
  function autoSyncWalls() {
    if (wallSyncBusy || !project) return;
    wallSyncBusy = true;
    try {
      saveActiveSurface();
      const activeId = project.surfaces[project.activeIndex] && project.surfaces[project.activeIndex].id;
      const msgs = [];
      let touchedActive = false;
      project.surfaces.filter((f) => f.mode === "floor" && f.closed && f.points.length >= 3).forEach((f) => {
        if (!project.surfaces.some((s) => s.fromFloorId === f.id)) return;
        if (!wallsNeedSync(f)) return;
        const r = syncWallsToFloor(f, null);
        if (!r.changed) return;
        if (project.surfaces.some((s) => s.id === activeId && s.fromFloorId === f.id)) touchedActive = true;
        const parts = [];
        if (r.updated.length) parts.push(r.updated.length + " fal mérete igazítva");
        if (r.renamed.length) parts.push("átnevezve: " + r.renamed.join(", "));
        if (r.created.length) parts.push("új fal: " + r.created.join(", "));
        if (r.removed.length) parts.push("törölve: " + r.removed.join(", "));
        let m = "„" + f.name + "” falai követték a padlót — " + parts.join("; ") + ".";
        if (r.fitted.length) m += " Beigazítva: " + r.fitted.join(", ") + ".";
        msgs.push(m);
      });
      if (!msgs.length) return;
      if (touchedActive) loadActiveSurface();
      renderProjectTree();
      showToast(msgs.join(" ") + " (Ctrl+Z: visszavonás)");
    } finally { wallSyncBusy = false; }
  }
  // gyors ellenőrzés: kell-e bármit tenni (élhossz, élnév, élszám, gazdátlan fal)
  function wallsNeedSync(floor) {
    const edges = floorEdgeLengths(floor), names = floor.edgeNames || [];
    const seen = new Set();
    for (const s of project.surfaces) {
      if (s.fromFloorId !== floor.id) continue;
      const i = s.fromEdgeIndex;
      if (typeof i !== "number" || i < 0 || i >= edges.length || seen.has(i)) return true;
      seen.add(i);
      const wname = (names[i] && names[i].trim()) ? names[i].trim() : "Fal " + (i + 1);
      if (s.name !== wname || Math.abs(wallSize(s).len - edges[i]) > 0.01) return true;
    }
    const skip = new Set(floor.noWallEdges || []);
    for (let i = 0; i < edges.length; i++) if (!seen.has(i) && !skip.has(i)) return true;
    return false;
  }

  // =======================================================================
  //  6. FÁZIS – Export / mentés (PNG, PDF/nyomtatás, JSON)
  // =======================================================================
