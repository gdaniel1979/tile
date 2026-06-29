"use strict";
  // ---- 18. fázis: 3D nézet ------------------------------------------------
  // Saját Canvas 2D ortografikus projekcióval (Three.js nélkül). Minden
  // felület egy sík négyszög a 3D-térben (P0 = local (0,0) világ-pozíciója,
  // Ex/Ey = a felület local x/y tengelyének világ-irányú egységvektora
  // mm-enként), a textúráját a meglévő drawLayout/drawCutouts adja offscreen
  // vászonra rajzolva (mint a recomputeAllSurfacesMaterial-nál).
  let needRebuild3D = true;
  let textures3D = null;     // [{ idx, P0, Ex, Ey, tex:{canvas,wmm,hmm,pxPerMm} }]
  let scene3DCenter = { x: 0, y: 0, z: 0 };
  let scene3DRadius = 1;
  let cam3d = { az: -0.6, el: 0.5, zoom: 1, panX: 0, panY: 0 };
  let drag3d = null;

  function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

  function camBasis3D(az, elev) {
    const ca = Math.cos(az), sa = Math.sin(az), cz = Math.cos(elev), sz = Math.sin(elev);
    const D = { x: cz * ca, y: cz * sa, z: sz };
    const R = { x: -sa, y: ca, z: 0 };
    const U = { x: -sz * ca, y: -sz * sa, z: cz };
    return { D, R, U };
  }

  // Egy felület textúrája offscreen vászonra (transparens háttér, csak a
  // burkolat + kivágások a felület saját bbox-ára vágva).
  function buildSurfaceTexture(idx) {
    const s = project.surfaces[idx];
    if (!s || !Array.isArray(s.points) || s.points.length < 2) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    s.points.forEach((p) => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    const wmm = Math.max(maxX - minX, 1), hmm = Math.max(maxY - minY, 1);
    const MAXPX = 700;
    const pxPerMm = Math.min(MAXPX / wmm, MAXPX / hmm, 1.5);
    const outW = Math.max(1, Math.round(wmm * pxPerMm));
    const outH = Math.max(1, Math.round(hmm * pxPerMm));
    const off = document.createElement("canvas");
    off.width = outW; off.height = outH;

    const savedCtx = ctx, savedView = state.view, savedIndex = project.activeIndex;
    const wasSuppress = suppressHistory, wasInDrag = inDrag;
    suppressHistory = true; inDrag = true;
    ctx = off.getContext("2d");
    project.activeIndex = idx;
    loadActiveSurface();
    state.view = { scale: pxPerMm, ox: -minX * pxPerMm, oy: -minY * pxPerMm };
    try {
      if (shouldDrawLayout()) drawLayout();
      drawCutouts();
    } catch (_) { /* swallow */ }
    project.activeIndex = savedIndex;
    loadActiveSurface();
    ctx = savedCtx;
    state.view = savedView;
    suppressHistory = wasSuppress; inDrag = wasInDrag;
    return { canvas: off, wmm, hmm, pxPerMm };
  }

  // Minden felület térbeli elhelyezése. Padló + a belőle generált falak a
  // valós geometriájuk szerint; előtétfal-csoportok a szülő-falra illesztve a
  // kivágás-koordinátáik alapján; lépcső-csoportok önállóan, lépcsőzetesen;
  // a többi (nem generált) fal-felület egy sorban, a padló mellett.
  function collect3DPlacements() {
    const surfaces = project.surfaces;
    // Csak az aktív felület helyiség-csoportját (roomName) mutatjuk — ha több
    // korábbi projekt van egybe-olvasztva, ne keveredjen egy 3D jelenetbe
    // több helyiség padlója/fala.
    const activeSurf = surfaces[project.activeIndex];
    const activeRoom = (activeSurf && activeSurf.roomName) || "";
    const inActiveRoom = (s) => (s.roomName || "") === activeRoom;
    const placements = [];
    const placedByIdx = new Map();
    function addPlacement(idx, P0, Ex, Ey, extra) {
      const pl = Object.assign({ idx, P0, Ex, Ey }, extra || {});
      placements.push(pl);
      placedByIdx.set(idx, pl);
      return pl;
    }
    function floorCentroidWorld(floor, origin) {
      let cx = 0, cy = 0;
      floor.points.forEach((p) => { cx += p.x; cy += p.y; });
      cx /= floor.points.length; cy /= floor.points.length;
      return { x: cx + origin.ox, y: cy + origin.oy };
    }

    let rowX = 0;

    // 1) Padlók (zárt, nem gyermek-felület) - egymás mellé igazítva
    const floorOriginById = new Map();
    surfaces.forEach((s, idx) => {
      if (s.mode !== "floor" || !s.closed || s.points.length < 3 || s.parentSurfaceId || !inActiveRoom(s)) return;
      let minX = Infinity, maxX = -Infinity;
      s.points.forEach((p) => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; });
      const ox = rowX - minX, oy = 0;
      floorOriginById.set(s.id, { ox, oy });
      addPlacement(idx, { x: ox, y: oy, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
      rowX += (maxX - minX) + 1000;
    });

    // 2) Padlóból generált falak - a forrás-él felett, függőlegesen
    surfaces.forEach((w, idx) => {
      if (w.mode !== "wall" || !w.fromFloorId || typeof w.fromEdgeIndex !== "number" || !inActiveRoom(w)) return;
      const floor = surfaces.find((f) => f.id === w.fromFloorId);
      const origin = floor && floorOriginById.get(floor.id);
      if (!floor || !origin) return;
      const n = floor.points.length;
      const i = w.fromEdgeIndex;
      if (i < 0 || i >= n) return;
      const a = floor.points[i], b = floor.points[(i + 1) % n];
      const Aw = { x: a.x + origin.ox, y: a.y + origin.oy };
      const Bw = { x: b.x + origin.ox, y: b.y + origin.oy };
      const len = Math.hypot(Bw.x - Aw.x, Bw.y - Aw.y) || 1;
      const ux = (Bw.x - Aw.x) / len, uy = (Bw.y - Aw.y) / len;
      let wallH = 0; w.points.forEach((p) => { if (p.y > wallH) wallH = p.y; });
      const cen = floorCentroidWorld(floor, origin);
      const midx = (Aw.x + Bw.x) / 2, midy = (Aw.y + Bw.y) / 2;
      let nx = midx - cen.x, ny = midy - cen.y;
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      addPlacement(idx, { x: Aw.x, y: Aw.y, z: wallH }, { x: ux, y: uy, z: 0 }, { x: 0, y: 0, z: -1 },
        { H: { x: ux, y: uy, z: 0 }, N: { x: nx, y: ny, z: 0 } });
    });

    // 3) Előtétfal-csoportok: a szülő fal-placement + a kivágás-koordináták alapján
    surfaces.forEach((s, idx) => {
      if (s.groupKind !== "preWall" || !s.parentSurfaceId || !s.groupId || !inActiveRoom(s)) return;
      const parentIdx = surfaces.findIndex((x) => x.id === s.parentSurfaceId);
      const parentSurf = surfaces[parentIdx];
      const parentPl = placedByIdx.get(parentIdx);
      if (!parentSurf || !parentPl || !parentPl.H) return;
      const cutout = (parentSurf.cutouts || []).find((c) => c.groupId === s.groupId);
      if (!cutout) return;
      const H = parentPl.H, Down = { x: 0, y: 0, z: -1 }, N = parentPl.N;
      function wallPoint(lx, ly) {
        return {
          x: parentPl.P0.x + H.x * lx + Down.x * ly,
          y: parentPl.P0.y + H.y * lx + Down.y * ly,
          z: parentPl.P0.z + H.z * lx + Down.z * ly,
        };
      }
      let depthMm = 100;
      const siblingLeft = surfaces.find((x) => x.groupId === s.groupId && /: bal oldal$/.test(x.name));
      if (siblingLeft) { let mx = 0; siblingLeft.points.forEach((p) => { if (p.x > mx) mx = p.x; }); depthMm = mx; }
      const topLeft = wallPoint(cutout.x, cutout.y);
      const topRight = wallPoint(cutout.x + cutout.w, cutout.y);
      if (/: eleje$/.test(s.name)) {
        const P0 = { x: topLeft.x + N.x * depthMm, y: topLeft.y + N.y * depthMm, z: topLeft.z + N.z * depthMm };
        addPlacement(idx, P0, H, Down);
      } else if (/: teteje$/.test(s.name)) {
        addPlacement(idx, topLeft, H, N);
      } else if (/: bal oldal$/.test(s.name)) {
        addPlacement(idx, topLeft, N, Down);
      } else if (/: jobb oldal$/.test(s.name)) {
        addPlacement(idx, topRight, N, Down);
      }
    });

    // 4) Lépcső-csoportok: önállóan, lépcsőzetesen egy sorban
    const stairGroups = new Map();
    surfaces.forEach((s) => {
      if (s.groupKind === "stairs" && s.groupId && inActiveRoom(s)) {
        if (!stairGroups.has(s.groupId)) stairGroups.set(s.groupId, []);
        stairGroups.get(s.groupId).push(s);
      }
    });
    stairGroups.forEach((list) => {
      let cumRise = 0, cumDepth = 0, maxWidth = 0;
      for (let k = 0; k + 1 < list.length; k += 2) {
        const hom = list[k], lep = list[k + 1];
        const homIdx = surfaces.indexOf(hom), lepIdx = surfaces.indexOf(lep);
        let width = 0, riseMm = 0, depthMm = 0;
        hom.points.forEach((p) => { if (p.x > width) width = p.x; if (p.y > riseMm) riseMm = p.y; });
        lep.points.forEach((p) => { if (p.x > width) width = p.x; if (p.y > depthMm) depthMm = p.y; });
        if (width > maxWidth) maxWidth = width;
        const z = cumRise + riseMm;
        addPlacement(homIdx, { x: rowX, y: cumDepth, z }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
        addPlacement(lepIdx, { x: rowX, y: cumDepth, z }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
        cumRise += riseMm; cumDepth += depthMm;
      }
      rowX += maxWidth + 1000;
    });

    // 5) Egyéb, önálló (nem generált) fal-felületek - egy sorban felállítva
    surfaces.forEach((s, idx) => {
      if (s.mode !== "wall" || s.fromFloorId || s.groupKind || placedByIdx.has(idx) || !inActiveRoom(s)) return;
      if (!s.closed || s.points.length < 3) return;
      let width = 0, height = 0;
      s.points.forEach((p) => { if (p.x > width) width = p.x; if (p.y > height) height = p.y; });
      addPlacement(idx, { x: rowX, y: -1500, z: height }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
      rowX += width + 500;
    });

    return placements;
  }

  function ensure3DBuilt() {
    if (!needRebuild3D && textures3D) return;
    saveActiveSurface();
    const placements = collect3DPlacements();
    textures3D = placements.map((pl) => {
      const tex = buildSurfaceTexture(pl.idx);
      return tex ? Object.assign({ tex }, pl) : null;
    }).filter(Boolean);

    let cx = 0, cy = 0, cz = 0, cnt = 0;
    const corners = [];
    textures3D.forEach((t) => {
      const w = t.tex.wmm, h = t.tex.hmm;
      const c0 = t.P0;
      const c1 = { x: c0.x + t.Ex.x * w, y: c0.y + t.Ex.y * w, z: c0.z + t.Ex.z * w };
      const c2 = { x: c0.x + t.Ey.x * h, y: c0.y + t.Ey.y * h, z: c0.z + t.Ey.z * h };
      const c3 = { x: c1.x + t.Ey.x * h, y: c1.y + t.Ey.y * h, z: c1.z + t.Ey.z * h };
      [c0, c1, c2, c3].forEach((c) => { corners.push(c); cx += c.x; cy += c.y; cz += c.z; cnt++; });
    });
    if (cnt) { cx /= cnt; cy /= cnt; cz /= cnt; }
    scene3DCenter = { x: cx, y: cy, z: cz };
    let r = 1;
    corners.forEach((c) => { const d = Math.hypot(c.x - cx, c.y - cy, c.z - cz); if (d > r) r = d; });
    scene3DRadius = r || 1;
    needRebuild3D = false;
  }

  function resize3DCanvas() {
    if (!el.board3d) return;
    const dpr = window.devicePixelRatio || 1;
    const r = wrap.getBoundingClientRect();
    el.board3d.width = Math.round(r.width * dpr);
    el.board3d.height = Math.round(r.height * dpr);
    el.board3d.style.width = r.width + "px";
    el.board3d.style.height = r.height + "px";
    el.board3d.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render3D() {
    if (!el.board3d || el.board3d.style.display === "none") return;
    ensure3DBuilt();
    const c3 = el.board3d.getContext("2d");
    const r = wrap.getBoundingClientRect();
    const w = r.width, h = r.height;
    c3.clearRect(0, 0, w, h);
    if (!textures3D || !textures3D.length) {
      c3.fillStyle = "rgba(255,255,255,0.5)";
      c3.font = "13px sans-serif";
      c3.fillText("Nincs megjeleníthető felület (rajzolj egy zárt padlót).", 20, 30);
      return;
    }
    const { D, R, U } = camBasis3D(cam3d.az, cam3d.el);
    const scale = (Math.min(w, h) * 0.42 / scene3DRadius) * cam3d.zoom;
    const cx = w / 2 + cam3d.panX, cy = h / 2 + cam3d.panY;

    function projP(p) {
      const rel = { x: p.x - scene3DCenter.x, y: p.y - scene3DCenter.y, z: p.z - scene3DCenter.z };
      return { x: dot3(rel, R) * scale + cx, y: -dot3(rel, U) * scale + cy, depth: dot3(rel, D) };
    }

    const items = textures3D.map((t) => {
      const w_ = t.tex.wmm, h_ = t.tex.hmm;
      const c0 = t.P0;
      const c1 = { x: c0.x + t.Ex.x * w_, y: c0.y + t.Ex.y * w_, z: c0.z + t.Ex.z * w_ };
      const c2 = { x: c0.x + t.Ey.x * h_, y: c0.y + t.Ey.y * h_, z: c0.z + t.Ey.z * h_ };
      return { t, pc0: projP(c0), pc1: projP(c1), pc2: projP(c2) };
    });
    items.sort((a, b) => (a.pc0.depth + a.pc1.depth + a.pc2.depth) - (b.pc0.depth + b.pc1.depth + b.pc2.depth));

    items.forEach(({ t, pc0, pc1, pc2 }) => {
      const outW = t.tex.canvas.width, outH = t.tex.canvas.height;
      if (outW < 1 || outH < 1) return;
      const a = (pc1.x - pc0.x) / outW, b = (pc1.y - pc0.y) / outW;
      const c = (pc2.x - pc0.x) / outH, d = (pc2.y - pc0.y) / outH;
      c3.save();
      c3.transform(a, b, c, d, pc0.x, pc0.y);
      c3.drawImage(t.tex.canvas, 0, 0);
      c3.restore();
    });
  }

  function init3DUI() {
    if (!el.board3d) return;
    el.board3d.addEventListener("mousedown", (e) => {
      drag3d = { x: e.clientX, y: e.clientY, az0: cam3d.az, el0: cam3d.el };
      el.board3d.classList.add("dragging");
    });
    window.addEventListener("mousemove", (e) => {
      if (!drag3d) return;
      const dx = e.clientX - drag3d.x, dy = e.clientY - drag3d.y;
      cam3d.az = drag3d.az0 + dx * 0.006;
      cam3d.el = Math.max(-1.45, Math.min(1.45, drag3d.el0 - dy * 0.006));
      render3D();
    });
    window.addEventListener("mouseup", () => {
      if (!drag3d) return;
      drag3d = null;
      el.board3d.classList.remove("dragging");
    });
    el.board3d.addEventListener("wheel", (e) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 0.9 : 1 / 0.9;
      cam3d.zoom = Math.max(0.15, Math.min(10, cam3d.zoom * f));
      render3D();
    }, { passive: false });
    if (el.view3dResetBtn) {
      el.view3dResetBtn.addEventListener("click", () => {
        cam3d = { az: -0.6, el: 0.5, zoom: 1, panX: 0, panY: 0 };
        render3D();
      });
    }
    // 2D/3D váltó a vászon cím-sorában — független a bal oldali füektől:
    // bármelyik fülön lehetünk, a vászon külön dönthet 2D/3D nézet között.
    if (el.viewToggle) {
      el.viewToggle.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        const view = b.dataset.view;
        const is3d = view === "3d";
        [...el.viewToggle.children].forEach((c) => c.classList.toggle("active", c === b));
        canvas.style.display = is3d ? "none" : "block";
        el.board3d.style.display = is3d ? "block" : "none";
        if (el.canvasHelp2d) el.canvasHelp2d.style.display = is3d ? "none" : "flex";
        if (el.canvasHelp3d) el.canvasHelp3d.style.display = is3d ? "flex" : "none";
        if (el.view3dResetBtn) el.view3dResetBtn.style.display = is3d ? "inline-flex" : "none";
        if (is3d) { resize3DCanvas(); render3D(); }
      });
    }
  }

