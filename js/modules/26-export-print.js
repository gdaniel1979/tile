"use strict";
  function triggerDownload(filename, url) {
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => a.remove(), 0);
  }

  function planBounds() {
    const p = state.points;
    if (p.length < 2) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    p.forEach((pt) => {
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    });
    return { minX, minY, maxX, maxY };
  }

  // A teljes terv kirajzolása egy offscreen vászonra, PNG dataURL-ként
  function buildPlanImage(maxPx) {
    const b = planBounds();
    if (!b) return null;
    const wmm = Math.max(b.maxX - b.minX, 1), hmm = Math.max(b.maxY - b.minY, 1);
    const padPx = 48;
    const scale = (maxPx - 2 * padPx) / Math.max(wmm, hmm);
    const outW = Math.round(wmm * scale) + 2 * padPx;
    const outH = Math.round(hmm * scale) + 2 * padPx;
    const off = document.createElement("canvas");
    off.width = outW; off.height = outH;

    const savedCtx = ctx, savedView = state.view;
    ctx = off.getContext("2d");
    state.view = { scale, ox: padPx - b.minX * scale, oy: padPx - b.minY * scale };
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    if (shouldDrawLayout()) drawLayout();
    drawCutouts();
    drawPolygon({ hideVertices: true });
    const url = off.toDataURL("image/png");

    ctx = savedCtx; state.view = savedView;
    render(); // a képernyő helyreállítása
    return url;
  }

  function exportPNG() {
    const url = buildPlanImage(2000);
    if (!url) { alert("Előbb rajzolj egy (zárt) alaprajzot."); return; }
    triggerDownload("lapkiosztas.png", url);
  }

  function materialNumbers() {
    if (!lastStats) return null;
    const s = lastStats;
    const usedArea = s.tilesNeeded * s.tileAreaMm2;
    const wastePct = usedArea > 0 ? (1 - s.areaMm2 / usedArea) * 100 : 0;
    const pct = Math.max(0, state.layout.overagePct || 0);
    const finalTiles = Math.ceil(s.tilesNeeded * (1 + pct / 100));
    let groutKg = null;
    if (s.groutAreaMm2 != null) {
      const base = baseTile();
      const thick = base ? (base.thicknessMm || 8) : 8;
      groutKg = computeGroutMass(s.groutAreaMm2, thick, pct).finalKg;
    }
    return { whole: s.whole, cut: s.cut, tilesNeeded: s.tilesNeeded, wastePct, pct, finalTiles, groutKg };
  }

  function groupedCutList() {
    const map = new Map();
    lastCutPieces.forEach((c) => {
      const k = fmtDim(c.w, c.h);
      map.set(k, (map.get(k) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // Egész projekt nyomtatása: összesítő + felületenkénti szakaszok
  function printPlan() {
    if (!project.surfaces.some((s) => s.points.length >= 2)) {
      alert("Előbb rajzolj legalább egy felületet.");
      return;
    }
    saveActiveSurface();
    const savedIndex = project.activeIndex;
    const sections = [];
    const agg = {};
    let totalAreaMm2 = 0;

    for (let i = 0; i < project.surfaces.length; i++) {
      project.activeIndex = i;
      loadActiveSurface();
      const s = project.surfaces[i];
      let img = null, m = null, cuts = [];
      if (s.points.length >= 2) {
        img = buildPlanImage(1000); // render → drawLayout → lastStats beáll
        m = materialNumbers();
        cuts = groupedCutList();
      }
      sections.push({ name: s.name, mode: s.mode, img, m, cuts });
      if (m && lastStats) {
        totalAreaMm2 += lastStats.areaMm2;
        const t = project.tileTypes.find((x) => x.id === s.baseId);
        if (!agg[s.baseId]) agg[s.baseId] = { name: t ? t.name : "?", tiles: 0, finalTiles: 0 };
        agg[s.baseId].tiles += m.tilesNeeded;
        agg[s.baseId].finalTiles += m.finalTiles;
      }
    }

    project.activeIndex = savedIndex;
    loadActiveSurface();
    render();
    populateProjectPrint(sections, agg, totalAreaMm2);
    setTimeout(() => window.print(), 200);
  }

  function populateProjectPrint(sections, agg, totalAreaMm2) {
    el.printImg.style.display = "none";
    const unit = state.unit;
    const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
    let html = "<h2>Összesítő</h2><table>";
    html += row("Projekt", escapeHtml(project.name));
    html += row("Felületek", project.surfaces.length + " db");
    html += row("Összes burkolt terület", (totalAreaMm2 / 1e6).toFixed(2) + " m²");
    html += "</table>";

    const keys = Object.keys(agg);
    if (keys.length) {
      html += "<h2>Lapszükséglet típusonként (egész projekt)</h2>";
      html += "<table><tr><th>Laptípus</th><th>Szükséges</th><th>Tartalékkal</th></tr>";
      keys.forEach((k) => {
        const a = agg[k];
        html += `<tr><td>${escapeHtml(a.name)}</td><td>${a.tiles} db</td><td>${a.finalTiles} db</td></tr>`;
      });
      html += "</table>";
    }

    // Anyagszükséglet: ragasztó + fuga (összes) + szilikon (sarok-hosszak, kartusok)
    const mat = project.material || defaultMaterial();
    const overage = Math.max(0, state.layout && state.layout.overagePct || 0);
    const groutKg = computeProjectGroutMass(project) * (1 + overage / 100);
    const sil = computeSiliconeForProject(project);
    const totLen = sil.horizMm + sil.vertMm;
    // Ragasztó: totalAreaMm2 (a felület-cache-ek összege)
    const totalAreaForGlue = project.surfaces.reduce((acc, s) => acc + (s.lastAreaMm2 || 0), 0);
    const glueWaste = Math.max(0, mat.glueWastePct || 0);
    const glueKgPerM2 = GLUE_KG_PER_M2[mat.gluePreset] || 5;
    const glueKg = (totalAreaForGlue / 1e6) * glueKgPerM2 * (1 + glueWaste / 100);
    if (groutKg > 0 || totLen > 0 || glueKg > 0) {
      html += "<h2>Anyagszükséglet</h2><table>";
      if (glueKg > 0) {
        const glueLbl = GLUE_LABELS[mat.gluePreset] || "Ragasztó";
        html += row("Ragasztó (" + escapeHtml(glueLbl) + ")", glueKg.toFixed(2) + " kg (+" + glueWaste + "% tartalék)");
        const gluePacks = Math.ceil(glueKg / GLUE_PACK_KG);
        html += row("Ragasztó csomag szükséglet", gluePacks + " db zsák (" + GLUE_PACK_KG + " kg)");
      }
      if (groutKg > 0) {
        const lbl = GROUT_LABELS[mat.groutPreset] || "Fuga";
        html += row("Fuga (" + escapeHtml(lbl) + ")", groutKg.toFixed(2) + " kg (+" + overage + "% tartalék)");
        const packKg = GROUT_PACK_KG[mat.groutPreset] || 5;
        const packName = GROUT_PACK_NAME[mat.groutPreset] || "csomag";
        if (packKg > 0) {
          const packs = Math.ceil(groutKg / packKg);
          html += row("Fuga csomag szükséglet", packs + " db " + escapeHtml(packName) + " (" + packKg + " kg)");
        }
      }
      if (totLen > 0) {
        const t = computeSiliconeTubes(totLen, mat);
        const fmtLen = (mm) => (mm / 1000).toFixed(2) + " m";
        if (sil.horizN) html += row("Szilikon — padló-fal sarok", fmtLen(sil.horizMm) + " (" + sil.horizN + " fal)");
        if (sil.vertN) html += row("Szilikon — fal-fal sarok", fmtLen(sil.vertMm) + " (" + sil.vertN + " sarok)");
        html += row("Szilikon összesen", fmtLen(totLen) + " · " + mat.silWidthMm + "×" + mat.silDepthMm + " mm hézag");
        html += row("Kartus szükséglet", t.tubes + " db (" + mat.silTubeMl + " ml, +" + mat.silWastePct + "% tartalék)");
      }
      if (sil.edgingN > 0) {
        const fmtLen = (mm) => (mm / 1000).toFixed(2) + " m";
        html += row("Élvédő profil", fmtLen(sil.edgingMm) + " (" + sil.edgingN + " él)");
      }
      html += "</table>";
    }

    // Költségszámítás — csak ha legalább egy ár meg van adva
    const fmtFt = (v) => (Math.round(v)).toLocaleString("hu-HU") + " Ft";
    let tilesCost = 0, anyTilePrice = false;
    const tileGroups = computeProjectTileNumbersByType(project);
    tileGroups.forEach((g) => {
      const t = (project.tileTypes || []).find((x) => x.id === g.id);
      const price = t && typeof t.pricePerTile === "number" ? t.pricePerTile : 0;
      if (price > 0) {
        anyTilePrice = true;
        const finalDb = Math.ceil(g.needed * (1 + overage / 100));
        tilesCost += finalDb * price;
      }
    });
    let glueCost = 0;
    if (mat.gluePricePack > 0 && glueKg > 0) {
      glueCost = Math.ceil(glueKg / GLUE_PACK_KG) * mat.gluePricePack;
    }
    let groutCost = 0;
    if (mat.groutPricePack > 0 && groutKg > 0) {
      const packKg = GROUT_PACK_KG[mat.groutPreset] || 5;
      groutCost = Math.ceil(groutKg / packKg) * mat.groutPricePack;
    }
    let silCost = 0;
    if (mat.silPriceTube > 0 && totLen > 0) {
      const tubes = computeSiliconeTubes(totLen, mat).tubes;
      silCost = tubes * mat.silPriceTube;
    }
    let edgingCost = 0;
    if (mat.edgingPricePerM > 0 && sil.edgingMm > 0) {
      edgingCost = (sil.edgingMm / 1000) * mat.edgingPricePerM;
    }
    const totalCost = tilesCost + glueCost + groutCost + silCost + edgingCost;
    if (totalCost > 0) {
      html += "<h2>Költségszámítás</h2><table>";
      if (anyTilePrice) html += row("Lap (típusonként)", fmtFt(tilesCost));
      if (glueCost > 0) html += row("Ragasztó", fmtFt(glueCost));
      if (groutCost > 0) html += row("Fuga", fmtFt(groutCost));
      if (silCost > 0) html += row("Szilikon", fmtFt(silCost));
      if (edgingCost > 0) html += row("Élvédő profil", fmtFt(edgingCost));
      html += row("<strong>ÖSSZESEN</strong>", "<strong>" + fmtFt(totalCost) + "</strong>");
      html += "</table>";
    }

    sections.forEach((sec) => {
      html += `<h2>${escapeHtml(sec.name)} (${sec.mode === "floor" ? "padló" : "fal"})</h2>`;
      if (sec.img) html += `<img src="${sec.img}" style="max-width:100%;border:1px solid #999" />`;
      html += '<div class="pa-grid"><div class="pa-col"><table>';
      if (sec.m) {
        html += row("Egész lap", sec.m.whole + " db");
        html += row("Vágott hely", sec.m.cut + " db");
        html += row("Szükséges lap (újrahaszn.)", sec.m.tilesNeeded + " db");
        html += row("Hulladék", sec.m.wastePct.toFixed(0) + " %");
        html += row("Lap tartalékkal (+" + sec.m.pct + "%)", sec.m.finalTiles + " db");
        if (sec.m.groutKg != null) {
          html += row("Fuga", sec.m.groutKg.toFixed(2) + " kg");
        }
      } else {
        html += row("Kiosztás", "nincs");
      }
      html += '</table></div><div class="pa-col"><strong>Vágási lista (' + unit + ")</strong>";
      if (sec.cuts && sec.cuts.length) {
        html += "<table><tr><th>Méret</th><th>Darab</th></tr>";
        sec.cuts.forEach(([k, n]) => { html += `<tr><td>${k}</td><td>${n} db</td></tr>`; });
        html += "</table>";
      } else {
        html += "<p>—</p>";
      }
      html += "</div></div>";
    });
    el.printInfo.innerHTML = html;
  }

  const safeFile = (s) => (s || "terv").replace(/[^\w\-]+/g, "_");

  function saveProjectJSON() {
    const blob = new Blob([JSON.stringify(serializeProject(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    triggerDownload(safeFile(project.name) + ".json", url);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function saveStoreJSON() {
    const blob = new Blob([JSON.stringify(serializeStore(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    triggerDownload("osszes-projekt.json", url);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function loadJSONFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (d && Array.isArray(d.projects)) {
          // teljes tár visszaállítása
          if (!confirm("Teljes tár betöltése: ez lecseréli a jelenlegi projektjeidet. Folytatod?")) return;
          store = normalizeStore(d);
          project = activeProject();
          loadActiveSurface();
          refreshAll();
        } else if (d && Array.isArray(d.surfaces)) {
          // egyetlen projekt hozzáadása új projektként
          const p = normalizeProject(d);
          p.id = newProjectId(); // ütközés elkerülése
          store.projects.push(p);
          store.activeProjectId = p.id;
          project = p;
          loadActiveSurface();
          refreshAll();
        } else {
          alert("Ismeretlen fájlformátum.");
        }
      } catch (e) {
        alert("Hibás vagy sérült fájl.");
      }
    };
    r.readAsText(file);
  }

