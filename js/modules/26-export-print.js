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
  // opts.codes: a vágott darabokon a vágási terv kódja is (PDF-hez)
  // opts.jpeg: JPEG a PNG helyett (a közvetlen PDF-hez: a jsPDF átalakítás nélkül beágyazza)
  function buildPlanImage(maxPx, opts) {
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
    if (shouldDrawLayout()) drawLayout(opts);
    drawCutouts();
    drawPolygon({ hideVertices: true });
    const url = opts && opts.jpeg ? off.toDataURL("image/jpeg", 0.92) : off.toDataURL("image/png");

    ctx = savedCtx; state.view = savedView;
    render(); // a képernyő helyreállítása
    return { url, w: outW, h: outH };
  }

  function exportPNG() {
    const img = buildPlanImage(2000, { codes: !!state.layout.showCodes });
    if (!img) { alert("Előbb rajzolj egy (zárt) alaprajzot."); return; }
    triggerDownload("lapkiosztas.png", img.url);
  }

  function materialNumbers() {
    if (!lastStats) return null;
    const s = lastStats;
    const usedArea = s.tilesNeeded * s.tileAreaMm2;
    const wastePct = usedArea > 0 ? (1 - s.areaMm2 / usedArea) * 100 : 0;
    const pct = overagePct();
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
      const k = c.text || fmtDim(c.w, c.h); // ferdén vágott darabnál a sarkokkal együtt
      map.set(k, (map.get(k) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ---- A projekt-terv adatai (közös: nyomtatás és közvetlen PDF) ------------------
  // Felületenként: rajz (PNG), anyagszámok, vágási lista, vágási terv; plusz a
  // típusonkénti összesítés. null, ha még nincs egy felület sem.
  function collectPlanData(imgOpts) {
    if (!project.surfaces.some((s) => s.points.length >= 2)) return null;
    saveActiveSurface();
    const savedIndex = project.activeIndex;
    const sections = [];
    const agg = {};
    let totalAreaMm2 = 0;

    for (let i = 0; i < project.surfaces.length; i++) {
      project.activeIndex = i;
      loadActiveSurface();
      const s = project.surfaces[i];
      let img = null, m = null, cuts = [], plan = null;
      if (s.points.length >= 2) {
        img = buildPlanImage(1000, Object.assign({ codes: true, compact: true }, imgOpts)); // render → drawLayout → lastStats beáll
        m = materialNumbers();
        cuts = groupedCutList();
        const res = canComputeLayout() ? getLayout() : null;
        if (res && res.stats) plan = { cutPlan: res.cutPlan, labels: res.cutLabels };
      }
      sections.push({ name: s.name, mode: s.mode, img, m, cuts, plan });
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
    return { sections, agg, totalAreaMm2 };
  }

  // Összesítő táblázatok, egyszerű szöveges sorokkal: [{ title, head?, rows, strongLast? }]
  function planSummaryTables(data) {
    const { agg, totalAreaMm2 } = data;
    const tables = [{ title: "Összesítő", rows: [
      ["Projekt", project.name],
      ["Felületek", project.surfaces.length + " db"],
      ["Összes burkolt terület", (totalAreaMm2 / 1e6).toFixed(2) + " m²"],
    ] }];

    const keys = Object.keys(agg);
    if (keys.length) {
      tables.push({ title: "Lapszükséglet típusonként (egész projekt)", head: ["Laptípus", "Szükséges", "Tartalékkal"],
        rows: keys.map((k) => [agg[k].name, agg[k].tiles + " db", agg[k].finalTiles + " db"]) });
    }

    // Anyagszükséglet: ragasztó + fuga (összes) + szilikon (sarok-hosszak, kartusok)
    const mat = project.material || defaultMaterial();
    const overage = overagePct();
    const groutKg = computeProjectGroutMass(project) * (1 + overage / 100);
    const sil = computeSiliconeForProject(project);
    const totLen = sil.horizMm + sil.vertMm;
    // Ragasztó: a felület-cache-ek területének összege
    const totalAreaForGlue = project.surfaces.reduce((acc, s) => acc + (s.lastAreaMm2 || 0), 0);
    const glueWaste = Math.max(0, mat.glueWastePct || 0);
    const glueKgPerM2 = GLUE_KG_PER_M2[mat.gluePreset] || 5;
    const glueKg = (totalAreaForGlue / 1e6) * glueKgPerM2 * (1 + glueWaste / 100);
    const fmtLen = (mm) => (mm / 1000).toFixed(2) + " m";
    const matRows = [];
    if (glueKg > 0) {
      const glueLbl = GLUE_LABELS[mat.gluePreset] || "Ragasztó";
      matRows.push(["Ragasztó (" + glueLbl + ")", glueKg.toFixed(2) + " kg (+" + glueWaste + "% tartalék)"]);
      matRows.push(["Ragasztó csomag szükséglet", Math.ceil(glueKg / GLUE_PACK_KG) + " db zsák (" + GLUE_PACK_KG + " kg)"]);
    }
    if (groutKg > 0) {
      const lbl = GROUT_LABELS[mat.groutPreset] || "Fuga";
      matRows.push(["Fuga (" + lbl + ")", groutKg.toFixed(2) + " kg (+" + overage + "% tartalék)"]);
      const packKg = GROUT_PACK_KG[mat.groutPreset] || 5;
      const packName = GROUT_PACK_NAME[mat.groutPreset] || "csomag";
      if (packKg > 0) matRows.push(["Fuga csomag szükséglet", Math.ceil(groutKg / packKg) + " db " + packName + " (" + packKg + " kg)"]);
    }
    if (totLen > 0) {
      const t = computeSiliconeTubes(totLen, mat);
      if (sil.horizN) matRows.push(["Szilikon — padló-fal sarok", fmtLen(sil.horizMm) + " (" + sil.horizN + " fal)"]);
      if (sil.vertN) matRows.push(["Szilikon — fal-fal sarok", fmtLen(sil.vertMm) + " (" + sil.vertN + " sarok)"]);
      matRows.push(["Szilikon összesen", fmtLen(totLen) + " · " + mat.silWidthMm + "×" + mat.silDepthMm + " mm hézag"]);
      matRows.push(["Kartus szükséglet", t.tubes + " db (" + mat.silTubeMl + " ml, +" + mat.silWastePct + "% tartalék)"]);
    }
    if (sil.edgingN > 0) matRows.push(["Élvédő profil", fmtLen(sil.edgingMm) + " (" + sil.edgingN + " él)"]);
    if (matRows.length) tables.push({ title: "Anyagszükséglet", rows: matRows });

    // Költségszámítás — csak ha legalább egy ár meg van adva
    const fmtFt = (v) => (Math.round(v)).toLocaleString("hu-HU") + " Ft";
    const costs = computeProjectCosts(project);
    const sumOf = (kind) => costs.lines.filter((l) => l.kind === kind).reduce((a, l) => a + l.total, 0);
    const anyTilePrice = costs.lines.some((l) => l.kind === "tiles" && l.unitPrice > 0);
    const tilesCost = sumOf("tiles"), glueCost = sumOf("glue"), groutCost = sumOf("grout");
    const silCost = sumOf("silicone"), edgingCost = sumOf("edging");
    const totalCost = tilesCost + glueCost + groutCost + silCost + edgingCost;
    if (totalCost > 0) {
      const rows = [];
      if (anyTilePrice) rows.push(["Lap (típusonként)", fmtFt(tilesCost)]);
      if (glueCost > 0) rows.push(["Ragasztó", fmtFt(glueCost)]);
      if (groutCost > 0) rows.push(["Fuga", fmtFt(groutCost)]);
      if (silCost > 0) rows.push(["Szilikon", fmtFt(silCost)]);
      if (edgingCost > 0) rows.push(["Élvédő profil", fmtFt(edgingCost)]);
      rows.push(["ÖSSZESEN", fmtFt(totalCost)]);
      tables.push({ title: "Költségszámítás", rows, strongLast: true });
    }
    return tables;
  }

  // Egy felület számai a tervben
  function sectionRows(sec) {
    if (!sec.m) return [["Kiosztás", "nincs"]];
    const rows = [
      ["Egész lap", sec.m.whole + " db"],
      ["Vágott hely", sec.m.cut + " db"],
      ["Szükséges lap (újrahaszn.)", sec.m.tilesNeeded + " db"],
      ["Hulladék", sec.m.wastePct.toFixed(0) + " %"],
      ["Lap tartalékkal (+" + sec.m.pct + "%)", sec.m.finalTiles + " db"],
    ];
    if (sec.m.groutKg != null) rows.push(["Fuga", sec.m.groutKg.toFixed(2) + " kg"]);
    return rows;
  }
  // Magas/keskeny rajznál a táblázatok a kép mellé kerülnek, különben alá
  function sectionSideLayout(img) {
    const PAGE_W_MM = 180, PAGE_H_MM = 250, TABLES_MIN_H_MM = 90;
    return !!(img && img.w && img.h && PAGE_W_MM * (img.h / img.w) > (PAGE_H_MM - TABLES_MIN_H_MM));
  }
  function cutPlanNoteText() {
    return "A kódok a rajzon lévő feliratokkal egyeznek (pl. 3a = a 3. lapból vágott „a” darab). " +
      "Szaggatott keret: felhasználható maradék · vonalkázott: hulladék · ↻: a lapból 90°-kal elforgatva vágandó" +
      (project.factoryEdges !== false ? " · vastag kék él: gyári él, a szomszédos lap felé kerül (a vékony, vágott él a falhoz/kivágáshoz)" : "") + ".";
  }

  // Egész projekt nyomtatása (a böngésző nyomtatási ablakával)
  function printPlan() {
    const data = collectPlanData();
    if (!data) { alert("Előbb rajzolj legalább egy felületet."); return; }
    populateProjectPrint(data);
    setTimeout(() => window.print(), 200);
  }

  function populateProjectPrint(data) {
    el.printImg.style.display = "none";
    if (el.printTitle) el.printTitle.hidden = false; // az árajánlat elrejti
    const e = escapeHtml;
    const tableHtml = (t) => {
      let h = "<table>";
      if (t.head) h += "<tr>" + t.head.map((x) => "<th>" + e(x) + "</th>").join("") + "</tr>";
      t.rows.forEach((r, i) => {
        const strong = t.strongLast && i === t.rows.length - 1;
        h += "<tr>" + r.map((x) => "<td>" + (strong ? "<strong>" + e(x) + "</strong>" : e(x)) + "</td>").join("") + "</tr>";
      });
      return h + "</table>";
    };
    let html = "";
    planSummaryTables(data).forEach((t) => { html += "<h2>" + e(t.title) + "</h2>" + tableHtml(t); });

    data.sections.forEach((sec) => {
      html += '<div class="pa-section">';
      html += `<h2>${e(sec.name)} (${sec.mode === "floor" ? "padló" : "fal"})</h2>`;
      html += '<div class="pa-body ' + (sectionSideLayout(sec.img) ? "pa-body-side" : "pa-body-stack") + '">';
      if (sec.img) html += `<img src="${sec.img.url}" />`;
      html += '<div class="pa-tables"><div class="pa-grid"><div class="pa-col">' + tableHtml({ rows: sectionRows(sec) });
      html += '</div><div class="pa-col"><strong>Vágási lista (' + state.unit + ")</strong>";
      html += sec.cuts && sec.cuts.length
        ? tableHtml({ head: ["Méret", "Darab"], rows: sec.cuts.map(([k, n]) => [k, n + " db"]) })
        : "<p>—</p>";
      html += '</div></div></div>'; // pa-col, pa-grid, pa-tables vége
      html += '</div>'; // pa-body vége
      html += cutPlanHtml(sec.plan);
      html += '</div>'; // pa-section vége
    });
    el.printInfo.innerHTML = html;
  }

  // ---- Vágási terv (PDF) --------------------------------------------------
  // Laponként méretarányos ábra: a kivágandó darabok a kódjukkal, a
  // felhasználható maradék szaggatott kerettel, a hulladék vonalkázva. A lapok
  // száma megegyezik a „Szükséges lap (újrahaszn.)” vágott lapokra eső részével.
  function cutPlanHtml(plan) {
    if (!plan || !plan.cutPlan || !plan.cutPlan.length) return "";
    let html = '<div class="pa-cutplan"><h3>Vágási terv (' + state.unit + ")</h3>";
    html += '<p class="pa-note">A kódok a rajzon lévő feliratokkal egyeznek (pl. <strong>3a</strong> = a 3. lapból vágott „a” darab). ' +
      "Szaggatott keret: felhasználható maradék · vonalkázott: hulladék · ↻: a lapból 90°-kal elforgatva vágandó" +
      (project.factoryEdges !== false ? " · <strong>vastag kék él</strong>: gyári él, a szomszédos lap felé kerül (a vékony, vágott él a falhoz/kivágáshoz)" : "") + ".</p>";
    plan.cutPlan.forEach((p) => {
      const t = (project.tileTypes || []).find((x) => x.id === p.typeId);
      html += `<h4>${escapeHtml(t ? t.name : "lap")} · ${fmtDim(p.tileW, p.tileH)} · ${p.tiles.length} lap vágáshoz</h4>`;
      html += '<div class="cp-grid">';
      p.tiles.forEach((tile) => { html += cutTileCard(tile, p.tileW, p.tileH, plan.labels); });
      html += "</div>";
    });
    return html + "</div>";
  }

  function cutTileCard(tile, W, H, labels) {
    const sw = Math.max(W, H) * 0.008;   // vonalvastagság (lap-mm-ben)
    const fs = Math.min(W, H) * 0.17;    // betűméret
    const hid = "cpH" + tile.no;         // saját vonalkázás-minta minden ábrához
    const hs = Math.min(W, H) * 0.07;
    let svg = `<svg viewBox="${-sw} ${-sw} ${W + 2 * sw} ${H + 2 * sw}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><pattern id="${hid}" patternUnits="userSpaceOnUse" width="${hs}" height="${hs}" patternTransform="rotate(45)">` +
      `<rect width="${hs}" height="${hs}" fill="#fff"/><line x1="0" y1="0" x2="0" y2="${hs}" stroke="#999" stroke-width="${sw * 0.8}"/></pattern></defs>` +
      `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#${hid})" stroke="#222" stroke-width="${sw}"/>`;
    // felhasználható maradékok (1 cm-nél keskenyebb csík hulladék)
    (tile.free || []).forEach((o) => {
      if (Math.min(o.w, o.h) < 10) return;
      svg += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="#fff" stroke="#666" stroke-width="${sw}" stroke-dasharray="${sw * 4} ${sw * 3}"/>`;
    });
    const rot90 = (pc) => pc.rot === 90 || pc.rot === 270;
    const feOn = project.factoryEdges !== false, fw = sw * 3.2;
    const feLine = (ax, ay, bx, by) => `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#1f5fbf" stroke-width="${fw}" stroke-linecap="square"/>`;
    tile.pieces.forEach((pc) => {
      let lx = pc.x + pc.w / 2, ly = pc.y + pc.h / 2, room = Math.min(pc.w, pc.h);
      if (pc.poly && pc.poly.length >= 3) {
        // valódi alakú darab (átlós / 45°-os minta): sokszög; a lap szélére eső
        // oldalai gyári élek (a darab a lapon belül csak fordul, nem csúszik)
        svg += `<polygon points="${pc.poly.map((q) => q.x.toFixed(1) + "," + q.y.toFixed(1)).join(" ")}" fill="#dce7f3" stroke="#222" stroke-width="${sw}" stroke-linejoin="round"/>`;
        if (feOn) {
          const onB = (a, b) => (Math.abs(a.x) < 0.6 && Math.abs(b.x) < 0.6) || (Math.abs(a.y) < 0.6 && Math.abs(b.y) < 0.6) ||
            (Math.abs(a.x - W) < 0.6 && Math.abs(b.x - W) < 0.6) || (Math.abs(a.y - H) < 0.6 && Math.abs(b.y - H) < 0.6);
          pc.poly.forEach((a, k) => { const b = pc.poly[(k + 1) % pc.poly.length]; if (onB(a, b) && Math.hypot(b.x - a.x, b.y - a.y) > 0.6) svg += feLine(a.x, a.y, b.x, b.y); });
        }
        // felirat a súlypontba
        let A = 0, cx = 0, cy = 0;
        pc.poly.forEach((a, k) => { const b = pc.poly[(k + 1) % pc.poly.length], cr = a.x * b.y - b.x * a.y; A += cr; cx += (a.x + b.x) * cr; cy += (a.y + b.y) * cr; });
        if (Math.abs(A) > 1e-6) { lx = cx / (3 * A); ly = cy / (3 * A); room = Math.sqrt(Math.abs(A) / 2) * 0.8; }
      } else {
        svg += `<rect x="${pc.x}" y="${pc.y}" width="${pc.w}" height="${pc.h}" fill="#dce7f3" stroke="#222" stroke-width="${sw}"/>`;
        // gyári élt igénylő oldalak (a szomszédos lap felé kerülnek): vastag vonal
        const fe = pc.fe || {}, x0 = pc.x, y0 = pc.y, x1 = pc.x + pc.w, y1 = pc.y + pc.h;
        [[fe.t, x0, y0, x1, y0], [fe.r, x1, y0, x1, y1], [fe.b, x0, y1, x1, y1], [fe.l, x0, y0, x0, y1]].forEach(([on, ax, ay, bx, by]) => {
          if (on) svg += feLine(ax, ay, bx, by);
        });
      }
      if (room > fs * 1.15) {
        svg += `<text x="${lx}" y="${ly}" font-size="${fs}" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif">${pc.code}${rot90(pc) ? " ↻" : ""}</text>`;
      }
    });
    svg += "</svg>";
    // a méret a darab SAJÁT tájolásában (ahogy a rajzon áll; halszálkánál a
    // fekvő lap-keretben); ↻ = a lapból 90°-kal elforgatva vágandó.
    // L-darabnál a teljes „L a×b / c×d” felirat.
    const cap = tile.pieces.map((pc) => {
      const t = (labels[pc.li] && labels[pc.li].text) || "";
      const w = rot90(pc) ? pc.h : pc.w, h = rot90(pc) ? pc.w : pc.h;
      const lab = labels[pc.li] || {};
      const dim = lab.corners || lab.tri ? pieceDimText(lab, rot90(pc) !== !!lab.swap) : t.startsWith("L ") ? t : (t.startsWith("~") ? "~" : "") + fmtDim(w, h);
      return `<strong>${pc.code}</strong> ${escapeHtml(dim)}${rot90(pc) ? " ↻ (forgatva)" : ""}`;
    }).join("<br>");
    // fekvő lapnál alacsonyabb ábra, hogy ne maradjon üres sáv alatta-felette
    const hMm = Math.min(30, 26 * H / W).toFixed(1);
    return `<div class="cp-card"><div class="cp-fig" style="height:${hMm}mm">${svg}</div>` +
      `<div class="cp-cap"><span class="cp-no">${tile.no}. lap</span><br>${cap}</div></div>`;
  }

  function saveStoreJSON() {
    const blob = new Blob([JSON.stringify(serializeStore(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    triggerDownload("osszes-projekt.json", url);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

