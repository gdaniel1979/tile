"use strict";
  // ---- Közvetlen PDF-mentés (vektoros) -------------------------------------------
  // A PDF terv és az árajánlat közvetlenül PDF-fájlba menthető, a böngésző nyomtatási
  // ablaka nélkül. A jsPDF (MIT) és a Noto Sans betű (SIL OFL, magyar ékezetekhez
  // szűkítve) helyi fájl: csak az első PDF-nél töltődik be, és offline is működik
  // (a service worker gyorsítótárazza). A tartalmat ugyanazok az adat-függvények adják,
  // mint a nyomtatást (collectPlanData / planSummaryTables / quoteDocData).
  const PDF_LIB_URL = "js/vendor/jspdf.umd.min.js";
  const PDF_FONTS = { normal: "fonts/NotoSans-Regular.ttf", bold: "fonts/NotoSans-Bold.ttf" };
  let pdfLibPromise = null, pdfFontData = null;

  function loadPdfLib() {
    if (window.jspdf) return Promise.resolve();
    if (!pdfLibPromise) {
      pdfLibPromise = new Promise((resolve, reject) => {
        const sc = document.createElement("script");
        sc.src = PDF_LIB_URL;
        sc.onload = () => resolve();
        sc.onerror = () => { pdfLibPromise = null; reject(new Error("A PDF-könyvtár nem tölthető be.")); };
        document.head.appendChild(sc);
      });
    }
    return pdfLibPromise;
  }
  async function loadPdfFonts() {
    if (pdfFontData) return pdfFontData;
    const out = {};
    for (const [style, url] of Object.entries(PDF_FONTS)) {
      const r = await fetch(url);
      if (!r.ok) throw new Error("A betűtípus nem tölthető be: " + url);
      const bytes = new Uint8Array(await r.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      out[style] = btoa(bin);
    }
    return (pdfFontData = out);
  }

  // ---- Egyszerű lapozó író (mm, A4 álló) ------------------------------------------------
  const PAGE_W = 210, PAGE_H = 297, MARGIN = 15, FOOT_H = 8;
  const CONTENT_W = PAGE_W - 2 * MARGIN;
  const PT = 0.3528; // 1 pt mm-ben
  // a betűkészletből hiányzó jelek (keskeny szóköz a hu-HU számformátumban, ↻)
  const pdfText = (s) => String(s == null ? "" : s).replace(/[   ]/g, " ").replace(/↻/g, "");

  async function newPdfDoc(title) {
    await loadPdfLib();
    const fonts = await loadPdfFonts();
    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    doc.addFileToVFS("NotoSans-Regular.ttf", fonts.normal);
    doc.addFont("NotoSans-Regular.ttf", "Noto", "normal");
    doc.addFileToVFS("NotoSans-Bold.ttf", fonts.bold);
    doc.addFont("NotoSans-Bold.ttf", "Noto", "bold");
    doc.setFont("Noto", "normal");
    doc.setProperties({ title, creator: "Lapkiosztás tervező" });
    doc.setLineJoin("round");
    const w = { doc, y: MARGIN };
    w.font = (size, bold, color) => {
      doc.setFont("Noto", bold ? "bold" : "normal");
      doc.setFontSize(size);
      const c = color || [0, 0, 0];
      doc.setTextColor(c[0], c[1], c[2]);
    };
    w.newPage = () => { doc.addPage(); w.y = MARGIN; };
    w.ensure = (h) => { if (w.y + h > PAGE_H - MARGIN - FOOT_H) { w.newPage(); return true; } return false; };
    w.lineH = (size) => size * PT * 1.35;
    // tördelt bekezdés; visszaadja a magasságát
    w.para = (text, size, opts) => {
      const o = opts || {};
      w.font(size, o.bold, o.color);
      const lines = doc.splitTextToSize(pdfText(text), o.width || CONTENT_W);
      const lh = w.lineH(size);
      lines.forEach((ln) => {
        w.ensure(lh);
        doc.text(ln, o.x != null ? o.x : MARGIN, w.y + size * PT, { baseline: "alphabetic" });
        w.y += lh;
      });
      w.y += o.after != null ? o.after : 1.5;
    };
    w.heading = (text, size, before) => {
      w.y += before != null ? before : 3;
      w.ensure(w.lineH(size) + 12); // ne maradjon cím a lap alján egyedül
      w.para(text, size, { bold: true, after: 1.5 });
    };
    return w;
  }

  // Táblázat: cols = [{ w (mm), align }] vagy auto; head opcionális; strongRows: Set(index)
  function pdfTable(w, rows, opts) {
    const o = opts || {};
    const doc = w.doc;
    const x0 = o.x != null ? o.x : MARGIN;
    const width = o.width || CONTENT_W;
    const n = (o.head || rows[0] || []).length;
    const cols = o.cols || Array.from({ length: n }, () => ({ w: width / n }));
    const size = o.size || 9;
    const padX = 1.8, padY = 1.2;
    const lh = w.lineH(size);
    const drawRow = (cells, style) => {
      w.font(size, style.bold);
      const wrapped = cells.map((c, i) => doc.splitTextToSize(pdfText(c), cols[i].w - 2 * padX));
      const h = Math.max(...wrapped.map((l) => l.length)) * lh + 2 * padY;
      if (w.ensure(h) && o.head && !style.head) drawRow(o.head, { head: true, bold: true, fill: [238, 238, 238] });
      let x = x0;
      const rowW = cols.reduce((a, c) => a + c.w, 0);
      if (style.fill) { doc.setFillColor(...style.fill); doc.rect(x0, w.y, rowW, h, "F"); }
      doc.setDrawColor(187, 187, 187); doc.setLineWidth(0.2);
      w.font(size, style.bold);
      cells.forEach((c, i) => {
        if (style.span && i > 0) return;
        const cw = style.span ? rowW : cols[i].w;
        doc.rect(x, w.y, cw, h, "S");
        const lines = style.span ? doc.splitTextToSize(pdfText(c), cw - 2 * padX) : wrapped[i];
        const al = (!style.span && cols[i].align) || "left";
        lines.forEach((ln, k) => {
          const ty = w.y + padY + size * PT + k * lh;
          if (al === "right") doc.text(ln, x + cw - padX, ty, { align: "right" });
          else doc.text(ln, x + padX, ty);
        });
        x += cw;
      });
      w.y += h;
    };
    if (o.head) drawRow(o.head, { head: true, bold: true, fill: [238, 238, 238] });
    rows.forEach((r, i) => {
      const st = (o.rowStyle && o.rowStyle(r, i)) || {};
      drawRow(r, { bold: st.bold || (o.strongLast && i === rows.length - 1), fill: st.fill, span: st.span });
    });
    w.y += o.after != null ? o.after : 3;
  }

  function pdfFooters(w, label) {
    const doc = w.doc, n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      w.font(7.5, false, [110, 110, 110]);
      doc.text(pdfText(label), MARGIN, PAGE_H - MARGIN + 3);
      doc.text(i + " / " + n, PAGE_W - MARGIN, PAGE_H - MARGIN + 3, { align: "right" });
    }
  }

  // ---- Mentés: Windows mentés-ablak (File System Access) vagy letöltés --------------------
  const pdfFileName = (s) => ((s || "terv").replace(/[\\/:*?"<>|]+/g, "_").trim() || "terv") + ".pdf";
  async function savePdfBlob(blob, name) {
    if (typeof window.showSaveFilePicker === "function" && window.isSecureContext) {
      let h;
      try {
        h = await window.showSaveFilePicker({ id: "pdf", suggestedName: name, types: [{ description: "PDF-dokumentum", accept: { "application/pdf": [".pdf"] } }] });
      } catch (e) {
        if (e && e.name === "AbortError") return false;
        throw e;
      }
      const wr = await h.createWritable();
      await wr.write(blob);
      await wr.close();
      return true;
    }
    const url = URL.createObjectURL(blob);
    triggerDownload(name, url);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }
  async function runPdfExport(btn, build) {
    const lbl = btn && btn.querySelector("span");
    const old = lbl && lbl.textContent;
    if (btn) btn.disabled = true;
    if (lbl) lbl.textContent = "PDF készül…";
    document.body.style.cursor = "progress";
    try {
      await new Promise((r) => setTimeout(r, 30)); // a felirat kirajzolódjon
      const res = await build();
      if (res) await savePdfBlob(res.blob, res.name);
    } catch (e) {
      console.error(e);
      alert("A PDF nem készült el: " + (e && e.message || e));
    } finally {
      if (btn) btn.disabled = false;
      if (lbl) lbl.textContent = old;
      document.body.style.cursor = "";
    }
  }

  // ---- PDF terv -------------------------------------------------------------------------------
  async function buildPlanPdf() {
    const data = collectPlanData({ jpeg: true });
    if (!data) { alert("Előbb rajzolj legalább egy felületet."); return null; }
    const title = (project.name || "Projekt") + " — lapkiosztási terv";
    const w = await newPdfDoc(title);
    const doc = w.doc;
    w.para("Lapkiosztási terv", 18, { bold: true, after: 0.5 });
    w.para((project.name || "Projekt") + " · " + new Date().toLocaleDateString("hu-HU"), 10, { color: [90, 90, 90], after: 3 });

    planSummaryTables(data).forEach((t) => {
      w.heading(t.title, 12);
      const n = (t.head || t.rows[0]).length;
      const cols = n === 2 ? [{ w: 80 }, { w: CONTENT_W - 80 }] : [{ w: 90 }, { w: 45, align: "right" }, { w: CONTENT_W - 135, align: "right" }];
      pdfTable(w, t.rows, { head: t.head, cols, strongLast: t.strongLast });
    });

    data.sections.forEach((sec) => {
      w.newPage();
      w.para(sec.name + " (" + (sec.mode === "floor" ? "padló" : "fal") + ")", 14, { bold: true, after: 2 });
      const side = sectionSideLayout(sec.img);
      const cutRows = (sec.cuts || []).map(([k, n]) => [k, n + " db"]);
      const unitTitle = "Vágási lista (" + state.unit + ")";
      if (sec.img) {
        const ratio = sec.img.h / sec.img.w;
        let iw, ih;
        if (side) { ih = Math.min(PAGE_H - MARGIN - FOOT_H - w.y, 220); iw = Math.min(ih / ratio, CONTENT_W * 0.62); ih = iw * ratio; }
        else { iw = CONTENT_W; ih = iw * ratio; const maxH = PAGE_H - MARGIN - FOOT_H - w.y - 60; if (ih > maxH) { ih = maxH; iw = ih / ratio; } }
        const top = w.y;
        doc.addImage(sec.img.url, "JPEG", MARGIN, top, iw, ih);
        doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.2); doc.rect(MARGIN, top, iw, ih);
        if (side) {
          // táblázatok a kép mellé
          const tx = MARGIN + iw + 6, tw = CONTENT_W - iw - 6;
          w.y = top;
          pdfTable(w, sectionRows(sec), { x: tx, width: tw, cols: [{ w: tw * 0.62 }, { w: tw * 0.38, align: "right" }], size: 8.5 });
          w.para(unitTitle, 9, { bold: true, x: tx, width: tw, after: 1 });
          if (cutRows.length) pdfTable(w, cutRows, { x: tx, width: tw, head: ["Méret", "Darab"], cols: [{ w: tw * 0.62 }, { w: tw * 0.38, align: "right" }], size: 8.5 });
          else w.para("—", 9, { x: tx });
          w.y = Math.max(w.y, top + ih + 4);
        } else {
          w.y = top + ih + 5;
          sectionTablesStacked(w, sec, cutRows, unitTitle);
        }
      } else {
        sectionTablesStacked(w, sec, cutRows, unitTitle);
      }
      if (sec.plan && sec.plan.cutPlan && sec.plan.cutPlan.length) drawCutPlanPdf(w, sec.plan);
    });

    pdfFooters(w, (project.name || "Projekt") + " — lapkiosztási terv");
    return { blob: doc.output("blob"), name: pdfFileName((project.name || "Projekt") + " - lapkiosztási terv") };
  }

  // a felület számai és a vágási lista egymás mellett, két oszlopban
  function sectionTablesStacked(w, sec, cutRows, unitTitle) {
    const colW = (CONTENT_W - 8) / 2;
    w.ensure(30);
    const top = w.y, pages0 = w.doc.getNumberOfPages();
    pdfTable(w, sectionRows(sec), { width: colW, cols: [{ w: colW * 0.65 }, { w: colW * 0.35, align: "right" }], size: 9 });
    const leftEnd = w.y;
    // a jobb oszlop ugyanonnan indul (ha a bal oszlop nem lapozott át)
    if (w.doc.getNumberOfPages() === pages0) w.y = top;
    const x = MARGIN + colW + 8;
    w.para(unitTitle, 9, { bold: true, x, width: colW, after: 1 });
    if (cutRows.length) pdfTable(w, cutRows, { x, width: colW, head: ["Méret", "Darab"], cols: [{ w: colW * 0.65 }, { w: colW * 0.35, align: "right" }], size: 9 });
    else w.para("—", 9, { x });
    w.y = Math.max(w.y, leftEnd);
  }

  // ---- Vágási terv: laponként méretarányos ábra (vektoros) -------------------------------
  const CARD_W = 26, CARD_GAP_X = 4, CARD_GAP_Y = 3;
  function drawCutPlanPdf(w, plan) {
    const perRow = Math.floor((CONTENT_W + CARD_GAP_X) / (CARD_W + CARD_GAP_X));
    // laptípusonként a kártya-sorok előre (a címek ne maradjanak az oldal alján egyedül)
    const groups = plan.cutPlan.map((p) => {
      const rows = [];
      for (let i = 0; i < p.tiles.length; i += perRow) {
        const cards = p.tiles.slice(i, i + perRow).map((tile) => cutCardLayout(w, tile, p.tileW, p.tileH, plan.labels));
        rows.push({ cards, h: Math.max(...cards.map((c) => c.h)) });
      }
      return { p, rows };
    });
    const typeHeadH = w.lineH(8.5) + 3.5;
    const firstH = groups.length && groups[0].rows.length ? groups[0].rows[0].h : 0;
    w.ensure(w.lineH(11) + 4 + 12 + typeHeadH + firstH); // cím + magyarázat + első laptípus első sora
    w.heading("Vágási terv (" + state.unit + ")", 11, 4);
    w.para(cutPlanNoteText().replace("↻:", "környíl:"), 7.5, { color: [68, 68, 68], after: 2 });
    groups.forEach(({ p, rows }) => {
      const t = (project.tileTypes || []).find((x) => x.id === p.typeId);
      w.ensure(typeHeadH + (rows.length ? rows[0].h : 0));
      w.heading((t ? t.name : "lap") + " · " + fmtDim(p.tileW, p.tileH) + " · " + p.tiles.length + " lap vágáshoz", 8.5, 2);
      rows.forEach((row) => {
        w.ensure(row.h);
        row.cards.forEach((c, k) => c.draw(MARGIN + k * (CARD_W + CARD_GAP_X), w.y));
        w.y += row.h + CARD_GAP_Y;
      });
    });
  }

  // Egy lap kártyája: méretarányos ábra + felirat; visszaadja a magasságát és a rajzolót
  function cutCardLayout(w, tile, W, H, labels) {
    const doc = w.doc;
    const figH = Math.min(30, 26 * H / W);
    const s = Math.min(CARD_W / W, figH / H);   // mm / lap-mm
    const fw = W * s, fh = H * s;
    const rot90 = (pc) => pc.rot === 90 || pc.rot === 270;
    const capSize = 6.4, lh = w.lineH(capSize);
    const caps = tile.pieces.map((pc) => {
      const t = (labels[pc.li] && labels[pc.li].text) || "";
      const pw = rot90(pc) ? pc.h : pc.w, ph = rot90(pc) ? pc.w : pc.h;
      const dim = t.startsWith("L ") ? t : (t.startsWith("~") ? "~" : "") + fmtDim(pw, ph);
      return { code: String(pc.code), rest: " " + dim + (rot90(pc) ? " (forgatva)" : "") };
    });
    // a felirat-sorok előre tördelve (kód félkövér, a többi normál)
    const capLines = [];
    caps.forEach((c) => {
      w.font(capSize, true);
      const cw = doc.getTextWidth(c.code);
      w.font(capSize, false);
      const parts = doc.splitTextToSize(pdfText(c.rest.trim()), CARD_W - cw - 0.8);
      parts.forEach((ln, k) => capLines.push({ code: k === 0 ? c.code : "", cw, text: (k === 0 ? " " : "") + ln, indent: k === 0 ? 0 : cw + 0.8 }));
    });
    const h = figH + 1.2 + lh * (1 + capLines.length);

    const draw = (x, y) => {
      const X = (v) => x + v * s, Y = (v) => y + v * s;
      const sw = 0.18;
      // a lap: fehér + 45°-os vonalkázás (hulladék), fölötte a maradék és a darabok
      doc.setFillColor(255, 255, 255); doc.rect(x, y, fw, fh, "F");
      doc.setDrawColor(153, 153, 153); doc.setLineWidth(0.12);
      const step = 1.6; // mm
      for (let c = -fh; c < fw; c += step) {
        // x - y = c egyenes a lap téglalapjában (a lap-koordinátákban lefelé nő az y)
        const x1 = Math.max(0, c), y1 = x1 - c;
        const x2 = Math.min(fw, fh + c), y2 = x2 - c;
        if (x2 > x1) doc.line(x + x1, y + y1, x + x2, y + y2);
      }
      (tile.free || []).forEach((o) => {
        if (Math.min(o.w, o.h) < 10) return;
        doc.setFillColor(255, 255, 255); doc.setDrawColor(102, 102, 102); doc.setLineWidth(sw);
        doc.setLineDashPattern([0.8, 0.6], 0);
        doc.rect(X(o.x), Y(o.y), o.w * s, o.h * s, "FD");
        doc.setLineDashPattern([], 0);
      });
      const feOn = project.factoryEdges !== false;
      const feLine = (ax, ay, bx, by) => { doc.setDrawColor(31, 95, 191); doc.setLineWidth(0.6); doc.line(X(ax), Y(ay), X(bx), Y(by)); };
      tile.pieces.forEach((pc) => {
        let lx = pc.x + pc.w / 2, ly = pc.y + pc.h / 2, room = Math.min(pc.w, pc.h);
        doc.setFillColor(220, 231, 243); doc.setDrawColor(34, 34, 34); doc.setLineWidth(sw);
        if (pc.poly && pc.poly.length >= 3) {
          const pts = pc.poly.map((q) => [X(q.x), Y(q.y)]);
          const deltas = pts.slice(1).map((pt, k) => [pt[0] - pts[k][0], pt[1] - pts[k][1]]);
          doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], "FD", true);
          if (feOn) {
            const onB = (a, b) => (Math.abs(a.x) < 0.6 && Math.abs(b.x) < 0.6) || (Math.abs(a.y) < 0.6 && Math.abs(b.y) < 0.6) ||
              (Math.abs(a.x - W) < 0.6 && Math.abs(b.x - W) < 0.6) || (Math.abs(a.y - H) < 0.6 && Math.abs(b.y - H) < 0.6);
            pc.poly.forEach((a, k) => { const b = pc.poly[(k + 1) % pc.poly.length]; if (onB(a, b) && Math.hypot(b.x - a.x, b.y - a.y) > 0.6) feLine(a.x, a.y, b.x, b.y); });
          }
          let A = 0, cx = 0, cy = 0;
          pc.poly.forEach((a, k) => { const b = pc.poly[(k + 1) % pc.poly.length], cr = a.x * b.y - b.x * a.y; A += cr; cx += (a.x + b.x) * cr; cy += (a.y + b.y) * cr; });
          if (Math.abs(A) > 1e-6) { lx = cx / (3 * A); ly = cy / (3 * A); room = Math.sqrt(Math.abs(A) / 2) * 0.8; }
        } else {
          doc.rect(X(pc.x), Y(pc.y), pc.w * s, pc.h * s, "FD");
          const fe = pc.fe || {}, x0 = pc.x, y0 = pc.y, x1 = pc.x + pc.w, y1 = pc.y + pc.h;
          if (feOn) [[fe.t, x0, y0, x1, y0], [fe.r, x1, y0, x1, y1], [fe.b, x0, y1, x1, y1], [fe.l, x0, y0, x0, y1]].forEach(([on, ax, ay, bx, by]) => { if (on) feLine(ax, ay, bx, by); });
        }
        // a kód a darab közepén, ha elfér (a betűméret a lap méretéhez igazodik)
        const fsMm = Math.min(W, H) * 0.17 * s;
        if (room * s > fsMm * 1.15) {
          w.font(fsMm / PT, true, [0, 0, 0]);
          doc.text(pdfText(pc.code), X(lx), Y(ly), { align: "center", baseline: "middle" });
          if (rot90(pc)) drawRotMark(doc, X(lx) + doc.getTextWidth(String(pc.code)) / 2 + fsMm * 0.55, Y(ly), fsMm * 0.36);
        }
      });
      doc.setDrawColor(34, 34, 34); doc.setLineWidth(sw); doc.rect(x, y, fw, fh, "S");
      // felirat
      let ty = y + figH + 1.2 + capSize * PT;
      w.font(capSize, false, [85, 85, 85]);
      doc.text(tile.no + ". lap", x, ty);
      capLines.forEach((ln) => {
        ty += lh;
        if (ln.code) { w.font(capSize, true); doc.text(pdfText(ln.code), x, ty); }
        w.font(capSize, false);
        doc.text(ln.text, x + (ln.code ? ln.cw : ln.indent), ty);
      });
    };
    return { h, draw };
  }

  // kis környíl (↻) a forgatott darab kódja mellé
  function drawRotMark(doc, cx, cy, r) {
    const pts = [];
    for (let a = -150; a <= 150; a += 20) { const t = a * Math.PI / 180; pts.push([cx + r * Math.sin(t), cy - r * Math.cos(t)]); }
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(Math.max(0.12, r * 0.18));
    for (let k = 1; k < pts.length; k++) doc.line(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
    const e = pts[pts.length - 1], hs = r * 0.55;
    doc.line(e[0], e[1], e[0] - hs, e[1] - hs * 0.2);
    doc.line(e[0], e[1], e[0] - hs * 0.15, e[1] - hs);
  }

  // ---- Árajánlat -------------------------------------------------------------------------------
  async function buildQuotePdf() {
    const d = quoteDocData();
    if (!d) return null;
    const { q, c, r } = d;
    const w = await newPdfDoc(d.fileTitle);
    const doc = w.doc;
    // fejléc: ajánlatadó | megrendelő
    const colW = (CONTENT_W - 10) / 2, top = w.y;
    const party = (x, label, name, lines) => {
      w.y = top;
      w.para(label.toUpperCase(), 7.5, { bold: true, color: [110, 110, 110], x, width: colW, after: 0.5 });
      if (name) w.para(name, 10.5, { bold: true, x, width: colW, after: 0.5 });
      lines.forEach((ln) => w.para(ln, 9, { x, width: colW, after: 0.2 }));
      return w.y;
    };
    const yA = party(MARGIN, "Ajánlatadó", c.name, d.contractorLines);
    const yB = party(MARGIN + colW + 10, "Megrendelő", q.customer.name, d.customerLines);
    w.y = Math.max(yA, yB) + 6;
    w.font(20, true);
    doc.text("ÁRAJÁNLAT", MARGIN, w.y + 20 * PT);
    if (q.number) { const tw = doc.getTextWidth("ÁRAJÁNLAT "); w.font(12, false, [90, 90, 90]); doc.text(pdfText(q.number), MARGIN + tw, w.y + 20 * PT); }
    w.y += w.lineH(20) + 1;
    w.para(d.dateLine, 9, { color: [60, 60, 60], after: 0.5 });
    w.para(d.subjectLine, 9, { color: [60, 60, 60], after: 4 });

    const rows = [], kinds = [];
    r.groups.forEach((g) => {
      rows.push([g.title, "", "", "", ""]); kinds.push("group");
      g.lines.forEach((l) => { rows.push([l.name, fmtQty(l.qty), l.unit, fmtFtQ(l.price), fmtFtQ(l.total)]); kinds.push(""); });
      rows.push([g.title + " összesen", "", "", "", fmtFtQ(g.lines.reduce((a, l) => a + l.total, 0))]); kinds.push("sub");
    });
    const cols = [{ w: 72 }, { w: 22, align: "right" }, { w: 16 }, { w: 34, align: "right" }, { w: CONTENT_W - 144, align: "right" }];
    pdfTable(w, rows, {
      head: ["Megnevezés", "Mennyiség", "Egység", d.priceHdr, d.sumHdr], cols, size: 9,
      rowStyle: (row, i) => kinds[i] === "group" ? { bold: true, fill: [245, 245, 245], span: true } : kinds[i] === "sub" ? { bold: true } : null,
    });

    const tot = r.vat === "27"
      ? [["Nettó összesen", fmtFtQ(r.net)], ["ÁFA (27%)", fmtFtQ(r.vatAmount)], [ "Fizetendő (bruttó)", fmtFtQ(r.gross)]]
      : [["Fizetendő", fmtFtQ(r.gross)]];
    const tw = 90;
    pdfTable(w, tot, { x: PAGE_W - MARGIN - tw, width: tw, cols: [{ w: 50 }, { w: 40, align: "right" }], size: 10, strongLast: true, after: 1.5 });
    if (r.vat !== "27") w.para("Alanyi adómentes (AAM) — az ár ÁFA-t nem tartalmaz.", 8.5, { color: [80, 80, 80], x: PAGE_W - MARGIN - tw, width: tw });
    w.y += 3;
    if (q.note.trim()) {
      w.para("Megjegyzés:", 9, { bold: true, after: 0.5 });
      q.note.split("\n").forEach((ln) => w.para(ln, 9, { after: 0.2 }));
      w.y += 3;
    }
    w.para(d.footText, 8, { color: [90, 90, 90], after: 14 });
    w.ensure(16);
    const sy = w.y + 8;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2); doc.setLineDashPattern([0.6, 0.6], 0);
    doc.line(MARGIN + 5, sy, MARGIN + 65, sy);
    doc.line(PAGE_W - MARGIN - 65, sy, PAGE_W - MARGIN - 5, sy);
    doc.setLineDashPattern([], 0);
    w.font(9, false);
    doc.text("Ajánlatadó", MARGIN + 35, sy + 4.5, { align: "center" });
    doc.text("Megrendelő", PAGE_W - MARGIN - 35, sy + 4.5, { align: "center" });

    pdfFooters(w, d.fileTitle);
    return { blob: doc.output("blob"), name: pdfFileName(d.fileTitle) };
  }

  function savePlanPdf(e) { return runPdfExport(e && e.currentTarget, buildPlanPdf); }
  function saveQuotePdf(e) { return runPdfExport(e && e.currentTarget, buildQuotePdf); }
