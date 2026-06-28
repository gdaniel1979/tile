"use strict";
  // ---- 20. fázis: Rétegek panel (jobb oldal) ------------------------------
  // A "réteg" fogalma a meglévő `selectedCutout` állapotot használja:
  // -1 = a felület maga aktív, N = az N. kivágás aktív. A vásznon csak az
  // aktív réteg reagál a kattintásra (lásd activeCutoutAt a
  // 08-mouse-interaction.js-ben) — ez oldja fel az átfedő kivágások miatti
  // kattintás-ütközést (Photoshop-szerű réteg-modell, sorrend-átrendezés
  // nélkül).
  const LAYERS_WIDTH_KEY = "tile-planner-layers-width";
  const LAYERS_MIN = 160, LAYERS_MAX = 420;

  function layerDisplayName(c, idx) {
    return (c.kind === "opening" ? "Nyílás" : "Nem burkolt") + " " + (idx + 1);
  }

  function renderLayersList() {
    if (!el.layersList) return;
    el.layersList.innerHTML = "";
    const cuts = state.cutouts || [];

    // Felülről lefelé: az utoljára létrehozott kivágás van legfelül (z-sorrend
    // szerint ő reagálna elsőként a vásznon is, ha ő lenne az aktív réteg).
    for (let i = cuts.length - 1; i >= 0; i--) {
      const c = cuts[i];
      const row = document.createElement("div");
      row.className = "layer-item" + (selectedCutout === i ? " active" : "");

      const sw = document.createElement("span");
      sw.className = "layer-swatch";
      sw.style.background = cutoutColor(c.kind);

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "layer-name";
      nameInput.value = c.name || "";
      nameInput.placeholder = layerDisplayName(c, i);
      nameInput.addEventListener("click", (e) => e.stopPropagation());
      nameInput.addEventListener("change", () => { c.name = nameInput.value.trim(); save(); });

      row.append(sw, nameInput);
      row.addEventListener("click", () => {
        if (selectedCutout === i) return;
        selectedCutout = i;
        state.selected = null;
        afterSelectionChange();
        renderLayersList();
        renderCutoutList();
      });
      el.layersList.appendChild(row);
    }

    if (cuts.length) {
      const sep = document.createElement("div");
      sep.className = "layers-list-sep";
      el.layersList.appendChild(sep);
    }

    // Legalul: a felület maga — mindig kiválasztható, akárhány kivágás van fölötte.
    const base = document.createElement("div");
    base.className = "layer-item" + (selectedCutout === -1 ? " active" : "");
    const icon = document.createElement("span");
    icon.className = "layer-icon";
    icon.textContent = "▢";
    const label = document.createElement("span");
    label.className = "layer-name-static";
    label.textContent = "Felület (alap)";
    base.append(icon, label);
    base.addEventListener("click", () => {
      if (selectedCutout === -1) return;
      selectedCutout = -1;
      state.selected = null;
      afterSelectionChange();
      renderLayersList();
      renderCutoutList();
    });
    el.layersList.appendChild(base);
  }

  function initLayersPanel() {
    if (!el.layersResizer || !el.layersPanel) return;
    let saved = 0;
    try { saved = parseInt(localStorage.getItem(LAYERS_WIDTH_KEY), 10); } catch (_) {}
    if (saved >= LAYERS_MIN && saved <= LAYERS_MAX) el.layersPanel.style.width = saved + "px";
    let dragging = false, startX = 0, startW = 0;
    el.layersResizer.addEventListener("mousedown", (e) => {
      dragging = true; startX = e.clientX; startW = el.layersPanel.getBoundingClientRect().width;
      el.layersResizer.classList.add("dragging");
      document.body.style.userSelect = "none";
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      // jobb oldali panel: balra húzva szélesedik, jobbra húzva szűkül
      const w = Math.max(LAYERS_MIN, Math.min(LAYERS_MAX, startW - (e.clientX - startX)));
      el.layersPanel.style.width = w + "px";
      resizeCanvas();
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      el.layersResizer.classList.remove("dragging");
      document.body.style.userSelect = "";
      try { localStorage.setItem(LAYERS_WIDTH_KEY, Math.round(el.layersPanel.getBoundingClientRect().width)); } catch (_) {}
    });
  }
