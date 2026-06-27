"use strict";
  function refreshAll() {
    syncControlsFromState();
    renderTileLibrary();
    renderEdgeList();
    updateSummary();
    renderProjectTree();
    if (el.projName) el.projName.value = project.name;
    updateCanvasTitle();
    checkWallSync();
    fitView();
    save();
  }

  // A vászon-fejléc frissítése: "Projekt — Felület"
  function updateCanvasTitle() {
    const t = document.getElementById("canvasTitle");
    if (!t || !project) return;
    const s = project.surfaces[project.activeIndex];
    if (!s) { t.innerHTML = ""; return; }
    const pn = escapeHtml(project.name || "Projekt");
    const sn = escapeHtml(s.name || "Felület");
    t.innerHTML = pn + '<span class="sep">—</span><span class="surf">' + sn + '</span>';
  }

  // ---- Fa-lista (projektek + felületek) --------------------------------
  function treeRow(cls) { const d = document.createElement("div"); d.className = "tree-row " + cls; return d; }
  function treeBtn(label, cls, title) {
    const b = document.createElement("button");
    b.className = "tree-btn " + (cls || "");
    b.textContent = label; b.title = title || "";
    return b;
  }

  // melyik projektek vannak kibontva (session-szintű állapot, nem perzisztens).
  // Default: az aktív projekt kibontva; a caret-tel a felhasználó bármelyiket
  // be- vagy kicsukhatja, az aktívat is.
  const expandedProjects = new Set();
  const expandedSurfaces = new Set(); // melyik fal-felület van kinyitva (gyermek-előtétfalakhoz)
  function toggleProjectExpanded(id) {
    if (expandedProjects.has(id)) expandedProjects.delete(id);
    else expandedProjects.add(id);
    renderProjectTree();
  }
  function toggleSurfaceExpanded(id) {
    if (expandedSurfaces.has(id)) expandedSurfaces.delete(id);
    else expandedSurfaces.add(id);
    renderProjectTree();
  }

  function renderProjectTree() {
    const root = el.projTree;
    root.innerHTML = "";
    store.projects.forEach((p) => {
      const isActive = p.id === store.activeProjectId;
      const isOpen = expandedProjects.has(p.id);
      const prow = treeRow("tree-proj" + (isActive ? " active" : ""));
      const caret = document.createElement("span");
      caret.className = "caret"; caret.textContent = isOpen ? "▾" : "▸";
      caret.title = isOpen ? "Összecsukás" : "Kinyitás";
      caret.addEventListener("click", (e) => { e.stopPropagation(); toggleProjectExpanded(p.id); });
      const nm = document.createElement("span");
      nm.className = "tree-name"; nm.textContent = p.name;
      prow.append(caret, nm);
      prow.addEventListener("click", (e) => { if (e.target.closest(".tree-btn")) return; switchProject(p.id); });
      const edit = treeBtn("✎", "", "Projekt átnevezése");
      edit.addEventListener("click", (e) => { e.stopPropagation(); renameProjectFn(p.id); });
      const del = treeBtn("✕", "del", "Projekt törlése");
      del.disabled = store.projects.length <= 1;
      del.addEventListener("click", (e) => { e.stopPropagation(); deleteProjectFn(p.id); });
      prow.append(edit, del);
      root.appendChild(prow);

      if (isOpen) {
        // Csak a "felső szintű" felületeket rendereljük (nincs parentSurfaceId).
        // A gyermekek (parentSurfaceId === parent.id) a szülő alatt jelennek meg.
        const renderSurface = (s, i, depth) => {
          const isSurfActive = isActive && i === p.activeIndex;
          const srow = treeRow("tree-surf" + (isSurfActive ? " active" : "") + (depth > 0 ? " tree-child" : ""));
          if (depth > 0) srow.style.paddingLeft = (12 + depth * 14) + "px";
          // Gyermek-felületek listája
          const children = p.surfaces
            .map((cs, ci) => ({ s: cs, i: ci }))
            .filter((x) => x.s.parentSurfaceId === s.id);
          const hasChildren = children.length > 0;
          const sOpen = expandedSurfaces.has(s.id);
          if (hasChildren) {
            const sCaret = document.createElement("span");
            sCaret.className = "caret"; sCaret.textContent = sOpen ? "▾" : "▸";
            sCaret.title = sOpen ? "Összecsukás" : "Gyermek-felületek megjelenítése";
            sCaret.addEventListener("click", (e) => { e.stopPropagation(); toggleSurfaceExpanded(s.id); });
            srow.appendChild(sCaret);
          } else {
            const sp = document.createElement("span"); sp.className = "caret"; sp.textContent = " ";
            srow.appendChild(sp);
          }
          const ic = document.createElement("span");
          ic.className = "micon"; ic.textContent = s.mode === "floor" ? "▭" : "▯";
          const sn = document.createElement("span");
          sn.className = "tree-name"; sn.textContent = s.name;
          srow.append(ic, sn);
          srow.addEventListener("click", (e) => {
            if (e.target.closest(".tree-btn")) return;
            if (!isActive) { switchProject(p.id); switchSurface(i); }
            else switchSurface(i);
          });
          const se = treeBtn("✎", "", "Felület átnevezése");
          se.addEventListener("click", (e) => { e.stopPropagation(); if (!isActive) switchProject(p.id); renameSurfaceFn(i); });
          const sd = treeBtn("✕", "del", "Felület törlése");
          sd.disabled = p.surfaces.length <= 1;
          sd.addEventListener("click", (e) => { e.stopPropagation(); if (!isActive) switchProject(p.id); deleteSurfaceFn(i); });
          srow.append(se, sd);
          root.appendChild(srow);
          // Gyermek-felületek megjelenítése, ha kinyitva
          if (hasChildren && sOpen) {
            children.forEach(({ s: cs, i: ci }) => renderSurface(cs, ci, depth + 1));
          }
        };
        p.surfaces.forEach((s, i) => {
          if (s.parentSurfaceId) return; // gyermekeket a szülőjüknél rendereljük
          renderSurface(s, i, 0);
        });
        if (isActive) {
          const add = document.createElement("div");
          add.className = "tree-add"; add.textContent = "+ Felület";
          add.addEventListener("click", addSurface);
          root.appendChild(add);
        }
      }
    });
  }

