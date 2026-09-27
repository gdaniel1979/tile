"use strict";
  // ---- Árajánlat (Ajánlat fül + nyomtatható ajánlat) -----------------------
  // Az ajánlat adatai projektenként (project.quote), a vállalkozó adatai egyszer,
  // az egész tárra (store.contractor). A mennyiségek a tervből jönnek: burkolt
  // padló- és falterület, élvédő- és szilikonhossz, az anyagok pedig ugyanabból
  // a számításból (computeProjectCosts), mint az Anyag fül és a PDF.

  const VAT_RATE = 0.27;
  const round2 = (v) => Math.round(v * 100) / 100;

  function projectQuote(p) {
    if (!p.quote || !p.quote.labor) p.quote = normQuote(p.quote);
    return p.quote;
  }

  // Tiszta számítás (DOM nélkül): tételcsoportok, nettó/ÁFA/bruttó, figyelmeztetések.
  function computeQuote(p) {
    const q = projectQuote(p);
    let floorMm2 = 0, wallMm2 = 0;
    p.surfaces.forEach((s) => {
      if (!(s.lastTilesNeeded > 0)) return; // csak a kiosztott (burkolt) felületek
      if (s.mode === "wall") wallMm2 += s.lastAreaMm2 || 0; else floorMm2 += s.lastAreaMm2 || 0;
    });
    const costs = computeProjectCosts(p);
    const sil = costs.silicone;
    const qty = {
      floorM2: round2(floorMm2 / 1e6), wallM2: round2(wallMm2 / 1e6),
      edgingM: round2(sil.edgingMm / 1000), siliconeM: round2((sil.horizMm + sil.vertMm) / 1000),
    };
    const line = (name, q0, unit, price) => ({ name, qty: q0, unit, price, total: Math.round(q0 * price) });
    const warnings = [];

    const material = [];
    if (q.includeMaterial) {
      costs.lines.forEach((l) => {
        const lq = l.unit === "fm" ? round2(l.qty) : l.qty;
        if (l.unitPrice > 0) material.push(line(l.name, lq, l.unit, l.unitPrice));
        else warnings.push("Nincs ár megadva: " + l.name + " (" + lq + " " + l.unit + ") — kimarad az ajánlatból.");
      });
    }
    const L = q.labor, labor = [];
    const addLabor = (name, q0, unit, price, label) => {
      if (!(q0 > 0)) return;
      if (price > 0) labor.push(line(name, q0, unit, price));
      else warnings.push("Nincs munkadíj megadva: " + label + " (" + q0 + " " + unit + ").");
    };
    addLabor("Padlóburkolás munkadíja", qty.floorM2, "m²", L.floorM2, "padlóburkolás");
    addLabor("Falburkolás munkadíja", qty.wallM2, "m²", L.wallM2, "falburkolás");
    addLabor("Élvédő profil elhelyezése", qty.edgingM, "fm", L.edgingM, "élvédő elhelyezése");
    addLabor("Szilikonozás (sarkok, csatlakozások)", qty.siliconeM, "fm", L.siliconeM, "szilikonozás");
    const other = q.items.filter((it) => it.name.trim()).map((it) => line(it.name.trim(), it.qty, it.unit, it.price));

    const groups = [
      { title: "Anyagok", lines: material },
      { title: "Munkadíj", lines: labor },
      { title: "Egyéb tételek", lines: other },
    ].filter((g) => g.lines.length);
    const net = groups.reduce((a, g) => a + g.lines.reduce((b, l) => b + l.total, 0), 0);
    const vatAmount = q.vat === "27" ? Math.round(net * VAT_RATE) : 0;
    return { groups, net, vatAmount, gross: net + vatAmount, vat: q.vat, qty, warnings };
  }

  const fmtFtQ = (v) => Math.round(v).toLocaleString("hu-HU") + " Ft";
  const fmtQty = (v) => (Number.isInteger(v) ? String(v) : v.toLocaleString("hu-HU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  function fmtDateHu(iso) {
    const d = iso ? new Date(iso + "T00:00:00") : new Date();
    return isNaN(d) ? "" : d.toLocaleDateString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" });
  }
  function addDaysIso(iso, days) {
    const d = iso ? new Date(iso + "T00:00:00") : new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ---- Ajánlat fül: űrlap ↔ adat ------------------------------------------
  // data-q="customer.name" → project.quote.customer.name; data-c="taxNo" → store.contractor.taxNo
  function quoteTarget(inp) {
    if (inp.dataset.c) return { obj: store.contractor, key: inp.dataset.c };
    const path = inp.dataset.q.split(".");
    let obj = projectQuote(project);
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    return { obj, key: path[path.length - 1] };
  }

  function initQuoteUI() {
    const panel = document.querySelector('[data-tabpanel="quote"]');
    if (!panel) return;
    panel.querySelectorAll("[data-q], [data-c]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const { obj, key } = quoteTarget(inp);
        if (inp.type === "checkbox") obj[key] = inp.checked;
        else if (inp.type === "number") { const v = parseFloat(inp.value); obj[key] = v >= 0 ? v : 0; inp.value = obj[key]; }
        else obj[key] = inp.value;
        save();
        renderQuoteSummary();
      });
    });
    el.qAddItem.addEventListener("click", () => {
      projectQuote(project).items.push({ name: "", qty: 1, unit: "db", price: 0 });
      save();
      renderQuoteItems();
      const names = el.qItems.querySelectorAll(".q-item-name");
      if (names.length) names[names.length - 1].focus();
    });
    el.qPrint.addEventListener("click", printQuote);
  }

  // Az űrlap feltöltése a projekt/tár adataiból (projektváltás, undo, fülváltás után)
  function syncQuoteUI() {
    const panel = document.querySelector('[data-tabpanel="quote"]');
    if (!panel || !project || !store) return;
    panel.querySelectorAll("[data-q], [data-c]").forEach((inp) => {
      const { obj, key } = quoteTarget(inp);
      if (inp.type === "checkbox") inp.checked = !!obj[key];
      else inp.value = obj[key] != null ? obj[key] : "";
    });
    renderQuoteItems();
    renderQuoteSummary();
  }

  function renderQuoteItems() {
    const items = projectQuote(project).items;
    el.qItems.innerHTML = "";
    if (!items.length) {
      el.qItems.innerHTML = '<p class="empty-note">Nincs egyedi tétel (pl. bontás, aljzatkiegyenlítés, kiszállás).</p>';
      return;
    }
    items.forEach((it, i) => {
      const row = document.createElement("div");
      row.className = "q-item";
      const mk = (type, cls, val, ph) => {
        const inp = document.createElement("input");
        inp.type = type; inp.className = cls; inp.value = val; if (ph) inp.placeholder = ph;
        if (type === "number") { inp.min = "0"; inp.step = "any"; }
        return inp;
      };
      const name = mk("text", "q-item-name", it.name, "megnevezés");
      const qty = mk("number", "q-item-qty", it.qty, "menny.");
      const unit = mk("text", "q-item-unit", it.unit, "egys.");
      const price = mk("number", "q-item-price", it.price, "Ft/egys.");
      const del = document.createElement("button");
      del.className = "tile-del"; del.textContent = "✕"; del.title = "Tétel törlése";
      const commit = () => {
        it.name = name.value; it.unit = unit.value || "db";
        it.qty = Math.max(0, parseFloat(qty.value) || 0); it.price = Math.max(0, parseFloat(price.value) || 0);
        save(); renderQuoteSummary();
      };
      [name, qty, unit, price].forEach((x) => x.addEventListener("change", commit));
      del.addEventListener("click", () => { items.splice(i, 1); save(); renderQuoteItems(); renderQuoteSummary(); });
      const top = document.createElement("div"); top.className = "q-item-top"; top.append(name, del);
      const bottom = document.createElement("div"); bottom.className = "q-item-bottom";
      const x = document.createElement("span"); x.className = "u"; x.textContent = "×";
      const ft = document.createElement("span"); ft.className = "u"; ft.textContent = "Ft";
      bottom.append(qty, unit, x, price, ft);
      row.append(top, bottom);
      el.qItems.appendChild(row);
    });
  }

  function renderQuoteSummary() {
    if (!el.qSummary || !project) return;
    const r = computeQuote(project);
    // munkadíj-sorok mellett a tervből számolt mennyiség
    const qtyText = { floorM2: fmtQty(r.qty.floorM2) + " m²", wallM2: fmtQty(r.qty.wallM2) + " m²", edgingM: fmtQty(r.qty.edgingM) + " fm", siliconeM: fmtQty(r.qty.siliconeM) + " fm" };
    document.querySelectorAll("[data-qty]").forEach((s) => { s.textContent = qtyText[s.dataset.qty] || ""; });
    const row = (a, b, cls) => `<div class="mat-row${cls ? " " + cls : ""}"><span>${a}</span> <strong>${b}</strong></div>`;
    let html = "";
    r.groups.forEach((g) => { html += row(escapeHtml(g.title), fmtFtQ(g.lines.reduce((a, l) => a + l.total, 0))); });
    if (r.vat === "27") {
      html += row("Nettó összesen", fmtFtQ(r.net), "q-sum-sep");
      html += row("ÁFA 27%", fmtFtQ(r.vatAmount));
      html += row("Bruttó összesen", fmtFtQ(r.gross), "q-sum-total");
    } else {
      html += row("Végösszeg (AAM)", fmtFtQ(r.gross), "q-sum-sep q-sum-total");
    }
    if (r.warnings.length) {
      html += '<ul class="q-warn">' + r.warnings.map((w) => "<li>" + escapeHtml(w) + "</li>").join("") + "</ul>";
    }
    el.qSummary.innerHTML = html;
  }

  // ---- Nyomtatható ajánlat -------------------------------------------------
  function printQuote() {
    recomputeAllSurfacesMaterial(); // minden felület friss számaival
    const q = projectQuote(project), c = store.contractor || normContractor();
    const r = computeQuote(project);
    if (!r.groups.length) {
      alert("Az ajánlat üres: adj meg munkadíjat, egyedi tételt, vagy az anyagokhoz árat (Burkolat / Anyag fül).");
      return;
    }
    const e = escapeHtml;
    const lines = (arr) => arr.filter(Boolean).map(e).join("<br>");
    const issued = q.date || new Date().toISOString().slice(0, 10);
    let html = '<div class="qt">';
    html += '<div class="qt-head">';
    html += '<div class="qt-party"><div class="qt-lbl">Ajánlatadó</div>' +
      (c.name ? "<strong>" + e(c.name) + "</strong><br>" : "") +
      lines([c.address, c.taxNo && "Adószám: " + c.taxNo, [c.phone, c.email].filter(Boolean).join(" · "), c.bank && "Bankszámla: " + c.bank]) + "</div>";
    html += '<div class="qt-party"><div class="qt-lbl">Megrendelő</div>' +
      (q.customer.name ? "<strong>" + e(q.customer.name) + "</strong><br>" : "") +
      lines([q.customer.address, [q.customer.phone, q.customer.email].filter(Boolean).join(" · ")]) + "</div>";
    html += "</div>";
    html += '<div class="qt-title">ÁRAJÁNLAT' + (q.number ? ' <span class="qt-no">' + e(q.number) + "</span>" : "") + "</div>";
    html += '<div class="qt-meta">Kelt: ' + fmtDateHu(issued) + " · Érvényes: " + fmtDateHu(addDaysIso(issued, q.validDays)) + "-ig</div>";
    const subj = [r.qty.floorM2 > 0 && "padló " + fmtQty(r.qty.floorM2) + " m²", r.qty.wallM2 > 0 && "fal " + fmtQty(r.qty.wallM2) + " m²"].filter(Boolean).join(", ");
    html += '<div class="qt-meta">Tárgy: ' + e(project.name || "Projekt") + " — burkolási munkák" + (subj ? " (" + subj + ")" : "") + "</div>";

    const priceHdr = r.vat === "27" ? "Nettó egységár" : "Egységár";
    const sumHdr = r.vat === "27" ? "Nettó összeg" : "Összeg";
    html += '<table class="qt-table"><thead><tr><th>Megnevezés</th><th class="num">Mennyiség</th><th>Egység</th>' +
      `<th class="num">${priceHdr}</th><th class="num">${sumHdr}</th></tr></thead><tbody>`;
    r.groups.forEach((g) => {
      html += `<tr class="qt-group"><td colspan="5">${e(g.title)}</td></tr>`;
      g.lines.forEach((l) => {
        html += `<tr><td>${e(l.name)}</td><td class="num">${fmtQty(l.qty)}</td><td>${e(l.unit)}</td>` +
          `<td class="num">${fmtFtQ(l.price)}</td><td class="num">${fmtFtQ(l.total)}</td></tr>`;
      });
      const sub = g.lines.reduce((a, l) => a + l.total, 0);
      html += `<tr class="qt-sub"><td colspan="4">${e(g.title)} összesen</td><td class="num">${fmtFtQ(sub)}</td></tr>`;
    });
    html += "</tbody></table>";

    html += '<table class="qt-totals">';
    if (r.vat === "27") {
      html += `<tr><td>Nettó összesen</td><td class="num">${fmtFtQ(r.net)}</td></tr>`;
      html += `<tr><td>ÁFA (27%)</td><td class="num">${fmtFtQ(r.vatAmount)}</td></tr>`;
      html += `<tr class="qt-grand"><td>Fizetendő (bruttó)</td><td class="num">${fmtFtQ(r.gross)}</td></tr>`;
    } else {
      html += `<tr class="qt-grand"><td>Fizetendő</td><td class="num">${fmtFtQ(r.gross)}</td></tr>`;
      html += '<tr><td colspan="2" class="qt-aam">Alanyi adómentes (AAM) — az ár ÁFA-t nem tartalmaz.</td></tr>';
    }
    html += "</table>";
    if (q.note.trim()) html += '<div class="qt-note"><strong>Megjegyzés:</strong><br>' + e(q.note).replace(/\n/g, "<br>") + "</div>";
    html += '<div class="qt-foot">Az ajánlat a tervben megadott méretek alapján készült; a mennyiségek a helyszíni felmérés után pontosíthatók. ' +
      (q.includeMaterial ? "Az anyagmennyiségek a beállított tartalékkal számolva." : "Az ajánlat az anyagköltséget nem tartalmazza.") + "</div>";
    html += '<div class="qt-sign"><div>……………………………………<br>Ajánlatadó</div><div>……………………………………<br>Megrendelő</div></div>';
    html += "</div>";

    if (el.printTitle) el.printTitle.hidden = true;
    el.printImg.style.display = "none";
    el.printInfo.innerHTML = html;
    // a PDF-mentés alap fájlneve a böngészőben a lap címe
    const oldTitle = document.title;
    document.title = "Árajánlat" + (q.number ? " " + q.number : "") + (q.customer.name ? " - " + q.customer.name : "");
    window.addEventListener("afterprint", () => { document.title = oldTitle; }, { once: true });
    setTimeout(() => window.print(), 200);
  }
