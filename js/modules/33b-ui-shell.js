"use strict";
  // ---- Alkalmazás-keret -----------------------------------------------------
  // Menüszalag-fülek, a Tulajdonságok panel tartalma, gomb-átirányítások
  // (data-click), panelek ki-be kapcsolása, színséma (világos / sötét / rendszer)
  // és az állapotsor. A mögöttes funkciók a meglévő vezérlőkön (id-k) keresztül
  // működnek — ez a modul csak a felület elrendezését kezeli.
  const THEME_KEY = "tile-planner-theme";
  const PANES_KEY = "tile-planner-panes";
  const PANE_SIDE_KEY = "tile-planner-pane-side";
  const RIBBON_KEY = "tile-planner-ribbon-tab";
  const COLLAPSE_KEY = "tile-planner-ribbon-collapsed";
  const PROPS_TITLES = {
    file: "Projekt adatai",
    view: "Nézet",
    plan: "Alaprajz",
    tiles: "Burkolat",
    layout: "Kiosztás",
    material: "Anyag — egész projekt",
    quote: "Árajánlat",
  };
  const appEl = document.getElementById("app");
  const themeMq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function initShell() {
    applyIcons();
    // a (rejtett) csoportnév buborékként jelenik meg a csoport fölött
    document.querySelectorAll(".rgroup").forEach((g) => {
      const l = g.querySelector(".rgroup-label");
      if (l && !g.title) g.title = l.textContent;
    });
    el.tabs.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-tab]");
      if (!b) return;
      selectRibbonTab(b.dataset.tab);
      if (appEl.classList.contains("ribbon-collapsed")) appEl.classList.add("ribbon-peek");
    });
    el.tabs.addEventListener("dblclick", (e) => { if (e.target.closest("button[data-tab]")) toggleRibbonCollapsed(); });
    initRibbonCollapse();
    initProxies();
    initPaneToggles();
    initPaneSide();
    initTheme();
    // a vászon minden méretváltozásra (panel ki/be, húzás, menüszalag) újraméreteződik
    if (window.ResizeObserver) {
      let raf = 0;
      new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(resizeCanvas); }).observe(wrap);
    }
  }

  // ---- Menüszalag összecsukása és teljes vászon mód ---------------------------------
  function setRibbonCollapsed(on, silent) {
    appEl.classList.toggle("ribbon-collapsed", on);
    appEl.classList.remove("ribbon-peek");
    if (!silent) { try { localStorage.setItem(COLLAPSE_KEY, on ? "1" : "0"); } catch (_) {} }
  }
  function toggleRibbonCollapsed() {
    if (appEl.classList.contains("focus-mode")) { toggleFocusMode(); return; }
    setRibbonCollapsed(!appEl.classList.contains("ribbon-collapsed"));
  }
  let collapsedBeforeFocus = false;
  function toggleFocusMode() {
    const on = !appEl.classList.contains("focus-mode");
    if (on) collapsedBeforeFocus = appEl.classList.contains("ribbon-collapsed");
    appEl.classList.toggle("focus-mode", on);
    setRibbonCollapsed(on ? true : collapsedBeforeFocus, true);
  }
  function initRibbonCollapse() {
    let c = false;
    try { c = localStorage.getItem(COLLAPSE_KEY) === "1"; } catch (_) {}
    setRibbonCollapsed(c, true);
    document.getElementById("ribbonCollapseBtn").addEventListener("click", toggleRibbonCollapsed);
    document.getElementById("focusModeBtn").addEventListener("click", toggleFocusMode);
    // összecsukott állapotban a kinyitott menüszalag a mellé kattintásra bezárul
    document.addEventListener("pointerdown", (e) => {
      if (appEl.classList.contains("ribbon-peek") && !e.target.closest(".ribbon")) appEl.classList.remove("ribbon-peek");
    });
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "F1") { e.preventDefault(); toggleRibbonCollapsed(); }
      else if (e.ctrlKey && e.shiftKey && (e.key === "F" || e.key === "f")) { e.preventDefault(); toggleFocusMode(); }
      else if (e.key === "Escape" && appEl.classList.contains("ribbon-peek")) appEl.classList.remove("ribbon-peek");
    });
  }

  // ---- Menüszalag ------------------------------------------------------------
  function selectRibbonTab(tab) {
    if (!document.querySelector('[data-rtab="' + tab + '"]')) tab = "plan";
    [...el.tabs.children].forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-rtab]").forEach((p) => { p.hidden = p.dataset.rtab !== tab; });
    if (PROPS_TITLES[tab]) showProps(tab);
    // az Anyag / Ajánlat / Fájl (projekt adatai) minden felület friss számaival
    if (tab === "material" || tab === "quote" || tab === "file") recomputeAllSurfacesMaterial();
    if (tab === "file") renderFileInfo();
    if (tab === "view") renderViewInfo();
    if (tab === "quote") syncQuoteUI();
    try { localStorage.setItem(RIBBON_KEY, tab); } catch (_) {}
  }
  // induláskor a legutóbb használt menüszalag-fül
  function restoreRibbonTab() {
    let t = "plan";
    try { t = localStorage.getItem(RIBBON_KEY) || "plan"; } catch (_) {}
    selectRibbonTab(t);
  }

  function activeRibbonTab() {
    const b = el.tabs && el.tabs.querySelector("button.active");
    return b ? b.dataset.tab : "";
  }

  // Nézet fül → Tulajdonságok: az aktuális nézet adatai
  function renderViewInfo() {
    const box = document.getElementById("viewInfo");
    if (!box || !state || !state.view) return;
    const is3d = el.board3d && el.board3d.style.display !== "none" && el.board3d.style.display !== "";
    const grid = state.gridMm >= 10 && state.unit === "cm" ? (state.gridMm / 10) + " cm" : state.gridMm + " mm";
    const rows = [
      ["Nézet", is3d ? "3D" : "2D alaprajz"],
      ["Méretarány", "M 1:" + Math.max(1, Math.round(PX_PER_MM_96DPI / state.view.scale)) + " (képernyőn)"],
      ["Mértékegység", state.unit],
      ["Rács", grid],
      ["Rácshoz illesztés", state.snap ? "be" : "ki"],
      ["Derékszög (ortho)", state.ortho ? "be" : "ki"],
      ["Tulajdonságok helye", document.documentElement.dataset.paneSide === "right" ? "jobb oldalt" : "bal oldalt"],
    ];
    box.innerHTML = rows.map(([k, v]) => "<span>" + escapeHtml(k) + "</span><span>" + escapeHtml(String(v)) + "</span>").join("");
  }

  function showProps(tab) {
    document.querySelectorAll("[data-tabpanel]").forEach((p) => { p.hidden = p.dataset.tabpanel !== tab; });
    if (el.propsTitle) el.propsTitle.textContent = PROPS_TITLES[tab] || "";
  }

  // ---- Gomb-átirányítások -------------------------------------------------------
  // data-click="selector": a gomb a cél-vezérlőt „nyomja meg” (pl. a címsor Mentés
  // gombja a Fájl fül Mentés gombját), és átveszi annak letiltott állapotát.
  // data-show-panel="selector": a Tulajdonságok panel megfelelő részéhez visz.
  function initProxies() {
    document.querySelectorAll("[data-click]").forEach((btn) => {
      const target = document.querySelector(btn.dataset.click);
      if (!target) return;
      btn.addEventListener("click", () => target.click());
      const sync = () => { btn.disabled = !!target.disabled; };
      sync();
      new MutationObserver(sync).observe(target, { attributes: true, attributeFilter: ["disabled"] });
    });
    document.querySelectorAll("[data-show-panel]").forEach((btn) => {
      const panel = document.querySelector(btn.dataset.showPanel);
      const host = panel && panel.closest("[data-tabpanel]");
      if (!host) return;
      const baseTitle = btn.title;
      btn.addEventListener("click", () => {
        setPaneVisible("right", true);
        showProps(host.dataset.tabpanel);
        panel.scrollIntoView({ block: "start", behavior: "smooth" });
        panel.classList.remove("flash"); void panel.offsetWidth; panel.classList.add("flash");
        const first = panel.querySelector("input");
        if (first) first.focus({ preventScroll: true });
      });
      // a rejtett panel gombja letiltva (pl. előtétfal csak fal-felületen)
      const sync = () => {
        btn.disabled = panel.hidden;
        btn.title = panel.hidden && btn.dataset.showPanel === "#preWallPanel" ? "Előtétfal csak fal-felületre tehető — válts egy falra" : baseTitle;
      };
      sync();
      new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    });
  }

  // ---- Panelek ki-be (Nézet fül) ----------------------------------------------
  function paneState() {
    const st = { left: true, right: true, nav: true, hints: true };
    try { Object.assign(st, JSON.parse(localStorage.getItem(PANES_KEY) || "{}")); } catch (_) {}
    return st;
  }
  function setPaneVisible(which, on, silent) {
    appEl.classList.toggle("hide-" + which, !on);
    const cb = document.querySelector('[data-pane="' + which + '"]');
    if (cb) cb.checked = on;
    if (silent) return;
    const st = paneState(); st[which] = on;
    try { localStorage.setItem(PANES_KEY, JSON.stringify(st)); } catch (_) {}
  }
  function initPaneToggles() {
    const st = paneState();
    Object.keys(st).forEach((k) => setPaneVisible(k, st[k] !== false, true));
    document.querySelectorAll("[data-pane]").forEach((cb) => {
      cb.addEventListener("change", () => setPaneVisible(cb.dataset.pane, cb.checked));
    });
  }

  // ---- Oldalpanel helye: bal / jobb (Nézet fül) ------------------------------------
  // A html data-pane-side attribútumát már a <head> szkriptje beállítja (villanás nélkül).
  function setPaneSide(side, silent) {
    document.documentElement.dataset.paneSide = side;
    el.paneSideSeg.querySelectorAll("button[data-side]").forEach((b) => b.classList.toggle("active", b.dataset.side === side));
    if (silent) return;
    try { localStorage.setItem(PANE_SIDE_KEY, side); } catch (_) {}
    resizeCanvas();
  }
  function initPaneSide() {
    if (!el.paneSideSeg) return;
    setPaneSide(document.documentElement.dataset.paneSide === "right" ? "right" : "left", true);
    el.paneSideSeg.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-side]");
      if (b) setPaneSide(b.dataset.side);
    });
  }

  // ---- Színséma ------------------------------------------------------------------
  const THEME_NAMES = { system: "rendszer", light: "világos", dark: "sötét" };
  function themePref() {
    try { return localStorage.getItem(THEME_KEY) || "system"; } catch (_) { return "system"; }
  }
  function applyTheme(pref, silent) {
    const eff = pref === "system" ? (themeMq && themeMq.matches ? "dark" : "light") : pref;
    document.documentElement.dataset.theme = eff;
    [...el.themeSeg.children].forEach((b) => b.classList.toggle("active", b.dataset.theme === pref));
    const cyc = document.querySelector("[data-theme-cycle]");
    if (cyc) {
      cyc.innerHTML = '<i class="ic">' + iconSvg(pref) + "</i>";
      cyc.title = "Téma: " + THEME_NAMES[pref] + " (kattintásra vált)";
    }
    // vászon-színek a CSS-változókból
    const cs = getComputedStyle(document.documentElement);
    ["grid", "origin", "text"].forEach((k) => {
      const v = cs.getPropertyValue("--cv-" + k).trim();
      if (v) CV[k] = v;
    });
    if (silent) return;
    render();
    if (el.board3d && el.board3d.style.display !== "none") render3D();
  }
  function setTheme(pref) {
    try { localStorage.setItem(THEME_KEY, pref); } catch (_) {}
    applyTheme(pref);
  }
  function initTheme() {
    el.themeSeg.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-theme]");
      if (b) setTheme(b.dataset.theme);
    });
    const cyc = document.querySelector("[data-theme-cycle]");
    if (cyc) {
      cyc.addEventListener("click", () => {
        const order = ["system", "light", "dark"];
        setTheme(order[(order.indexOf(themePref()) + 1) % order.length]);
      });
    }
    if (themeMq && themeMq.addEventListener) {
      themeMq.addEventListener("change", () => { if (themePref() === "system") applyTheme("system"); });
    }
    applyTheme(themePref(), true);
  }

  // ---- Állapotsor ------------------------------------------------------------------
  // (a terület, a kerület és a zárt/nyitott állapot az updateSummary-ből jön)
  const PX_PER_MM_96DPI = 96 / 25.4;
  function updateStatusBar() {
    if (!el.sbZoom) return;
    el.sbUnit.textContent = state.unit;
    // méretarány a képernyőn (96 dpi): pl. „M 1:50”
    el.sbZoom.textContent = "M 1:" + Math.max(1, Math.round(PX_PER_MM_96DPI / state.view.scale));
    if (activeRibbonTab() === "view") renderViewInfo();
    const m = materialNumbers();
    el.sbTiles.textContent = m ? m.tilesNeeded + " db (tartalékkal " + m.finalTiles + ")" : "–";
    el.sbWaste.textContent = m ? m.wastePct.toFixed(0) + " %" : "–";
  }

  // Rövid, magától eltűnő értesítés a vászon alján (nem felugró ablak)
  let toastTimer = 0;
  function showToast(msg, ms) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status");
      t.addEventListener("click", () => { t.hidden = true; });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms || 7000);
  }

  // Mentés-visszajelzés a Mentés gombon (a projektfájlba írás után)
  function flashSaved() {
    const lbl = el.saveFileBtn && el.saveFileBtn.querySelector(".lbl");
    if (!lbl) return;
    lbl.textContent = "Mentve ✓";
    setTimeout(() => { lbl.textContent = "Mentés"; }, 900);
  }
