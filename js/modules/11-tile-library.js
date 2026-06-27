"use strict";
  function addTileType() {
    const t = state.tiles;
    const base = t.types.find((x) => x.id === t.baseId) || t.types[0];
    const id = "t" + Date.now().toString(36) + Math.floor(Math.random() * 1000);
    t.types.push({
      id,
      name: "Lap " + (t.types.length + 1),
      wMm: base ? base.wMm : 300,
      hMm: base ? base.hMm : 300,
      thicknessMm: base ? (base.thicknessMm || 8) : 8,
      pricePerTile: 0,
      fillKind: "color",
      color: randomTileColor(),
      imageUrl: null,
      imageMode: "full",
    });
    renderTileLibrary();
    tilesSave();
  }

  function deleteTileType(id) {
    if (project.tileTypes.length <= 1) return;
    project.tileTypes = project.tileTypes.filter((x) => x.id !== id);
    state.tiles.types = project.tileTypes; // megosztott referencia frissítése
    const fallback = project.tileTypes[0].id;
    // a törölt típust minden felületen takarítsuk (alap, festések, festő-kijelölés)
    project.surfaces.forEach((s) => {
      if (s.baseId === id) s.baseId = fallback;
      if (s.layout) {
        if (s.layout.paintTypeId === id) s.layout.paintTypeId = fallback;
        if (s.layout.overrides) Object.keys(s.layout.overrides).forEach((k) => { if (s.layout.overrides[k] === id) delete s.layout.overrides[k]; });
      }
    });
    if (state.tiles.baseId === id) state.tiles.baseId = fallback;
    if (state.layout.paintTypeId === id) state.layout.paintTypeId = fallback;
    Object.keys(state.layout.overrides).forEach((k) => { if (state.layout.overrides[k] === id) delete state.layout.overrides[k]; });
    renderTileLibrary();
    render();
    tilesSave();
  }

  function makeTileCard(type) {
    const t = state.tiles;
    const card = document.createElement("div");
    card.className = "tile-card" + (type.id === t.baseId ? " is-base" : "");

    // --- fejléc: név, alap-jelölő, törlés ---
    const head = document.createElement("div");
    head.className = "tile-card-head";

    const name = document.createElement("input");
    name.className = "tile-name";
    name.value = type.name;
    name.addEventListener("change", () => { type.name = name.value.trim() || "Lap"; tilesSave(); });

    const baseLbl = document.createElement("label");
    baseLbl.className = "base-radio";
    const baseRadio = document.createElement("input");
    baseRadio.type = "radio";
    baseRadio.name = "baseTile";
    baseRadio.checked = type.id === t.baseId;
    baseRadio.addEventListener("change", () => {
      if (baseRadio.checked) { t.baseId = type.id; renderTileLibrary(); tilesSave(); }
    });
    baseLbl.appendChild(baseRadio);
    baseLbl.appendChild(document.createTextNode("alap"));

    const del = document.createElement("button");
    del.className = "tile-del";
    del.textContent = "✕";
    del.title = "Típus törlése";
    del.disabled = t.types.length <= 1;
    del.addEventListener("click", () => deleteTileType(type.id));

    head.append(name, baseLbl, del);
    card.appendChild(head);

    // --- törzs: minta + mezők ---
    const body = document.createElement("div");
    body.className = "tile-card-body";

    const sw = document.createElement("div");
    sw.className = "tile-swatch";
    sizeSwatch(sw, type);
    applyFill(sw, type);

    const fields = document.createElement("div");
    fields.className = "tile-fields";

    // méret
    const dim = document.createElement("div");
    dim.className = "dim-row";
    const dec = state.unit === "cm" ? 1 : 0;
    const step = state.unit === "cm" ? "0.1" : "1";
    const wIn = document.createElement("input");
    wIn.type = "number"; wIn.min = "1"; wIn.step = step;
    wIn.value = fromMm(type.wMm).toFixed(dec);
    const x = document.createElement("span"); x.className = "x"; x.textContent = "×";
    const hIn = document.createElement("input");
    hIn.type = "number"; hIn.min = "1"; hIn.step = step;
    hIn.value = fromMm(type.hMm).toFixed(dec);
    const u = document.createElement("span"); u.className = "u"; u.textContent = state.unit;
    wIn.addEventListener("change", () => {
      const mm = toMm(parseFloat(wIn.value));
      if (mm > 0) { type.wMm = mm; sizeSwatch(sw, type); applyFill(sw, type); tilesSave(); }
    });
    hIn.addEventListener("change", () => {
      const mm = toMm(parseFloat(hIn.value));
      if (mm > 0) { type.hMm = mm; sizeSwatch(sw, type); applyFill(sw, type); tilesSave(); }
    });
    dim.append(wIn, x, hIn, u);

    // vastagság (mm, mindig mm-ben — szabványos lap-adatlapokon így van)
    const thickRow = document.createElement("div");
    thickRow.className = "thick-row";
    const thLbl = document.createElement("span");
    thLbl.className = "u"; thLbl.textContent = "Vastagság:";
    const thIn = document.createElement("input");
    thIn.type = "number"; thIn.min = "1"; thIn.step = "0.5";
    thIn.value = (type.thicknessMm != null ? type.thicknessMm : 8);
    const thU = document.createElement("span");
    thU.className = "u"; thU.textContent = "mm";
    thIn.addEventListener("change", () => {
      const v = parseFloat(thIn.value);
      if (v > 0) { type.thicknessMm = v; tilesSave(); }
    });
    thickRow.append(thLbl, thIn, thU);

    // egységár (Ft/db) — költségszámításhoz
    const priceRow = document.createElement("div");
    priceRow.className = "thick-row";
    const prLbl = document.createElement("span");
    prLbl.className = "u"; prLbl.textContent = "Ár:";
    const prIn = document.createElement("input");
    prIn.type = "number"; prIn.min = "0"; prIn.step = "1";
    prIn.value = (type.pricePerTile != null ? type.pricePerTile : 0);
    const prU = document.createElement("span");
    prU.className = "u"; prU.textContent = "Ft/db";
    prIn.addEventListener("change", () => {
      const v = parseFloat(prIn.value);
      if (v >= 0) { type.pricePerTile = v; tilesSave(); }
    });
    priceRow.append(prLbl, prIn, prU);

    // kitöltés típusa + szín
    const fill = document.createElement("div");
    fill.className = "fill-row";
    const kind = document.createElement("select");
    [["color", "Szín"], ["image", "Kép"]].forEach(([v, l]) => {
      const o = document.createElement("option"); o.value = v; o.textContent = l; kind.appendChild(o);
    });
    kind.value = type.fillKind;
    const colorWrap = document.createElement("span");
    colorWrap.className = "fill-color-wrap";
    const color = document.createElement("input");
    color.type = "color"; color.value = type.color;
    color.addEventListener("input", () => { type.color = color.value; applyFill(sw, type); });
    color.addEventListener("change", tilesSave);
    colorWrap.appendChild(color);
    const kindLbl = document.createElement("span");
    kindLbl.className = "u";
    kindLbl.textContent = "Kitöltés:";
    fill.append(kindLbl, kind, colorWrap);

    // kép sor
    const imgRow = document.createElement("div");
    imgRow.className = "image-row";
    const file = document.createElement("input");
    file.type = "file"; file.accept = "image/*";
    const mode = document.createElement("select");
    [["full", "Teljes lap"], ["repeat", "Ismétlődő"]].forEach(([v, l]) => {
      const o = document.createElement("option"); o.value = v; o.textContent = l; mode.appendChild(o);
    });
    mode.value = type.imageMode;
    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        // a textúrát lekicsinyítjük, hogy ne teljen meg a böngésző tárolója (localStorage)
        downscaleImage(r.result, 700, (small) => {
          type.imageUrl = small;
          type.fillKind = "image";
          kind.value = "image";
          updateFillVisibility();
          applyFill(sw, type);
          tilesSave();
        });
      };
      r.readAsDataURL(f);
    });
    mode.addEventListener("change", () => { type.imageMode = mode.value; applyFill(sw, type); tilesSave(); });
    imgRow.append(file, mode);

    function updateFillVisibility() {
      const isImg = kind.value === "image";
      colorWrap.hidden = isImg;
      imgRow.hidden = !isImg;
    }
    kind.addEventListener("change", () => {
      type.fillKind = kind.value;
      updateFillVisibility();
      applyFill(sw, type);
      tilesSave();
    });
    updateFillVisibility();

    fields.append(dim, thickRow, priceRow, fill, imgRow);
    body.append(sw, fields);
    card.appendChild(body);
    return card;
  }

  function renderTileLibrary() {
    if (!el.tileList) return;
    el.tileList.innerHTML = "";
    state.tiles.types.forEach((type) => el.tileList.appendChild(makeTileCard(type)));
    renderPaintPalette(); // a festő-paletta is kövesse a könyvtárat
  }

  // Fül-nevek a függőleges ikonsávhoz (a gombok csak ikont mutatnak, a teljes
  // nevet az "active-tab-title" feliratban és a title/aria-label-ben adjuk meg).
  const TAB_LABELS = {
    plan: "Alaprajz", tiles: "Burkolat", layout: "Kiosztás",
    material: "Anyag", export: "Export",
  };

  function initTilesUI() {
    // Fülek
    el.tabs.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const tab = b.dataset.tab;
      [...el.tabs.children].forEach((c) => c.classList.toggle("active", c === b));
      document.querySelectorAll("[data-tabpanel]").forEach((p) => {
        p.hidden = p.dataset.tabpanel !== tab;
      });
      if (el.activeTabTitle) el.activeTabTitle.textContent = TAB_LABELS[tab] || "";
      // Anyag fülre váltáskor minden felület cache-ét frissítjük (offscreen),
      // hogy a projekt-összesítés ne csak az aktív felületet mutassa.
      if (tab === "material") recomputeAllSurfacesMaterial();
    });

    el.addTile.addEventListener("click", addTileType);

    el.groutW.addEventListener("change", () => {
      const v = parseFloat(el.groutW.value);
      if (v >= 0) { state.tiles.groutMm = v; tilesSave(); }
    });
    el.groutColor.addEventListener("input", () => {
      state.tiles.groutColor = el.groutColor.value;
      renderTileLibrary(); // a minták kerete a fuga színét tükrözi
    });
    el.groutColor.addEventListener("change", tilesSave);
  }

  // =======================================================================
  //  3. FÁZIS – Hálós lapkiosztás generálása + vizualizáció
  // =======================================================================
