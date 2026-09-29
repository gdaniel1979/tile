"use strict";
  // ---- 20. fázis: Rétegek (a Projektek és rétegek panelen) ------------------------------
  // A "réteg" fogalma a meglévő `selectedCutout` állapotot használja:
  // -1 = a felület maga aktív, N = az N. kivágás aktív. A vásznon csak az
  // aktív réteg reagál a kattintásra (lásd activeCutoutAt a
  // 08-mouse-interaction.js-ben) — ez oldja fel az átfedő kivágások miatti
  // kattintás-ütközést (Photoshop-szerű réteg-modell, sorrend-átrendezés
  // nélkül).
  // az oldalpanel (Tulajdonságok) húzható szélessége
  const LAYERS_WIDTH_KEY = "tile-planner-props-width";
  const LAYERS_MIN = 240, LAYERS_MAX = 560;
  // a Projektek és rétegek panel húzható szélessége
  const NAV_WIDTH_KEY = "tile-planner-nav-width";
  const NAV_MIN = 180, NAV_MAX = 480;
  // Ideiglenes UI-állapot (nem perzisztens, nem a state része): melyik
  // kivágások vannak bejelölve a "Csoportosítás" művelethez, és melyik csoportok
  // vannak kinyitva. Felület-váltáskor renderLayersList magától megtisztítja
  // az érvénytelen indexeket.
  let checkedForGroup = new Set();
  let expandedGroups = new Set();

  function layerDisplayName(c, idx) {
    return (c.kind === "opening" ? "Nyílás" : "Nem burkolt") + " " + (idx + 1);
  }

  function selectLayer(idx) {
    if (selectedCutout === idx) return;
    selectedCutout = idx;
    state.selected = null;
    afterSelectionChange();
    renderLayersList();
    renderCutoutList();
  }

  function buildCutoutRow(idx, c, withCheckbox, indentPx) {
    const row = document.createElement("div");
    row.className = "layer-item" + (selectedCutout === idx ? " active" : "");
    if (indentPx) row.style.marginLeft = indentPx + "px";

    if (withCheckbox) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "layer-checkbox";
      cb.checked = checkedForGroup.has(idx);
      cb.title = "Jelölés csoportosításhoz";
      cb.addEventListener("click", (e) => e.stopPropagation());
      cb.addEventListener("change", () => {
        if (cb.checked) checkedForGroup.add(idx); else checkedForGroup.delete(idx);
        renderGroupActionBar();
      });
      row.appendChild(cb);
    }

    const sw = document.createElement("span");
    sw.className = "layer-swatch";
    sw.style.background = cutoutColor(c.kind);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "layer-name";
    nameInput.value = c.name || "";
    nameInput.placeholder = layerDisplayName(c, idx);
    nameInput.addEventListener("click", (e) => e.stopPropagation());
    nameInput.addEventListener("change", () => { c.name = nameInput.value.trim(); save(); renderCutoutList(); });

    row.append(sw, nameInput);
    row.addEventListener("click", () => selectLayer(idx));
    return row;
  }

  function buildGroupRow(groupId, indices) {
    const container = document.createElement("div");
    const groupLabel = (state.cutouts[indices[0]] && state.cutouts[indices[0]].groupLabel) || "Csoport";
    const isExpanded = expandedGroups.has(groupId);
    const anyActive = indices.includes(selectedCutout);

    const head = document.createElement("div");
    head.className = "layer-item layer-group-head" + (anyActive ? " active" : "");

    const caret = document.createElement("span");
    caret.className = "layer-caret";
    caret.textContent = isExpanded ? "▾" : "▸";
    caret.title = isExpanded ? "Csoport összecsukása" : "Csoport kinyitása";
    caret.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isExpanded) expandedGroups.delete(groupId); else expandedGroups.add(groupId);
      renderLayersList();
    });

    const icon = document.createElement("span");
    icon.className = "layer-icon";
    icon.innerHTML = iconSvg("layers");

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "layer-name";
    nameInput.value = groupLabel;
    nameInput.addEventListener("click", (e) => e.stopPropagation());
    nameInput.addEventListener("change", () => {
      const v = nameInput.value.trim() || "Csoport";
      indices.forEach((i) => { if (state.cutouts[i]) state.cutouts[i].groupLabel = v; });
      save(); renderCutoutList();
    });

    const ungroup = document.createElement("button");
    ungroup.className = "layer-ungroup";
    ungroup.innerHTML = iconSvg("dismiss");
    ungroup.title = "Csoport bontása (a darabok megmaradnak, külön rétegként)";
    ungroup.addEventListener("click", (e) => {
      e.stopPropagation();
      indices.forEach((i) => { if (state.cutouts[i]) { state.cutouts[i].groupId = null; state.cutouts[i].groupLabel = ""; } });
      expandedGroups.delete(groupId);
      save();
      afterGeometryChange();
    });

    head.append(caret, icon, nameInput, ungroup);
    head.addEventListener("click", () => selectLayer(indices[indices.length - 1]));
    container.appendChild(head);

    if (isExpanded) {
      indices.slice().reverse().forEach((i) => {
        container.appendChild(buildCutoutRow(i, state.cutouts[i], false, 18));
      });
    }
    return container;
  }

  function renderGroupActionBar() {
    if (!el.layersGroupBar) return;
    el.layersGroupBar.innerHTML = "";
    if (checkedForGroup.size < 2) { el.layersGroupBar.hidden = true; return; }
    el.layersGroupBar.hidden = false;
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary full";
    btn.textContent = "Csoportosítás (" + checkedForGroup.size + " kijelölt)";
    btn.addEventListener("click", () => {
      const name = prompt("A csoport neve:", "Nem burkolt sáv");
      if (name === null) return;
      const groupId = "cg-" + Date.now().toString(36) + Math.floor(Math.random() * 1000);
      const lbl = name.trim() || "Csoport";
      checkedForGroup.forEach((i) => {
        if (state.cutouts[i]) { state.cutouts[i].groupId = groupId; state.cutouts[i].groupLabel = lbl; }
      });
      checkedForGroup.clear();
      expandedGroups.add(groupId);
      afterGeometryChange();
    });
    el.layersGroupBar.appendChild(btn);
  }

  function renderLayersList() {
    if (!el.layersList) return;
    el.layersList.innerHTML = "";
    const cuts = state.cutouts || [];
    checkedForGroup = new Set([...checkedForGroup].filter((i) => i < cuts.length && cuts[i] && !cuts[i].groupId));

    // Felülről lefelé: az utoljára létrehozott kivágás (vagy csoport első
    // tagja) van legfelül, a z-sorrendnek megfelelően.
    const seenGroups = new Set();
    for (let i = cuts.length - 1; i >= 0; i--) {
      const c = cuts[i];
      if (c.groupId) {
        if (seenGroups.has(c.groupId)) continue;
        seenGroups.add(c.groupId);
        const indices = cuts.reduce((acc, cc, ii) => { if (cc.groupId === c.groupId) acc.push(ii); return acc; }, []);
        el.layersList.appendChild(buildGroupRow(c.groupId, indices));
      } else {
        el.layersList.appendChild(buildCutoutRow(i, c, true, 0));
      }
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
    icon.innerHTML = iconSvg("view2d");
    const label = document.createElement("span");
    label.className = "layer-name-static";
    label.textContent = "Felület (alap)";
    base.append(icon, label);
    base.addEventListener("click", () => selectLayer(-1));
    el.layersList.appendChild(base);

    renderGroupActionBar();
  }

  // Húzható panel-szélesség (Tulajdonságok és Projektek és rétegek panel).
  // rightOfCanvas(): a panel éppen a vászontól jobbra van-e (akkor balra húzva szélesedik).
  function initPaneResizer(resizer, pane, key, min, max, rightOfCanvas) {
    if (!resizer || !pane) return;
    let saved = 0;
    try { saved = parseInt(localStorage.getItem(key), 10); } catch (_) {}
    if (saved >= min && saved <= max) pane.style.width = saved + "px";
    let dragging = false, startX = 0, startW = 0;
    // Pointer Events: egérrel és ujjal (tablet) is húzható
    resizer.addEventListener("pointerdown", (e) => {
      if (resizer.setPointerCapture) resizer.setPointerCapture(e.pointerId);
      dragging = true; startX = e.clientX; startW = pane.getBoundingClientRect().width;
      resizer.classList.add("dragging");
      document.body.style.userSelect = "none";
      e.preventDefault();
    });
    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = rightOfCanvas() ? startX - e.clientX : e.clientX - startX;
      pane.style.width = Math.max(min, Math.min(max, startW + dx)) + "px";
      resizeCanvas();
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove("dragging");
      document.body.style.userSelect = "";
      try { localStorage.setItem(key, Math.round(pane.getBoundingClientRect().width)); } catch (_) {}
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }

  function initLayersPanel() {
    // a Tulajdonságok a data-pane-side oldalán, a Projektek és rétegek a túloldalon
    const propsLeft = () => document.documentElement.dataset.paneSide === "left";
    initPaneResizer(el.layersResizer, el.propsPane, LAYERS_WIDTH_KEY, LAYERS_MIN, LAYERS_MAX, () => !propsLeft());
    initPaneResizer(el.navResizer, el.navPane, NAV_WIDTH_KEY, NAV_MIN, NAV_MAX, propsLeft);
  }
