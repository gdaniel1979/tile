"use strict";
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

  // Falak generálása / frissítése a padló éleiből. A már meglévő (ebből a
  // padlóból generált) falak HELYBEN frissülnek (méret, név) — a rajtuk lévő
  // kivágások, kiosztás-beállítások, élvédők és az előtétfalak megmaradnak;
  // az új élekhez új fal készül, a megszűnt élek falai (gyermekeikkel) törlődnek.
  function generateWalls(floor, hMm) {
    if (!(hMm > 0)) return;
    saveActiveSurface();
    const edges = floorEdgeLengths(floor);
    const names = floor.edgeNames || [];
    const byEdge = new Map();
    project.surfaces.forEach((s) => {
      if (s.fromFloorId === floor.id && typeof s.fromEdgeIndex === "number" && !byEdge.has(s.fromEdgeIndex)) byEdge.set(s.fromEdgeIndex, s);
    });
    const kept = new Set();
    let created = 0;
    edges.forEach((len, idx) => {
      const wname = (names[idx] && names[idx].trim()) ? names[idx].trim() : "Fal " + (idx + 1);
      let w = byEdge.get(idx);
      if (!w) { w = blankSurface(wname, "wall"); w.fromFloorId = floor.id; w.fromEdgeIndex = idx; project.surfaces.push(w); created++; }
      w.name = wname;
      w.points = [{ x: 0, y: 0 }, { x: len, y: 0 }, { x: len, y: hMm }, { x: 0, y: hMm }];
      w.closed = true;
      kept.add(w.id);
    });
    const gone = project.surfaces.filter((s) => s.fromFloorId === floor.id && !kept.has(s.id)).map((s) => s.id);
    if (gone.length) removeSurfaces(withDescendants(gone));
    floor.wallsSignature = floorSignature(floor);
    floor.wallHeightMm = hMm;
    floor.warnDismissedSignature = null;
    project.activeIndex = project.surfaces.findIndex((s) => s.fromFloorId === floor.id);
    if (project.activeIndex < 0) project.activeIndex = project.surfaces.indexOf(floor);
    loadActiveSurface();
    refreshAll();
    const updated = edges.length - created;
    alert("A(z) „" + floor.name + "” padlóból: " + (created ? created + " fal létrehozva" : "") +
      (created && updated ? ", " : "") + (updated ? updated + " fal frissítve (kivágásaik és beállításaik megmaradtak)" : "") +
      (gone.length ? ", " + gone.length + " megszűnt él fala törölve" : "") + ".");
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
      "Figyelem: a(z) „" + stale.name + "” padló megváltozott a falak generálása óta — a belőle készült falak NEM frissültek automatikusan. A „Falak frissítése” gomb a méreteket igazítja; a falakon lévő kivágások és beállítások megmaradnak.";
    el.wallWarn.hidden = false;
  }

  // =======================================================================
  //  6. FÁZIS – Export / mentés (PNG, PDF/nyomtatás, JSON)
  // =======================================================================
