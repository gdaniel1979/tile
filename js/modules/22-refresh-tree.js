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
    const rn = s.roomName ? escapeHtml(s.roomName) : "";
    t.innerHTML = pn
      + (rn ? '<span class="sep">—</span><span class="room">' + rn + '</span>' : "")
      + '<span class="sep">—</span><span class="surf">' + sn + '</span>';
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
  const expandedRooms = new Set();    // melyik helyiség-csoport van kinyitva ("projektId::roomName")
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
  function toggleRoomExpanded(key) {
    if (expandedRooms.has(key)) expandedRooms.delete(key);
    else expandedRooms.add(key);
    renderProjectTree();
  }

  // Másik projekt felületeinek beolvasztása az aktívba, helyiség-csoportként megjelölve.
  function mergeProjectIntoActive(sourceId) {
    if (sourceId === store.activeProjectId) return;
    const src = store.projects.find((x) => x.id === sourceId);
    if (!src) return;
    if (!confirm("Beolvasztjuk a(z) „" + src.name + "” projekt összes felületét a(z) „" + project.name + "” projektbe (mint „" + src.name + "” helyiség)? A(z) „" + src.name + "” projekt ezután törlődik.")) return;
    saveActiveSurface();
    // Laptípus-azonosítók ütközésének feloldása: ha a forrás projekt egy típusa
    // ugyanazt az id-t használja, mint a célban már létező típus, újat generálunk
    // és minden hivatkozást (baseId, paintTypeId, overrides) átírunk rá.
    const idMap = {};
    src.tileTypes.forEach((t) => {
      let newId = t.id;
      if (project.tileTypes.some((x) => x.id === newId)) {
        newId = "t" + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
      }
      idMap[t.id] = newId;
      project.tileTypes.push({ ...t, id: newId });
    });
    const remap = (id) => (id && idMap[id]) ? idMap[id] : id;
    src.surfaces.forEach((s) => {
      s.baseId = remap(s.baseId);
      if (s.layout) {
        s.layout.paintTypeId = remap(s.layout.paintTypeId);
        if (s.layout.overrides && typeof s.layout.overrides === "object") {
          Object.keys(s.layout.overrides).forEach((k) => { s.layout.overrides[k] = remap(s.layout.overrides[k]); });
        }
      }
      if (!s.roomName) s.roomName = src.name;
    });
    project.surfaces.push(...src.surfaces);
    store.projects = store.projects.filter((x) => x.id !== sourceId);
    expandedRooms.add(store.activeProjectId + "::" + src.name);
    refreshAll();
  }

  // Helyiség átnevezése: minden tagjának roomName-jét átírja.
  function renameRoomFn(projectId, roomName) {
    const p = store.projects.find((x) => x.id === projectId);
    if (!p) return;
    const name = prompt("Helyiség neve:", roomName);
    if (name === null) return;
    const trimmed = name.trim();
    p.surfaces.forEach((s) => { if (s.roomName === roomName) s.roomName = trimmed; });
    if (trimmed !== roomName) {
      const oldKey = projectId + "::" + roomName, newKey = projectId + "::" + trimmed;
      if (expandedRooms.has(oldKey)) { expandedRooms.delete(oldKey); expandedRooms.add(newKey); }
    }
    renderProjectTree();
    save();
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
      const merge = treeBtn("⇒", "", "Beolvasztás az aktív projektbe (mint helyiség)");
      merge.disabled = isActive;
      merge.addEventListener("click", (e) => { e.stopPropagation(); mergeProjectIntoActive(p.id); });
      const del = treeBtn("✕", "del", "Projekt törlése");
      del.disabled = store.projects.length <= 1;
      del.addEventListener("click", (e) => { e.stopPropagation(); deleteProjectFn(p.id); });
      prow.append(edit, merge, del);
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
        // Felső szintű felületek listája (gyermekeket a szülőjüknél rendereljük),
        // helyiség-csoportokba (roomName) szervezve. Az egy helyiséghez tartozó
        // felületek a tömbben egymás után állnak (összevonáskor blokként kerülnek be).
        const top = p.surfaces
          .map((s, i) => ({ s, i }))
          .filter((x) => !x.s.parentSurfaceId);
        let idx = 0;
        while (idx < top.length) {
          const roomName = top[idx].s.roomName || "";
          if (!roomName) { renderSurface(top[idx].s, top[idx].i, 0); idx++; continue; }
          const group = [];
          while (idx < top.length && (top[idx].s.roomName || "") === roomName) { group.push(top[idx]); idx++; }
          const roomKey = p.id + "::" + roomName;
          const rOpen = expandedRooms.has(roomKey);
          const rrow = treeRow("tree-room");
          const rCaret = document.createElement("span");
          rCaret.className = "caret"; rCaret.textContent = rOpen ? "▾" : "▸";
          rCaret.title = rOpen ? "Összecsukás" : "Kinyitás";
          rCaret.addEventListener("click", (e) => { e.stopPropagation(); toggleRoomExpanded(roomKey); });
          const ric = document.createElement("span");
          ric.className = "micon"; ric.textContent = "🏠";
          const rn = document.createElement("span");
          rn.className = "tree-name"; rn.textContent = roomName;
          rrow.append(rCaret, ric, rn);
          rrow.addEventListener("click", (e) => { if (e.target.closest(".tree-btn")) return; toggleRoomExpanded(roomKey); });
          const re = treeBtn("✎", "", "Helyiség átnevezése");
          re.addEventListener("click", (e) => { e.stopPropagation(); if (!isActive) switchProject(p.id); renameRoomFn(p.id, roomName); });
          rrow.appendChild(re);
          root.appendChild(rrow);
          if (rOpen) group.forEach(({ s, i }) => renderSurface(s, i, 1));
        }
        if (isActive) {
          const add = document.createElement("div");
          add.className = "tree-add"; add.textContent = "+ Felület";
          add.addEventListener("click", addSurface);
          root.appendChild(add);
        }
      }
    });
  }

