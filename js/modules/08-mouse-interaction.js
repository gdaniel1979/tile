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
    const pad = 4 * touchHitBoost;
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
      if (wasDrag.moved) save(); // a húzás végén egyetlen mentés + előzmény-bejegyzés
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

  // Dupla kattintás egy pontra: törlés; egy élre: új töréspont beszúrása
  canvas.addEventListener("dblclick", (e) => {
    const m = getMouse(e);
    const vi = vertexAt(m.x, m.y);
    if (vi >= 0) { deleteVertex(vi); return; }
    const ei = edgeAt(m.x, m.y);
    if (ei >= 0) insertVertexOnEdge(ei, m.x, m.y);
  });

  // Új töréspont beszúrása a kattintott él legközelebbi pontján
  function insertVertexOnEdge(ei, sx, sy) {
    const [a, b] = edgeEndpoints(ei);
    const A = worldToScreen(a), B = worldToScreen(b);
    const vx = B.x - A.x, vy = B.y - A.y;
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? ((sx - A.x) * vx + (sy - A.y) * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const wp = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    shiftEdgeData("insert", ei);
    state.points.splice(ei + 1, 0, wp);
    state.selected = ei + 1;
    afterGeometryChange();
  }

  // Delete: kijelölt kivágás vagy csúcs törlése; Ctrl+Z/Y: undo/redo
  window.addEventListener("keydown", (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    const inField = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
    if ((e.ctrlKey || e.metaKey) && !inField) {
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); return; }
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (inField) return; // mezőben gépelünk
      if (selectedCutout >= 0 && state.cutouts[selectedCutout]) {
        e.preventDefault();
        // csoport a vásznon egy egységként van kijelölve → az egész csoport törlődik
        removeCutouts(cutoutGroupIndices(selectedCutout));
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

  // ---- Érintés (tablet) ----------------------------------------------------
  // Az ujjmozdulatokat a fenti egér-kezelők által értett eseményekké fordítjuk,
  // így minden szerkesztő funkció ugyanúgy működik ujjal is:
  //   koppintás = kattintás, dupla koppintás = dupla kattintás,
  //   húzás pontról/élről/kivágásról (vagy festés/kivágás-rajzolás módban) =
  //   ugyanaz, mint egérrel húzva; húzás üres területen = nézet mozgatása;
  //   két ujj = csípéses nagyítás + mozgatás.
  const TOUCH_HIT_BOOST = 2.2;  // ujjnál ennyiszer nagyobb elkapási terület
  const TAP_MOVE_PX = 8;        // ennél kisebb elmozdulás még koppintás
  const DOUBLE_TAP_MS = 350, DOUBLE_TAP_PX = 30;
  let touch1 = null;   // { id, x0, y0, x, y, moved, panning } — egyujjas művelet
  let pinch = null;    // { dist, mx, my } — kétujjas csípés
  let lastTap = null;  // { t, x, y } — dupla koppintás felismeréséhez

  function fireMouse(target, type, x, y, button) {
    target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: button || 0, bubbles: true, cancelable: true }));
  }
  function withTouchHit(fn) {
    touchHitBoost = TOUCH_HIT_BOOST;
    try { fn(); } finally { touchHitBoost = 1; }
  }
  function pinchOf(ts) {
    const a = ts[0], b = ts[1];
    return { dist: Math.max(1, Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)), mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2 };
  }
  function touchById(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
  }

  function endTouch1(asTap) {
    const t = touch1;
    touch1 = null;
    fireMouse(window, "mouseup", t.x, t.y, t.panning ? 2 : 0);
    if (!asTap || t.moved) return;
    const now = performance.now();
    withTouchHit(() => {
      fireMouse(canvas, "click", t.x0, t.y0);
      if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(t.x0 - lastTap.x, t.y0 - lastTap.y) < DOUBLE_TAP_PX) {
        fireMouse(canvas, "dblclick", t.x0, t.y0);
        lastTap = null;
      } else {
        lastTap = { t: now, x: t.x0, y: t.y0 };
      }
    });
  }

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault(); // nincs görgetés/zoom és „utánzott” egéresemény
    // mint egérkattintásnál: a nyitott mező (pl. felirat-szerkesztő) elveszti a fókuszt → mentődik
    const ae = document.activeElement;
    if (ae && ae !== document.body && typeof ae.blur === "function") ae.blur();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touch1 = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, moved: false, panning: false };
      withTouchHit(() => fireMouse(canvas, "mousedown", t.clientX, t.clientY, 0));
    } else if (e.touches.length === 2) {
      if (touch1) endTouch1(false); // a második ujj lezárja az egyujjas műveletet
      pinch = pinchOf(e.touches);
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (pinch && e.touches.length >= 2) {
      const cur = pinchOf(e.touches);
      const r = canvas.getBoundingClientRect();
      state.view.ox += cur.mx - pinch.mx;
      state.view.oy += cur.my - pinch.my;
      zoomAt(cur.mx - r.left, cur.my - r.top, cur.dist / pinch.dist); // rajzol is
      pinch = cur;
      return;
    }
    if (!touch1) return;
    const t = touchById(e.touches, touch1.id);
    if (!t) return;
    touch1.x = t.clientX; touch1.y = t.clientY;
    if (!touch1.moved && Math.hypot(t.clientX - touch1.x0, t.clientY - touch1.y0) > TAP_MOVE_PX) {
      touch1.moved = true;
      if (!drag) {
        // semmit nem fogtunk meg (üres terület) → a nézet mozgatása
        touch1.panning = true;
        fireMouse(canvas, "mousedown", touch1.x0, touch1.y0, 2);
      }
    }
    if (touch1.moved) fireMouse(window, "mousemove", t.clientX, t.clientY);
  }, { passive: false });

  function onTouchEnd(e) {
    e.preventDefault();
    if (pinch) {
      if (e.touches.length < 2) pinch = null; // a maradó ujj új érintésig nem csinál semmit
      return;
    }
    if (touch1 && !touchById(e.touches, touch1.id)) endTouch1(e.type === "touchend");
  }
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

