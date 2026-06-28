"use strict";
  // ---- Egér-interakció ---------------------------------------------------
  let drag = null;          // { type: "vertex"|"pan"|"edge"|"paint", ... , moved }
  let justDragged = false;  // jelzi, hogy a most lezárt művelet húzás volt
  let paintMode = false;    // egyedi lapok festése (5. fázis)
  let cutoutMode = false;   // kivágás rajzolása (9. fázis)
  let pendingCutout = null; // { x, y, w, h } – épp rajzolt kivágás (mm)
  let newCutoutKind = "opening"; // a következő rajzolt kivágás típusa
  const OPENING_COLOR = "#3f7fe0"; // nyílás (ajtó/ablak) fix színe
  let cutoutLabelRects = []; // a rajzon szerkeszthető kivágás-méretek
  let selectedCutout = -1;   // kijelölt kivágás indexe (méretek + Delete + mozgatás)
  let snapGuides = [];       // húzás közben látható snap-segédvonalak (world-koord.)

  function getMouse(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // Réteg-kapcsolt kivágás-keresés: a vásznon csak az AKTÍV réteg
  // (selectedCutout — lásd a Rétegek panelt) reagál a kattintásra, hogy az
  // átfedő kivágások ne "nyeljék el" egymás (vagy a felület) elől a kattintást.
  function activeCutoutAt(sx, sy) {
    if (selectedCutout < 0) return -1;
    const pad = 4;
    // csoport esetén bármelyik darabja reagál — felülről lefelé (utolsó index a legfelül)
    const indices = cutoutGroupIndices(selectedCutout);
    for (let k = indices.length - 1; k >= 0; k--) {
      const ci = indices[k];
      const c = state.cutouts[ci];
      const a = worldToScreen({ x: c.x, y: c.y });
      const b = worldToScreen({ x: c.x + c.w, y: c.y + c.h });
      if (sx >= a.x - pad && sx <= b.x + pad && sy >= a.y - pad && sy <= b.y + pad) return ci;
    }
    return -1;
  }

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("mousedown", (e) => {
    justDragged = false;
    const m = getMouse(e);
    if (e.button === 2) {
      drag = { type: "pan", startX: m.x, startY: m.y, ox: state.view.ox, oy: state.view.oy, moved: false };
      return;
    }
    if (e.button === 0) {
      // Kivágás méret-feliratra kattintás: a click megnyitja a szerkesztőt
      if (cutoutLabelAt(m.x, m.y)) return;
      // Festés mód: a kattintás/húzás lapokat fest, nem szerkeszt
      if (paintMode) {
        drag = { type: "paint", moved: false };
        const w = screenToWorld(m.x, m.y);
        if (applyPaintAt(w.x, w.y)) render();
        return;
      }
      // Kivágás rajzolása: téglalap húzása
      if (cutoutMode) {
        const w = snapToBounds(snapWorld(screenToWorld(m.x, m.y)));
        drag = { type: "cutout", x0: w.x, y0: w.y, moved: false };
        pendingCutout = { x: w.x, y: w.y, w: 0, h: 0 };
        return;
      }
      const vi = vertexAt(m.x, m.y);
      if (vi >= 0) {
        state.selected = vi;
        selectedCutout = -1;
        drag = { type: "vertex", index: vi, moved: false };
        inDrag = true;
        afterSelectionChange();
        render();
        return;
      }
      // Réteg-kapcsolt áthelyezés: csak az AKTÍV kivágás-réteg mozgatható a
      // vásznon (a réteg-választás a jobb oldali Rétegek panelból megy) —
      // amíg egy kivágás aktív, a felület éle/címke nem reagál.
      if (selectedCutout >= 0) {
        const ci = activeCutoutAt(m.x, m.y);
        if (ci >= 0) {
          state.selected = null;
          selectedCutout = ci; // csoporton belül a konkrétan megfogott darab legyen a referencia
          const c = state.cutouts[ci];
          const grab = screenToWorld(m.x, m.y);
          drag = { type: "cutoutMove", ci, ox: c.x, oy: c.y, gx: grab.x, gy: grab.y, moved: false };
          inDrag = true;
          render();
        }
        return;
      }
      // Élhossz-feliratra kattintás: a click majd megnyitja a szerkesztőt,
      // ne induljon helyette él-húzás. (A záró él felirata nem szerkeszthető.)
      const li = labelAt(m.x, m.y);
      if (li >= 0 && li !== closingEdgeIndex()) return;

      const ei = edgeAt(m.x, m.y);
      if (ei >= 0) {
        const j = (ei + 1) % state.points.length;
        const grab = screenToWorld(m.x, m.y);
        drag = {
          type: "edge", i: ei, j,
          origA: { ...state.points[ei] },
          origB: { ...state.points[j] },
          gx: grab.x, gy: grab.y, moved: false,
        };
        inDrag = true;
        state.selected = null;
        afterSelectionChange();
        render();
      }
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const m = getMouse(e);
    drag.moved = true;
    justDragged = true;
    if (drag.type === "pan") {
      state.view.ox = drag.ox + (m.x - drag.startX);
      state.view.oy = drag.oy + (m.y - drag.startY);
      render();
    } else if (drag.type === "vertex") {
      let wp = snapWorld(screenToWorld(m.x, m.y));
      const prev = state.points[(drag.index - 1 + state.points.length) % state.points.length];
      if (state.ortho && (state.closed || drag.index > 0)) wp = applyOrtho(wp, prev);
      state.points[drag.index] = wp;
      afterGeometryChange();
    } else if (drag.type === "edge") {
      const cur = screenToWorld(m.x, m.y);
      let dx = cur.x - drag.gx, dy = cur.y - drag.gy;
      if (state.ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
      if (state.snap) {
        const g = state.gridMm;
        dx = Math.round(dx / g) * g;
        dy = Math.round(dy / g) * g;
      }
      state.points[drag.i] = { x: drag.origA.x + dx, y: drag.origA.y + dy };
      state.points[drag.j] = { x: drag.origB.x + dx, y: drag.origB.y + dy };
      afterGeometryChange();
    } else if (drag.type === "paint") {
      const w = screenToWorld(m.x, m.y);
      if (applyPaintAt(w.x, w.y)) render();
    } else if (drag.type === "cutout") {
      const w = snapToBounds(snapWorld(screenToWorld(m.x, m.y)));
      pendingCutout = {
        x: Math.min(drag.x0, w.x), y: Math.min(drag.y0, w.y),
        w: Math.abs(w.x - drag.x0), h: Math.abs(w.y - drag.y0),
      };
      render();
    } else if (drag.type === "cutoutMove") {
      const c = state.cutouts[drag.ci];
      if (c) {
        const cur = screenToWorld(m.x, m.y);
        let dx = cur.x - drag.gx, dy = cur.y - drag.gy;
        if (state.snap) { const gr = state.gridMm; dx = Math.round(dx / gr) * gr; dy = Math.round(dy / gr) * gr; }
        let nx = drag.ox + dx, ny = drag.oy + dy;
        const snapped = snapCutoutDuringDrag(c, nx, ny);
        c.x = snapped.x; c.y = snapped.y;
        snapGuides = snapped.guides;
        render();
      }
    }
  });

  window.addEventListener("mouseup", () => {
    const wasDrag = drag;
    drag = null;
    if (!wasDrag) return;
    if (wasDrag.type === "cutout") {
      if (pendingCutout && pendingCutout.w > 5 && pendingCutout.h > 5) {
        state.cutouts.push({ ...pendingCutout, kind: newCutoutKind, name: "" });
        selectedCutout = state.cutouts.length - 1; // az új kivágás kijelölve (méretek látszanak)
        pendingCutout = null;
        afterGeometryChange(); // save → előzmény
      } else {
        pendingCutout = null;
        render();
      }
    } else if (wasDrag.type === "cutoutMove") {
      inDrag = false;
      snapGuides = [];
      if (wasDrag.moved) afterGeometryChange(); // áthelyezés után újragenerálás + előzmény
      else render();
    } else if (wasDrag.type === "paint") {
      save();
    } else if (wasDrag.type === "vertex" || wasDrag.type === "edge") {
      inDrag = false;
      if (wasDrag.moved) pushHistory(); // a húzás végén egyetlen előzmény-bejegyzés
    }
  });

  // Kattintás a vásznon: pont hozzáadása / sokszög zárása
  canvas.addEventListener("click", (e) => {
    if (e.button !== 0) return;
    const m = getMouse(e);
    // Ha épp húztunk csúcsot/panoltunk/kivágást, ne adjunk hozzá pontot
    if (justDragged) { justDragged = false; return; }

    // Kivágás méret-felirat: kattintásra szerkeszthető
    const cl = cutoutLabelAt(m.x, m.y);
    if (cl) { openCutoutEditor(cl.ci, cl.dim); return; }

    if (paintMode) return;   // festést a mousedown kezeli
    if (cutoutMode) return;  // kivágás rajzolását a mousedown/move kezeli

    const vi = vertexAt(m.x, m.y);
    if (vi >= 0) {
      // Kezdőpontra kattintás nyitott állapotban => zárás
      if (!state.closed && vi === 0 && state.points.length >= 3) {
        state.closed = true;
        state.selected = null;
        afterGeometryChange();
        return;
      }
      state.selected = vi;
      selectedCutout = -1;
      afterSelectionChange();
      return;
    }

    // Amíg egy kivágás-réteg aktív (Rétegek panel), a kattintást a mousedown
    // már kezelte (mozgatás) — a felület éle/címkéje eddig nem reagál.
    if (selectedCutout >= 0) return;

    // Élhossz-felirat: kattintásra megnyílik a szerkesztő mező
    const li = labelAt(m.x, m.y);
    if (li >= 0 && li !== closingEdgeIndex()) { openLabelEditor(li); return; }

    if (state.closed) {
      // zárt sokszögnél üres kattintás: kijelölés törlése
      if (state.selected !== null) {
        state.selected = null;
        afterSelectionChange();
      }
      return;
    }

    // Új pont hozzáadása
    let wp = snapWorld(screenToWorld(m.x, m.y));
    const prev = state.points[state.points.length - 1];
    if (state.ortho) wp = applyOrtho(wp, prev);
    state.points.push(wp);
    state.selected = state.points.length - 1;
    afterGeometryChange();
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    closeLabelEditor();
    const m = getMouse(e);
    zoomAt(m.x, m.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  // Hover-kurzor: jelezze, mi van az egér alatt
  canvas.addEventListener("mousemove", (e) => {
    if (drag) return;
    const m = getMouse(e);
    if (cutoutLabelAt(m.x, m.y)) { canvas.style.cursor = "text"; return; }
    if (cutoutMode) { canvas.style.cursor = "crosshair"; return; }
    if (paintMode) { canvas.style.cursor = "cell"; return; }
    if (vertexAt(m.x, m.y) >= 0) { canvas.style.cursor = "pointer"; return; }
    if (selectedCutout >= 0) {
      canvas.style.cursor = activeCutoutAt(m.x, m.y) >= 0 ? "move" : "default";
      return;
    }
    const li = labelAt(m.x, m.y);
    if (li >= 0 && li !== closingEdgeIndex()) canvas.style.cursor = "text";
    else if (edgeAt(m.x, m.y) >= 0) canvas.style.cursor = "move";
    else canvas.style.cursor = "crosshair";
  });

  // Dupla kattintás egy pontra: törlés
  canvas.addEventListener("dblclick", (e) => {
    const m = getMouse(e);
    const vi = vertexAt(m.x, m.y);
    if (vi >= 0) deleteVertex(vi);
  });

  // Delete: kijelölt kivágás vagy csúcs törlése; Ctrl+Z/Y: undo/redo
  window.addEventListener("keydown", (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    const inField = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
    if ((e.ctrlKey || e.metaKey) && !inField) {
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); return; }
      if (k === "s") { e.preventDefault(); saveToLinkedFile(); return; }
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return; // mezőben gépelünk
      if (selectedCutout >= 0 && state.cutouts[selectedCutout]) {
        e.preventDefault();
        state.cutouts.splice(selectedCutout, 1);
        selectedCutout = -1;
        afterGeometryChange();
      } else if (state.selected !== null) {
        e.preventDefault();
        deleteVertex(state.selected);
      }
    }
    if (e.key === "Escape") {
      state.selected = null;
      selectedCutout = -1;
      afterSelectionChange();
    }
  });

