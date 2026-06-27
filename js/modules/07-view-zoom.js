"use strict";
  // ---- Nézet: fit & zoom -------------------------------------------------
  function fitView() {
    const { w, h } = cssSize();
    if (state.points.length < 2) {
      // Alaphelyzet: origó kicsit beljebb
      state.view.scale = 0.15;
      state.view.ox = 60;
      state.view.oy = 60;
      render();
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.points.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const bw = Math.max(maxX - minX, 1);
    const bh = Math.max(maxY - minY, 1);
    const pad = 80;
    const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
    state.view.scale = Math.max(0.01, Math.min(scale, 5));
    state.view.ox = (w - bw * state.view.scale) / 2 - minX * state.view.scale;
    state.view.oy = (h - bh * state.view.scale) / 2 - minY * state.view.scale;
    render();
  }

  function zoomAt(sx, sy, factor) {
    const before = screenToWorld(sx, sy);
    state.view.scale = Math.max(0.01, Math.min(state.view.scale * factor, 8));
    // Tartsuk az egér alatti pontot a helyén
    state.view.ox = sx - before.x * state.view.scale;
    state.view.oy = sy - before.y * state.view.scale;
    render();
  }

