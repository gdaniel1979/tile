"use strict";
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

  // Téglalap-felület létrehozása megadott méretű (w × h) zárt sokszöggel.
  function rectSurface(name, mode, w, h, groupId, groupKind, groupLabel) {
    const s = blankSurface(name, mode);
    s.points = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    s.closed = true;
    if (groupId) { s.groupId = groupId; s.groupKind = groupKind; s.groupLabel = groupLabel; }
    return s;
  }

  // Előtétfal: a kiválasztott fal-felületre helyezve. 4 gyermek-felület
  // (eleje, bal oldal, jobb oldal, teteje) + a fal-felületen egy "nem-burkolt"
  // kivágás a helyén (mert ott az előtétfal áll, a hátsó fal síkjában nincs
  // csempe).
  function generatePreWallOnActive(name, xMm, bottomMm, widthMm, heightMm, depthMm) {
    saveActiveSurface();
    const refWall = project.surfaces[project.activeIndex];
    if (!refWall || refWall.mode !== "wall" || !refWall.closed) {
      alert("Az előtétfalat fal-felületre kell helyezni — válts egy fal-felületre, majd próbáld újra.");
      return;
    }
    // a fal y-tengelye: a fal points[0]=(0,0) teteje, points[2]=(len,hMm) alja.
    // a fal magassága = max y. A kivágás y = hMm - (bottomMm + heightMm).
    let wallLen = 0, wallH = 0;
    refWall.points.forEach((pt) => { if (pt.x > wallLen) wallLen = pt.x; if (pt.y > wallH) wallH = pt.y; });
    if (xMm < 0 || xMm + widthMm > wallLen + 0.5) {
      alert("Az előtétfal kilóg a falon (vízszintesen). A fal szélessége " + (wallLen / 10).toFixed(1) + " cm, a megadott eltolás + szélesség túl nagy.");
      return;
    }
    if (bottomMm + heightMm > wallH + 0.5) {
      alert("Az előtétfal kilóg a fal teteje fölött. A fal magassága " + (wallH / 10).toFixed(1) + " cm, az alja + magasság túl nagy.");
      return;
    }
    const yCutTop = wallH - (bottomMm + heightMm);
    const id = "pw-" + Date.now().toString(36) + Math.floor(Math.random() * 1000);
    const label = name || "Előtétfal";
    // 1) Kivágás a fal-felületen (a kibukkanó terület, ahol az előtétfal áll)
    if (!Array.isArray(refWall.cutouts)) refWall.cutouts = [];
    refWall.cutouts.push({
      x: xMm, y: yCutTop, w: widthMm, h: heightMm,
      kind: "untiled",
      imageUrl: null,
      edgeEdgings: [false, false, false, false],
      groupId: id, // a kivágást is azonosítjuk a csoporthoz
    });
    // 2) 4 új gyermek-felület
    const front = rectSurface(label + ": eleje",      "wall", widthMm, heightMm, id, "preWall", label);
    const left  = rectSurface(label + ": bal oldal",  "wall", depthMm, heightMm, id, "preWall", label);
    const right = rectSurface(label + ": jobb oldal", "wall", depthMm, heightMm, id, "preWall", label);
    const top   = rectSurface(label + ": teteje",     "wall", widthMm, depthMm,  id, "preWall", label);
    [front, left, right, top].forEach((s) => { s.parentSurfaceId = refWall.id; });
    project.surfaces.push(front, left, right, top);
    project.activeIndex = project.surfaces.indexOf(front);
    expandedProjects.add(store.activeProjectId);
    expandedSurfaces.add(refWall.id); // a szülő-fal kinyitva
    loadActiveSurface();
    refreshAll();
    alert("Előtétfal létrehozva: 4 gyermek-felület + kivágás a „" + refWall.name + "” falon.");
  }

  // Lépcső: minden fokhoz 1 homloklap + 1 lépőlap.
  function generateStairs(name, steps, width, depth, rise) {
    saveActiveSurface();
    const id = "st-" + Date.now().toString(36) + Math.floor(Math.random() * 1000);
    const label = name || "Lépcső";
    const created = [];
    for (let i = 1; i <= steps; i++) {
      const hom = rectSurface(label + " — " + i + ". fok homloklap", "wall", width, rise,  id, "stairs", label);
      const lep = rectSurface(label + " — " + i + ". fok lépőlap",   "wall", width, depth, id, "stairs", label);
      created.push(hom, lep);
    }
    project.surfaces.push(...created);
    project.activeIndex = project.surfaces.indexOf(created[0]);
    expandedProjects.add(store.activeProjectId);
    loadActiveSurface();
    refreshAll();
    alert("Lépcső létrehozva: " + (2 * steps) + " felület (" + steps + " homloklap + " + steps + " lépőlap).");
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
    updateCanvasTitle();
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

