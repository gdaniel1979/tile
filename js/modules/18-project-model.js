"use strict";
  let project = null;
  const PROJECT_KEY = "tile-planner-project";

  function newSurfaceId() { return "s" + Date.now().toString(36) + Math.floor(Math.random() * 1e4); }
  function newProjectId() { return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4); }

  function normLayout(d) {
    d = d || {};
    return {
      pattern: ["straight", "offset", "diagonal", "herringbone"].includes(d.pattern) ? d.pattern : "straight",
      offsetPct: typeof d.offsetPct === "number" ? Math.max(0, Math.min(100, d.offsetPct)) : 50,
      show: d.show !== false,
      offXmm: typeof d.offXmm === "number" ? d.offXmm : 0,
      offYmm: typeof d.offYmm === "number" ? d.offYmm : 0,
      rotated: !!d.rotated,
      herringboneTilted: !!d.herringboneTilted,
      linkToFloor: !!d.linkToFloor,
      alignMode: ["none", "center", "min"].includes(d.alignMode) ? d.alignMode : "none",
      thresholdMm: typeof d.thresholdMm === "number" ? d.thresholdMm : 100,
      overagePct: typeof d.overagePct === "number" ? d.overagePct : 10,
      overrides: (d.overrides && typeof d.overrides === "object") ? d.overrides : {},
      paintTypeId: d.paintTypeId || null,
    };
  }

  function normSurface(d, fallbackBaseId) {
    d = d || {};
    return {
      id: d.id || newSurfaceId(),
      name: d.name || "Felület",
      mode: d.mode === "wall" ? "wall" : "floor",
      points: Array.isArray(d.points) ? d.points : [],
      closed: !!d.closed,
      snap: d.snap !== false,
      gridMm: d.gridMm || 100,
      ortho: !!d.ortho,
      baseId: d.baseId || fallbackBaseId,
      groutMm: typeof d.groutMm === "number" ? d.groutMm : 3,
      groutColor: d.groutColor || "#cfcfcf",
      cutouts: Array.isArray(d.cutouts)
        ? d.cutouts.filter((c) => c && typeof c.w === "number").map((c) => ({
            x: c.x || 0, y: c.y || 0, w: c.w, h: c.h,
            kind: c.kind === "untiled" ? "untiled" : "opening",
            name: typeof c.name === "string" ? c.name : "",
            // kivágás-csoport (Rétegek panel "Csoportba" funkció) — több
            // téglalap egy néven, a vásznon egy egységként kijelölve
            groupId: c.groupId || null,
            groupLabel: typeof c.groupLabel === "string" ? c.groupLabel : "",
            imageUrl: c.imageUrl || null,
            // élvédő a kivágás 4 élén: [top, right, bottom, left]
            edgeEdgings: Array.isArray(c.edgeEdgings) ? c.edgeEdgings.slice(0, 4).map((x) => !!x) : [false, false, false, false],
          }))
        : [],
      edgeNames: Array.isArray(d.edgeNames) ? d.edgeNames.slice() : [],
      edgeEdgings: Array.isArray(d.edgeEdgings) ? d.edgeEdgings.map((x) => !!x) : [],
      // Csoport-azonosító — összetett objektumok (előtétfal, lépcső) felületeit fogja össze
      groupId: d.groupId || null,
      groupKind: d.groupKind || null,         // "preWall" | "stairs"
      groupLabel: d.groupLabel || null,       // ember-olvasható csoport-felirat
      parentSurfaceId: d.parentSurfaceId || null,  // szülő-felület (pl. fal, amire az előtétfal kerül)
      roomName: typeof d.roomName === "string" ? d.roomName : "",  // helyiség-csoport neve a projekt-fában (üres = nincs csoport)
      layout: normLayout(d.layout),
      fromFloorId: d.fromFloorId || null,
      fromEdgeIndex: typeof d.fromEdgeIndex === "number" ? d.fromEdgeIndex : null,
      wallsSignature: d.wallsSignature || null,
      wallHeightMm: typeof d.wallHeightMm === "number" ? d.wallHeightMm : null,
      warnDismissedSignature: d.warnDismissedSignature || null,
      lastGroutAreaMm2: typeof d.lastGroutAreaMm2 === "number" ? d.lastGroutAreaMm2 : 0,
      lastTileThicknessMm: typeof d.lastTileThicknessMm === "number" ? d.lastTileThicknessMm : 8,
      lastAreaMm2: typeof d.lastAreaMm2 === "number" ? d.lastAreaMm2 : 0,
      lastTileAreaMm2: typeof d.lastTileAreaMm2 === "number" ? d.lastTileAreaMm2 : 0,
      lastTilesNeeded: typeof d.lastTilesNeeded === "number" ? d.lastTilesNeeded : 0,
      lastWhole: typeof d.lastWhole === "number" ? d.lastWhole : 0,
      lastCut: typeof d.lastCut === "number" ? d.lastCut : 0,
      lastTilesByType: (d.lastTilesByType && typeof d.lastTilesByType === "object") ? d.lastTilesByType : null,
    };
  }

  function defaultMaterial() {
    return {
      groutPreset: "cg1",            // "cg1" | "cg2" | "epoxy"
      silWidthMm: 5,
      silDepthMm: 5,
      silTubeMl: 310,
      silWastePct: 15,
      gluePreset: "c2s1",            // "c1" | "c2" | "c2s1"
      glueWastePct: 10,
      // egységárak (Ft) — 0 = nincs megadva, kihagyjuk a költségszámításból
      groutPricePack: 0,
      gluePricePack: 0,
      silPriceTube: 0,
      edgingPricePerM: 0,
    };
  }
  // g/cm³ — a Mapei Kerapoxy Easy Design adatlapja szerint a kevert epoxi 1,55 g/cm³
  const GROUT_DENSITIES = { cg1: 1.5, cg2: 1.7, epoxy: 1.55 };
  const GROUT_LABELS = {
    cg1: "Cementes CG1",
    cg2: "Cementes CG2",
    epoxy: "Mapei Kerapoxy Easy Design (epoxi)",
  };
  // standard csomagolási méret (kg/csomag) — cementes átlag 5 kg-os zsák,
  // a Mapei Kerapoxy Easy Design 3 kg-os vödör (gyári kiszerelés)
  const GROUT_PACK_KG = { cg1: 5, cg2: 5, epoxy: 3 };
  const GROUT_PACK_NAME = { cg1: "zsák", cg2: "zsák", epoxy: "vödör" };

  // Ragasztó-fogyasztás (kg/m²) — a fogazatlap-méret függvénye, ez egy átlag.
  // EN 12004 osztály-jelölések: C1 = sima cementes, C2 = fokozott tapadású,
  // S1 = deformálható (rugalmas) — pl. Mapei Keraflex Maxi S1, Schönox Q9.
  const GLUE_KG_PER_M2 = { c1: 4.0, c2: 5.0, c2s1: 5.0 };
  const GLUE_LABELS = {
    c1: "C1 cementes",
    c2: "C2 flexibilis",
    c2s1: "C2 S1 deformálható",
  };
  const GLUE_PACK_KG = 25;

  function defaultProject(name) {
    const dt = defaultTiles();
    const types = dt.types.map((t) => ({ ...t })); // friss példány (projektenként külön könyvtár)
    return {
      id: newProjectId(), name: name || "Projekt", unit: "cm", tileTypes: types, activeIndex: 0, untiledColor: "#8a8f98",
      material: defaultMaterial(),
      surfaces: [normSurface({ name: "Padló", mode: "floor", baseId: types[0].id, groutMm: dt.groutMm, groutColor: dt.groutColor, layout: { paintTypeId: types[0].id } }, types[0].id)],
    };
  }

  function projectFromLegacy(d) {
    const types = (d.tiles && Array.isArray(d.tiles.types) && d.tiles.types.length) ? d.tiles.types : defaultTiles().types;
    const baseId = (d.tiles && d.tiles.baseId && types.some((t) => t.id === d.tiles.baseId)) ? d.tiles.baseId : types[0].id;
    const surf = normSurface({
      name: d.mode === "wall" ? "Fal" : "Padló", mode: d.mode, points: d.points, closed: d.closed,
      snap: d.snap, gridMm: d.gridMm, ortho: d.ortho, baseId,
      groutMm: d.tiles ? d.tiles.groutMm : 3, groutColor: d.tiles ? d.tiles.groutColor : "#cfcfcf",
      layout: d.layout,
    }, baseId);
    return { id: newProjectId(), name: "Projekt", unit: d.unit || "cm", untiledColor: "#8a8f98", tileTypes: types, surfaces: [surf], activeIndex: 0 };
  }

  function normalizeProject(p) {
    if (!p || typeof p !== "object") return defaultProject();
    const types = (Array.isArray(p.tileTypes) && p.tileTypes.length) ? p.tileTypes : defaultTiles().types;
    types.forEach((t) => {
      if (!(typeof t.thicknessMm === "number" && t.thicknessMm > 0)) t.thicknessMm = 8;
      if (!(typeof t.pricePerTile === "number" && t.pricePerTile >= 0)) t.pricePerTile = 0;
    });
    let surfaces = (Array.isArray(p.surfaces) && p.surfaces.length)
      ? p.surfaces.map((s) => normSurface(s, types[0].id))
      : [normSurface({ name: "Padló", mode: "floor", baseId: types[0].id }, types[0].id)];
    surfaces.forEach((s) => { if (!types.some((t) => t.id === s.baseId)) s.baseId = types[0].id; });
    let ai = Math.max(0, Math.min(typeof p.activeIndex === "number" ? p.activeIndex : 0, surfaces.length - 1));
    // Migráció: régi mentésekben hiányozhat a wall.fromEdgeIndex (a korábbi normSurface
    // nem őrizte meg). Próbáljuk visszafejteni: 1) a fal szélessége (points[1]-points[0])
    // egyezzen a floor egyik élének hosszával; 2) ha nem egyértelmű, a fromFloorId-szerű
    // falak sorrendje 0..n-1 (ahogy generateWalls hozta létre őket).
    surfaces.forEach((floor) => {
      if (floor.mode !== "floor" || !floor.closed || !Array.isArray(floor.points) || floor.points.length < 3) return;
      const myWalls = surfaces.filter((w) => w.fromFloorId === floor.id);
      if (!myWalls.length) return;
      const fp = floor.points, n = fp.length;
      const edgeLens = [];
      for (let i = 0; i < n; i++) {
        const a = fp[i], b = fp[(i + 1) % n];
        edgeLens.push(Math.hypot(b.x - a.x, b.y - a.y));
      }
      const usedEdges = new Set();
      myWalls.forEach((w, idx) => {
        if (typeof w.fromEdgeIndex === "number" && w.fromEdgeIndex >= 0 && w.fromEdgeIndex < n) {
          usedEdges.add(w.fromEdgeIndex);
        }
      });
      myWalls.forEach((w, idx) => {
        if (typeof w.fromEdgeIndex === "number" && w.fromEdgeIndex >= 0 && w.fromEdgeIndex < n) return;
        let chosen = -1;
        if (Array.isArray(w.points) && w.points.length >= 2) {
          const wWidth = Math.hypot(w.points[1].x - w.points[0].x, w.points[1].y - w.points[0].y);
          let best = -1, bestDiff = Infinity;
          for (let i = 0; i < n; i++) {
            if (usedEdges.has(i)) continue;
            const diff = Math.abs(edgeLens[i] - wWidth);
            if (diff < bestDiff) { bestDiff = diff; best = i; }
          }
          if (best >= 0 && bestDiff < 1.5) chosen = best;
        }
        if (chosen < 0) {
          // fallback: a generálási sorrend (idx)
          if (idx < n && !usedEdges.has(idx)) chosen = idx;
        }
        if (chosen >= 0) { w.fromEdgeIndex = chosen; usedEdges.add(chosen); }
      });
      // ha hiányzik a floor.wallHeightMm, próbáljuk a falak magasságából (points[2].y - points[1].y)
      if (!(typeof floor.wallHeightMm === "number" && floor.wallHeightMm > 0)) {
        const w = myWalls[0];
        if (w && Array.isArray(w.points) && w.points.length >= 3) {
          const hMm = Math.hypot(w.points[2].x - w.points[1].x, w.points[2].y - w.points[1].y);
          if (hMm > 0) floor.wallHeightMm = hMm;
        }
      }
    });
    const mat = Object.assign(defaultMaterial(), (p.material && typeof p.material === "object") ? p.material : {});
    if (!(mat.groutPreset in GROUT_DENSITIES)) mat.groutPreset = "cg1";
    if (!(mat.gluePreset in GLUE_KG_PER_M2)) mat.gluePreset = "c2s1";
    ["silWidthMm", "silDepthMm", "silTubeMl", "silWastePct", "glueWastePct",
     "groutPricePack", "gluePricePack", "silPriceTube", "edgingPricePerM"].forEach((k) => {
      if (!(typeof mat[k] === "number" && mat[k] >= 0)) mat[k] = defaultMaterial()[k];
    });
    return { id: p.id || newProjectId(), name: p.name || "Projekt", unit: p.unit === "mm" ? "mm" : "cm", untiledColor: p.untiledColor || "#8a8f98", tileTypes: types, surfaces, activeIndex: ai, material: mat };
  }

  // A state <-> aktív felület szinkronizálása
