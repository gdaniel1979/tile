"use strict";
  function renderPaintPalette() {
    if (!el.paintPalette) return;
    el.paintPalette.innerHTML = "";
    const sel = state.layout.paintTypeId;
    const items = [{ id: "__erase__", erase: true, name: "Alap" }].concat(state.tiles.types);
    items.forEach((it) => {
      const div = document.createElement("div");
      div.className = "paint-swatch" + (it.erase ? " erase" : "") + (sel === it.id ? " sel" : "");
      div.title = it.erase ? "Vissza az alap lapra" : it.name;
      const sw = document.createElement("div");
      sw.className = "sw";
      if (!it.erase) applyFill(sw, it);
      const nm = document.createElement("div");
      nm.className = "nm";
      nm.textContent = it.name;
      div.append(sw, nm);
      div.addEventListener("click", () => {
        state.layout.paintTypeId = it.id;
        renderPaintPalette();
        save();
      });
      el.paintPalette.appendChild(div);
    });
  }

  // Kivágás-lista (számszerű finomhangolás)
  function renderCutoutList() {
    if (!el.cutoutList) return;
    el.cutoutList.innerHTML = "";
    const cuts = state.cutouts || [];
    if (!cuts.length) {
      el.cutoutList.innerHTML = '<p class="empty-note">Nincs kivágás. Rajzolj egyet a vásznon.</p>';
      return;
    }
    const dec = state.unit === "cm" ? 1 : 0;
    const step = state.unit === "cm" ? "0.1" : "1";
    cuts.forEach((c, idx) => {
      const item = document.createElement("div");
      item.className = "cutout-item";

      const head = document.createElement("div");
      head.className = "cutout-head";
      const sw = document.createElement("span");
      sw.className = "swatch"; sw.style.background = cutoutColor(c.kind);
      const nameInp = document.createElement("input");
      nameInp.type = "text";
      nameInp.className = "cutout-name";
      nameInp.value = c.name || "";
      nameInp.placeholder = layerDisplayName(c, idx);
      nameInp.title = "Réteg neve (ugyanaz, mint a Rétegek panelben)";
      nameInp.addEventListener("change", () => { c.name = nameInp.value.trim(); save(); renderLayersList(); });
      const kindSel = document.createElement("select");
      [["opening", "Nyílás"], ["untiled", "Nem burkolt"]].forEach(([v, l]) => {
        const o = document.createElement("option"); o.value = v; o.textContent = l; kindSel.appendChild(o);
      });
      kindSel.value = c.kind;
      kindSel.addEventListener("change", () => { c.kind = kindSel.value; afterGeometryChange(); });
      const fit = document.createElement("button");
      fit.className = "fit"; fit.textContent = "⤧"; fit.title = "Felülethez igazítás (ha lelóg vagy nagyobb mint a felület)";
      fit.addEventListener("click", () => {
        if (fitCutoutToSurface(c)) { selectedCutout = idx; afterGeometryChange(); renderCutoutList(); }
      });
      const del = document.createElement("button");
      del.className = "del"; del.textContent = "✕"; del.title = "Kivágás törlése";
      del.addEventListener("click", () => { state.cutouts.splice(idx, 1); afterGeometryChange(); });
      head.append(sw, nameInp, kindSel, fit, del);

      const dims = document.createElement("div");
      dims.className = "cutout-dims";
      const mk = (label, get, set) => {
        const lab = document.createElement("label");
        const span = document.createElement("span"); span.textContent = label;
        const inp = document.createElement("input");
        inp.type = "number"; inp.step = step;
        inp.value = fromMm(get()).toFixed(dec);
        inp.addEventListener("change", () => {
          const mm = toMm(parseFloat(inp.value));
          if (!Number.isNaN(mm)) { set(mm); afterGeometryChange(); }
        });
        lab.append(span, inp);
        return lab;
      };
      dims.append(
        mk("X", () => c.x, (v) => (c.x = v)),
        mk("Y", () => c.y, (v) => (c.y = v)),
        mk("Sz", () => c.w, (v) => (c.w = Math.max(0, v))),
        mk("M", () => c.h, (v) => (c.h = Math.max(0, v))),
      );
      item.append(head, dims);

      // Élvédő-élek (a kivágás 4 éle: fent, jobb, lent, bal)
      const edgRow = document.createElement("div");
      edgRow.className = "cutout-edging-row";
      const edgTitle = document.createElement("div");
      edgTitle.className = "cutout-edging-title";
      edgTitle.textContent = "Élvédő profil ezeken az éleken:";
      edgRow.appendChild(edgTitle);
      const edgGrid = document.createElement("div");
      edgGrid.className = "cutout-edging-grid";
      if (!Array.isArray(c.edgeEdgings)) c.edgeEdgings = [false, false, false, false];
      ["fent", "jobb", "lent", "bal"].forEach((label, ei) => {
        const lab = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!c.edgeEdgings[ei];
        cb.addEventListener("change", () => {
          c.edgeEdgings[ei] = cb.checked;
          afterGeometryChange();
        });
        const sp = document.createElement("span");
        sp.textContent = label;
        lab.append(cb, sp);
        edgGrid.appendChild(lab);
      });
      edgRow.appendChild(edgGrid);
      item.append(edgRow);

      // Kép-sor: csak nyílásnál (ajtó/ablak rajz). Méretarány-tartó "contain" megjelenítés.
      if (c.kind === "opening") {
        const imgRow = document.createElement("div");
        imgRow.className = "cutout-img-row";
        const file = document.createElement("input");
        file.type = "file"; file.accept = "image/*";
        file.title = "Kép kiválasztása (ajtó/ablak)";
        file.addEventListener("change", () => {
          const f = file.files && file.files[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            downscaleImage(r.result, 700, (small) => {
              c.imageUrl = small;
              render(); save();
              renderCutoutList();
            });
          };
          r.readAsDataURL(f);
        });
        imgRow.appendChild(file);
        if (c.imageUrl) {
          const thumb = document.createElement("img");
          thumb.src = c.imageUrl; thumb.className = "cutout-thumb";
          thumb.alt = ""; thumb.title = "Aktuális kép";
          const rm = document.createElement("button");
          rm.className = "img-rm"; rm.textContent = "Kép törlése";
          rm.addEventListener("click", () => { c.imageUrl = null; render(); save(); renderCutoutList(); });
          imgRow.append(thumb, rm);
        }
        item.append(imgRow);
      }

      el.cutoutList.appendChild(item);
    });
  }

