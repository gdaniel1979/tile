"use strict";
  function computeProjectTileNumbers(p) {
    let area = 0, total = 0, whole = 0, cut = 0, needed = 0, usedArea = 0;
    p.surfaces.forEach((s) => {
      const sNeeded = s.lastTilesNeeded || 0;
      if (sNeeded <= 0) return;
      area += s.lastAreaMm2 || 0;
      whole += s.lastWhole || 0;
      cut += s.lastCut || 0;
      total += (s.lastWhole || 0) + (s.lastCut || 0);
      needed += sNeeded;
      usedArea += sNeeded * (s.lastTileAreaMm2 || 0);
    });
    const wastePct = usedArea > 0 ? (1 - area / usedArea) * 100 : 0;
    return { area, total, whole, cut, needed, wastePct };
  }

  // Ugyanaz, csak laptípusonként csoportosítva. ELSŐDLEGESEN a felület
  // lastTilesByType cache-ét használja (ami a tényleges típust mutatja, beleértve
  // az egyedi-lap override-okat is). Fallback: ha az új cache nincs, baseId alapján.
  // Visszaad egy tömböt: [{ id, name, area, whole, cut, needed, usedArea, surfaceNames[] }, ...]
  function computeProjectTileNumbersByType(p) {
    const groups = {};
    const ensure = (id, name) => {
      if (!groups[id]) {
        const t = (p.tileTypes || []).find((x) => x.id === id);
        groups[id] = { id, name: name || (t ? t.name : "ismeretlen lap"), area: 0, whole: 0, cut: 0, needed: 0, usedArea: 0, surfaceNames: new Set() };
      }
      return groups[id];
    };
    p.surfaces.forEach((s) => {
      const bt = s.lastTilesByType;
      if (bt && typeof bt === "object" && Object.keys(bt).length) {
        Object.keys(bt).forEach((tid) => {
          const stats = bt[tid];
          if (!stats || (stats.needed || 0) <= 0 && (stats.whole || 0) <= 0 && (stats.cut || 0) <= 0) return;
          const g = ensure(tid, stats.name);
          g.area += stats.area || 0;
          g.whole += stats.whole || 0;
          g.cut += stats.cut || 0;
          g.needed += stats.needed || 0;
          g.usedArea += (stats.needed || 0) * (stats.tileAreaMm2 || 0);
          g.surfaceNames.add(s.name);
        });
      } else {
        const sNeeded = s.lastTilesNeeded || 0;
        if (sNeeded <= 0) return;
        const g = ensure(s.baseId);
        g.area += s.lastAreaMm2 || 0;
        g.whole += s.lastWhole || 0;
        g.cut += s.lastCut || 0;
        g.needed += sNeeded;
        g.usedArea += sNeeded * (s.lastTileAreaMm2 || 0);
        g.surfaceNames.add(s.name);
      }
    });
    return Object.values(groups).map((g) => ({ ...g, surfaceNames: [...g.surfaceNames] }));
  }

  // Projekt-szintű szilikon (mm-ben adott hosszak).
  function computeSiliconeForProject(p) {
    let horizMm = 0, vertMm = 0;
    let horizN = 0, vertN = 0;
    let edgingMm = 0, edgingN = 0; // élvédő-profil hossza
    // A fal-felületek edgeEdgings-ét nézzük:
    //   - él 2 (alja) = padló-fal találkozás → vízszintes szilikon helyett élvédő
    //   - él 1 (jobb) vagy 3 (bal) = függőleges sarok → vert. szilikon helyett élvédő
    //   - él 0 (tetje) = befejező profil (ha nem mennyezetig burkolunk)
    // Plus minden szabadon megjelölt él (pl. előtétfalon) → élvédő-aggregátor.
    p.surfaces.forEach((floor) => {
      if (floor.mode !== "floor" || !floor.closed || floor.points.length < 3) return;
      const walls = p.surfaces.filter((w) => w.fromFloorId === floor.id);
      if (!walls.length) return;
      const n = floor.points.length;
      // térkép: padló-él index → fal objektum
      const wallByEdge = new Map();
      walls.forEach((w) => {
        if (typeof w.fromEdgeIndex === "number" && w.fromEdgeIndex >= 0 && w.fromEdgeIndex < n) {
          wallByEdge.set(w.fromEdgeIndex, w);
        }
      });
      const wallEdgings = (w) => Array.isArray(w.edgeEdgings) ? w.edgeEdgings : [];

      // Vízszintes hossz (padló-fal találkozás) = a fal alsó éle (él 2)
      walls.forEach((w) => {
        if (typeof w.fromEdgeIndex !== "number") return;
        const i = w.fromEdgeIndex;
        const a = floor.points[i], b = floor.points[(i + 1) % n];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const e = wallEdgings(w);
        if (e[2]) {                 // fal alja élvédős
          edgingMm += len; edgingN++;
        } else {
          horizMm += len; horizN++;
        }
        // fal teteje (él 0) — befejező profil
        if (e[0]) { edgingMm += len; edgingN++; }
      });

      // Függőleges sarkok: a padló-csúcsok, ahol két szomszédos fal van.
      // A k. csúcsra a wallByEdge[k-1] fal JOBB OLDALA (él 1) ÉS a wallByEdge[k]
      // fal BAL OLDALA (él 3) találkozik. Ha bármelyik élvédős, élvédő-profil
      // takar; egyébként szilikon.
      const hMm = floor.wallHeightMm || 0;
      for (let k = 0; k < n; k++) {
        const prevEdge = (k + n - 1) % n;
        const wallPrev = wallByEdge.get(prevEdge);
        const wallCurr = wallByEdge.get(k);
        if (!wallPrev || !wallCurr) continue;
        const ep = wallEdgings(wallPrev);
        const ec = wallEdgings(wallCurr);
        const cornerEdging = !!ep[1] || !!ec[3];
        if (cornerEdging) {
          edgingMm += hMm; edgingN++;
        } else {
          vertMm += hMm; vertN++;
        }
      }
    });

    // Önálló (nem-padló-fal) felületek élvédői (pl. előtétfal kézi rajz): minden
    // zárt felületen az edgeEdgings éleinek hosszait összegezzük az élvédőbe.
    // A padlót és a fenti fal-feldolgozást már megtörténtnek tekintjük.
    p.surfaces.forEach((s) => {
      if (!s.closed || !Array.isArray(s.points) || s.points.length < 3) return;
      if (s.mode === "floor") return;                  // padló élei nem
      if (s.mode === "wall" && s.fromFloorId) return;  // generált fal: már fent feldolgozva
      const edgings = Array.isArray(s.edgeEdgings) ? s.edgeEdgings : [];
      const sn = s.points.length;
      for (let i = 0; i < sn; i++) {
        if (!edgings[i]) continue;
        const a = s.points[i], b = s.points[(i + 1) % sn];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        edgingMm += len; edgingN++;
      }
    });

    // Kivágás-élek (ajtó/ablak/nem-burkolt) — itt van a TÉNYLEGES burkolat-széle.
    // A felület-élektől függetlenül minden felület kivágásait megnézzük.
    p.surfaces.forEach((s) => {
      if (!Array.isArray(s.cutouts)) return;
      s.cutouts.forEach((c) => {
        const eEdg = Array.isArray(c.edgeEdgings) ? c.edgeEdgings : [];
        if (!eEdg.some((x) => x)) return;
        // [top, right, bottom, left] — hosszak: top/bottom = c.w, left/right = c.h
        if (eEdg[0]) { edgingMm += c.w || 0; edgingN++; } // fent
        if (eEdg[1]) { edgingMm += c.h || 0; edgingN++; } // jobb
        if (eEdg[2]) { edgingMm += c.w || 0; edgingN++; } // lent
        if (eEdg[3]) { edgingMm += c.h || 0; edgingN++; } // bal
      });
    });

    return { horizMm, vertMm, horizN, vertN, edgingMm, edgingN };
  }

  // Kartus-szám: hossz × szélesség × mélység → ml → tubusok (felfelé).
  function computeSiliconeTubes(totalLengthMm, m) {
    const widthMm = m.silWidthMm || 5, depthMm = m.silDepthMm || 5;
    const tubeMl = Math.max(1, m.silTubeMl || 310);
    const wasteFrac = Math.max(0, m.silWastePct || 0) / 100;
    const volumeMm3 = totalLengthMm * widthMm * depthMm;
    const volumeMl = volumeMm3 / 1000; // mm³ → ml (1 ml = 1 cm³ = 1000 mm³)
    const tubes = Math.ceil((volumeMl * (1 + wasteFrac)) / tubeMl);
    return { volumeMl, tubes };
  }

  // Projekt-szintű fuga-tömeg az összes felület utolsó ismert (cache-elt) groutArea-jából.
  function computeProjectGroutMass(p) {
    let totalMassKg = 0;
    p.surfaces.forEach((s) => {
      const a = s.lastGroutAreaMm2 || 0;
      const thick = s.lastTileThicknessMm || 8;
      if (a <= 0) return;
      const density = GROUT_DENSITIES[p.material ? p.material.groutPreset : "cg1"] || 1.5;
      const volCm3 = (a * thick) / 1000;
      totalMassKg += (volCm3 * density) / 1000;
    });
    return totalMassKg;
  }

  // Minden felület kiosztásának újraszámolása offscreen vászonra, hogy
  // a projekt-szintű anyagösszesítés ne csak az aktív felületet mutassa.
  // Hívás: Anyag fülre váltáskor (gyors: pár felület, csak cache-elés).
  function recomputeAllSurfacesMaterial() {
    if (!project || !Array.isArray(project.surfaces)) return;
    saveActiveSurface(); // a jelenlegi felület mentése
    const savedIndex = project.activeIndex;
    const savedCtx = ctx;
    const savedView = state.view;
    const off = document.createElement("canvas");
    off.width = 100; off.height = 100;
    const wasSuppress = suppressHistory, wasInDrag = inDrag;
    suppressHistory = true; inDrag = true; // ne pusholjon history-t / ne ment-tárazzon
    ctx = off.getContext("2d");
    state.view = { scale: 1, ox: 0, oy: 0 }; // a koord-rendszer a cache-elt mm-értékeket nem érinti
    try {
      for (let i = 0; i < project.surfaces.length; i++) {
        project.activeIndex = i;
        loadActiveSurface();
        if (shouldDrawLayout()) drawLayout();
        else cacheActiveSurfaceMaterial(null);
      }
    } catch (_) { /* swallow */ }
    project.activeIndex = savedIndex;
    loadActiveSurface();
    ctx = savedCtx;
    state.view = savedView;
    render(); // a látható vászon visszaáll (ezalatt is suppressHistory aktív)
    updateProjectMaterialReport();
    // a frissített cache-t mentjük (history nélkül), hogy reload után is megmaradjon
    try { idbSet(STORE_KEY, JSON.stringify(serializeStore())); } catch (_) {}
    suppressHistory = wasSuppress; inDrag = wasInDrag;
  }

  function updateProjectMaterialReport() {
    if (!el.prMass || !project) return;
    const m = project.material || defaultMaterial();
    const overage = Math.max(0, state.layout && state.layout.overagePct || 0);

    // Burkolat — projekt-szint, laptípusonként bontva
    const tn = computeProjectTileNumbers(project);
    el.prArea.textContent = tn.area > 0 ? (tn.area / 1e6).toFixed(2) + " m²" : "–";
    if (el.prTilesByType) {
      const groups = computeProjectTileNumbersByType(project);
      if (!groups.length) {
        el.prTilesByType.innerHTML = '<div class="mat-row"><span>Lap szükséglet:</span> <strong>–</strong></div>';
      } else {
        const parts = groups.map((g) => {
          const finalTiles = Math.ceil(g.needed * (1 + overage / 100));
          const wastePct = g.usedArea > 0 ? (1 - g.area / g.usedArea) * 100 : 0;
          const surfList = g.surfaceNames.length ? g.surfaceNames.join(", ") : "";
          return '<div class="tile-group">'
            + '<div class="tile-group-h">' + escapeHtml(g.name) + (surfList ? ' <span class="tg-sub">(' + escapeHtml(surfList) + ')</span>' : '') + '</div>'
            + '<div class="mat-row"><span>Burkolt terület:</span> <strong>' + (g.area / 1e6).toFixed(2) + ' m²</strong></div>'
            + '<div class="mat-row"><span>Egész lap:</span> <strong>' + g.whole + ' db</strong></div>'
            + '<div class="mat-row"><span>Vágott helyek:</span> <strong>' + g.cut + ' db</strong></div>'
            + '<div class="mat-row"><span>Szükséges lap (újrahaszn.):</span> <strong>' + g.needed + ' db (hulladék: ' + wastePct.toFixed(0) + ' %)</strong></div>'
            + '<div class="mat-row"><span><strong>Lap tartalékkal:</strong></span> <strong>' + finalTiles + ' db (+' + overage + '%)</strong></div>'
            + '</div>';
        });
        el.prTilesByType.innerHTML = parts.join("");
      }
    }

    // Fuga — projekt-szint
    const gArea = project.surfaces.reduce((acc, s) => acc + (s.lastGroutAreaMm2 || 0), 0);
    const massKg = computeProjectGroutMass(project) * (1 + overage / 100);
    el.prGroutArea.textContent = gArea > 0 ? (gArea / 1e6).toFixed(2) + " m²" : "–";
    el.prMass.textContent = massKg > 0 ? massKg.toFixed(2) + " kg (+" + overage + "%)" : "–";
    if (el.prGroutPacks) {
      const packKg = GROUT_PACK_KG[m.groutPreset] || 5;
      const packName = GROUT_PACK_NAME[m.groutPreset] || "csomag";
      if (massKg > 0 && packKg > 0) {
        const packs = Math.ceil(massKg / packKg);
        el.prGroutPacks.textContent = packs + " db " + packName + " (" + packKg + " kg/" + packName + ")";
      } else {
        el.prGroutPacks.textContent = "–";
      }
    }

    // Ragasztó — projekt-szint (a tn.area-t használjuk, mert ugyanaz a burkolt terület)
    if (el.prGlueArea) {
      const glueWaste = Math.max(0, m.glueWastePct || 0);
      const kgPerM2 = GLUE_KG_PER_M2[m.gluePreset] || 5;
      const glueKg = (tn.area / 1e6) * kgPerM2 * (1 + glueWaste / 100);
      el.prGlueArea.textContent = tn.area > 0 ? (tn.area / 1e6).toFixed(2) + " m² × " + kgPerM2 + " kg/m²" : "–";
      el.prGlueMass.textContent = glueKg > 0 ? glueKg.toFixed(2) + " kg (+" + glueWaste + "% tartalék)" : "–";
      if (glueKg > 0) {
        const packs = Math.ceil(glueKg / GLUE_PACK_KG);
        el.prGluePacks.textContent = packs + " db zsák (" + GLUE_PACK_KG + " kg)";
      } else {
        el.prGluePacks.textContent = "–";
      }
    }

    // Szilikon — projekt-szint
    const sil = computeSiliconeForProject(project);
    const totLen = sil.horizMm + sil.vertMm;
    const fmtLen = (mm) => (mm / 1000).toFixed(2) + " m";
    el.prSilH.textContent = sil.horizN ? fmtLen(sil.horizMm) + " (" + sil.horizN + " fal)" : "–";
    el.prSilV.textContent = sil.vertN ? fmtLen(sil.vertMm) + " (" + sil.vertN + " sarok)" : "–";
    if (totLen > 0) {
      const t = computeSiliconeTubes(totLen, m);
      el.prSilTot.textContent = fmtLen(totLen);
      el.prTubes.textContent = t.tubes + " db kartus (" + t.volumeMl.toFixed(0) + " ml, +" + (m.silWastePct || 0) + "%)";
    } else {
      el.prSilTot.textContent = "–";
      el.prTubes.textContent = "–";
    }
    if (el.prEdging) {
      el.prEdging.textContent = sil.edgingN > 0
        ? fmtLen(sil.edgingMm) + " (" + sil.edgingN + " él)"
        : "–";
    }

    // Költségszámítás — laptípusonkénti ár × tartalékos db + anyagok ár × szám
    if (el.prCostTotal) {
      const fmtFt = (v) => (Math.round(v)).toLocaleString("hu-HU") + " Ft";
      // Lapok típusonként
      let tilesCost = 0, tilesHasPrice = false;
      const groupsForCost = computeProjectTileNumbersByType(project);
      groupsForCost.forEach((g) => {
        const t = (project.tileTypes || []).find((x) => x.id === g.id);
        const price = t && typeof t.pricePerTile === "number" ? t.pricePerTile : 0;
        if (price > 0) {
          tilesHasPrice = true;
          const final = Math.ceil(g.needed * (1 + overage / 100));
          tilesCost += final * price;
        }
      });
      // Ragasztó
      let glueCost = 0;
      const glueKgForCost = (tn.area / 1e6) * (GLUE_KG_PER_M2[m.gluePreset] || 5) * (1 + Math.max(0, m.glueWastePct || 0) / 100);
      const gluePacks = glueKgForCost > 0 ? Math.ceil(glueKgForCost / GLUE_PACK_KG) : 0;
      if (m.gluePricePack > 0 && gluePacks > 0) glueCost = gluePacks * m.gluePricePack;
      // Fuga
      let groutCost = 0;
      if (m.groutPricePack > 0 && massKg > 0) {
        const packKg = GROUT_PACK_KG[m.groutPreset] || 5;
        const groutPacks = Math.ceil(massKg / packKg);
        groutCost = groutPacks * m.groutPricePack;
      }
      // Szilikon
      let silCost = 0;
      if (m.silPriceTube > 0 && totLen > 0) {
        const t = computeSiliconeTubes(totLen, m);
        silCost = t.tubes * m.silPriceTube;
      }
      // Élvédő
      let edgingCost = 0;
      if (m.edgingPricePerM > 0 && sil.edgingMm > 0) {
        edgingCost = (sil.edgingMm / 1000) * m.edgingPricePerM;
      }
      // UI frissítés
      el.prCostTiles.textContent = tilesHasPrice ? fmtFt(tilesCost) : "–";
      el.prCostGlue.textContent = glueCost > 0 ? fmtFt(glueCost) : "–";
      el.prCostGrout.textContent = groutCost > 0 ? fmtFt(groutCost) : "–";
      el.prCostSil.textContent = silCost > 0 ? fmtFt(silCost) : "–";
      el.prCostEdging.textContent = edgingCost > 0 ? fmtFt(edgingCost) : "–";
      const total = tilesCost + glueCost + groutCost + silCost + edgingCost;
      el.prCostTotal.textContent = total > 0 ? fmtFt(total) : "–";
    }
  }

  // Fuga: területből → térfogat (cm³) → tömeg (kg). area mm², thick mm, density g/cm³.
  function computeGroutMass(areaMm2, thicknessMm, overagePct) {
    const density = GROUT_DENSITIES[project && project.material ? project.material.groutPreset : "cg1"] || 1.5;
    const volumeCm3 = (areaMm2 * thicknessMm) / 1000; // mm²·mm = mm³ → cm³ : /1000
    const massKg = (volumeCm3 * density) / 1000;
    const finalKg = massKg * (1 + Math.max(0, overagePct || 0) / 100);
    return { areaMm2, volumeCm3, massKg, finalKg, density };
  }

