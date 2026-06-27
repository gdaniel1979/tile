"use strict";
  function saveActiveSurface() {
    const s = project.surfaces[project.activeIndex];
    if (!s) return;
    s.mode = state.mode;
    s.points = state.points;
    s.closed = state.closed;
    s.snap = state.snap; s.gridMm = state.gridMm; s.ortho = state.ortho;
    s.baseId = state.tiles.baseId; s.groutMm = state.tiles.groutMm; s.groutColor = state.tiles.groutColor;
    s.cutouts = state.cutouts;
    s.edgeNames = state.edgeNames;
    s.edgeEdgings = state.edgeEdgings;
    s.layout = state.layout;
  }

  function loadActiveSurface() {
    const s = project.surfaces[project.activeIndex];
    state.mode = s.mode;
    state.points = s.points;
    state.closed = s.closed;
    state.snap = s.snap; state.gridMm = s.gridMm; state.ortho = s.ortho;
    state.selected = null;
    state.unit = project.unit;
    state.tiles = { types: project.tileTypes, baseId: s.baseId, groutMm: s.groutMm, groutColor: s.groutColor };
    if (!Array.isArray(s.cutouts)) s.cutouts = [];
    state.cutouts = s.cutouts;
    if (!Array.isArray(s.edgeNames)) s.edgeNames = [];
    state.edgeNames = s.edgeNames;
    if (!Array.isArray(s.edgeEdgings)) s.edgeEdgings = [];
    state.edgeEdgings = s.edgeEdgings;
    state.layout = s.layout;
  }

