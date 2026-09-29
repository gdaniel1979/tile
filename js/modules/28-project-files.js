"use strict";
  // ---- Projektfájlok (.lapterv): Megnyitás / Mentés / Mentés másként ----------
  // 1 fájl = 1 projekt (belül JSON), mint egy Excel-munkafüzet. A fájl-handle-öket
  // (File System Access API) projekt-id szerint IndexedDB-ben tartjuk, így újraindítás
  // után is ugyanabba a fájlba ment a Ctrl+S. A böngészős tár közben továbbra is
  // automatikusan ment (munkapéldány); a „*” jelzi, ha a projekt eltér a fájlban
  // legutóbb mentett változattól. Ahol nincs File System Access (Firefox, Safari/iPad),
  // a Mentés letöltésként működik, a Megnyitás fájlválasztóval.
  const FILE_EXT = ".lapterv";
  const FILE_MIME = "application/x-lapterv+json";
  const FILES_KEY = "projectFiles";         // fájlnevek + mentett ujjlenyomatok
  const HANDLES_KEY = "projectFileHandles"; // fájl-handle-ök (külön, ha ezek nem menthetők, a nevek attól még megmaradnak)
  const fsaSupported = typeof window !== "undefined"
    && typeof window.showOpenFilePicker === "function"
    && typeof window.showSaveFilePicker === "function"
    && window.isSecureContext;

  const RECENT_KEY = "recentFiles";
  const RECENT_MAX = 10;
  let recentFiles = []; // [{ name, projectName, time, handle }] — legfrissebb elöl
  let skipUnloadWarning = false; // frissítéskor (új verzió) ne kérdezzen: a munka a böngészőben megmarad
  let fileHandles = {}; // projekt-id -> FileSystemFileHandle
  let fileMeta = {};    // projekt-id -> { name: fájlnév | null, sig: a legutóbb mentett állapot ujjlenyomata }

  // Ujjlenyomat a „változott-e mentés óta” kérdéshez. A képek (data URL) helyett csak
  // a hosszuk és a végük számít; az aktív felület (activeIndex) csak nézet, nem változás.
  // A kulcsokat rendezzük, mert a visszavonás (normalizálás) más sorrendben rakja össze őket.
  function projectSig(p) {
    if (p === project) saveActiveSurface();
    const s = JSON.stringify(p, (k, v) => {
      if (k === "activeIndex") return undefined;
      if (typeof v === "string" && v.length > 1024 && v.startsWith("data:")) return "img:" + v.length + ":" + v.slice(-48);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const o = {};
        for (const key of Object.keys(v).sort()) o[key] = v[key];
        return o;
      }
      return v;
    });
    let h1 = 0x811c9dc5, h2 = 7;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = (Math.imul(h2, 31) + c) | 0;
    }
    return s.length.toString(36) + ":" + (h1 >>> 0).toString(36) + ":" + (h2 >>> 0).toString(36);
  }
  function isDirty(p) {
    const m = fileMeta[p.id];
    return !!(m && m.sig && m.sig !== projectSig(p));
  }
  function fileNameOf(p) { const m = fileMeta[p.id]; return (m && m.name) || null; }

  function persistFiles() {
    const ids = new Set(store.projects.map((p) => p.id));
    for (const id of Object.keys(fileMeta)) if (!ids.has(id)) delete fileMeta[id];
    for (const id of Object.keys(fileHandles)) if (!ids.has(id)) delete fileHandles[id];
    idbSet(FILES_KEY, fileMeta).catch(() => {});
    idbSet(HANDLES_KEY, fileHandles).catch(() => {});
  }
  // savedAt: a fájl utolsó mentésének ideje (megnyitáskor a fájl módosítási ideje)
  function markSaved(p, name, savedAt) {
    fileMeta[p.id] = { name: name || fileNameOf(p), sig: projectSig(p), savedAt: savedAt || Date.now() };
    persistFiles();
    updateFileStatus();
  }
  // új, üres projekt: a további szerkesztés már „mentetlen változás”
  function trackNewProject(p) {
    fileMeta[p.id] = { name: null, sig: projectSig(p) };
    persistFiles();
  }
  function forgetProjectFile(id) {
    delete fileMeta[id]; delete fileHandles[id];
    persistFiles();
  }

  // ---- Állapot kijelzése: fájlnév, „*”, ablakcím, projektfa ----------------------
  let statusTimer = 0;
  function scheduleFileStatus() {
    if (statusTimer) return;
    statusTimer = setTimeout(() => { statusTimer = 0; updateFileStatus(); }, 120);
  }
  function updateFileStatus() {
    if (!store || !project) return;
    if (activeRibbonTab() === "file") renderFileInfo();
    const name = fileNameOf(project);
    const dirty = isDirty(project);
    if (el.fileNameNote) el.fileNameNote.textContent = (name || "nincs mentve") + (dirty ? " *" : "");
    const t = document.getElementById("canvasTitle");
    if (t) {
      let f = t.querySelector(".file");
      if (!f) { f = document.createElement("span"); f.className = "file"; t.prepend(f); }
      f.textContent = (name || "") + (dirty ? " *" : "");
      f.title = dirty ? "A legutóbbi mentés óta változott (Ctrl+S: mentés)" : (name ? "Mentve: " + name : "");
      f.hidden = !name && !dirty;
    }
    document.title = (dirty ? "*" : "") + (name || project.name || "Projekt") + " – Lapkiosztás tervező";
    document.querySelectorAll("#projTree [data-project-id]").forEach((row) => {
      const p = store.projects.find((x) => x.id === row.dataset.projectId);
      if (p) row.classList.toggle("dirty", isDirty(p));
    });
  }

  // ---- Megnyitás --------------------------------------------------------------------
  async function openProjectFile() {
    if (!fsaSupported) { el.openFileInput.click(); return; }
    let handles;
    try {
      handles = await window.showOpenFilePicker({
        id: "lapterv", multiple: true,
        types: [{ description: "Lapkiosztás terv", accept: { [FILE_MIME]: [FILE_EXT], "application/json": [".json"] } }],
      });
    } catch (e) {
      if (e && e.name !== "AbortError") alert("A megnyitás nem sikerült: " + (e.message || e));
      return;
    }
    for (const h of handles) await openHandle(h);
  }

  async function openHandle(handle) {
    // ha már nyitva van ugyanez a fájl, csak átváltunk rá
    for (const [id, h] of Object.entries(fileHandles)) {
      try {
        if (h && h.isSameEntry && await h.isSameEntry(handle)) {
          if (store.projects.some((p) => p.id === id)) { switchProject(id); return true; }
        }
      } catch (_) {}
    }
    let file;
    try {
      if (!(await ensurePermission(handle, "read"))) { alert("A fájl olvasásához engedély kell."); return false; }
      file = await handle.getFile();
    } catch (e) {
      if (e && e.name === "NotFoundError") {
        alert("A fájl nem található (áthelyezték, átnevezték vagy törölték): " + handle.name + "\n\nKivettem a legutóbbi fájlok listájából.");
        await removeRecent(handle);
      } else alert("A fájl nem olvasható: " + (e && e.message || e));
      return false;
    }
    await openFileObject(file, handle);
    return true;
  }

  async function openFileObject(file, handle) {
    let d;
    try { d = JSON.parse(await file.text()); } catch (e) { alert("Hibás vagy sérült fájl: " + file.name); return; }
    if (d && Array.isArray(d.projects)) { importStoreBackup(d); return; }
    if (!d || !Array.isArray(d.surfaces)) { alert("Ismeretlen fájlformátum: " + file.name); return; }
    saveActiveSurface();
    const p = normalizeProject(d);
    p.id = newProjectId(); // ütközés elkerülése
    store.projects.push(p);
    store.activeProjectId = p.id;
    expandedProjects.add(p.id);
    project = p;
    // csak a .lapterv fájlba mentünk vissza közvetlenül; egy régi .json projekt
    // megnyitás után még nincs fájlhoz kötve (az első Mentés .lapterv-et kér)
    const own = file.name.toLowerCase().endsWith(FILE_EXT);
    if (handle && own) fileHandles[p.id] = handle;
    loadActiveSurface();
    refreshAll();
    markSaved(p, own ? file.name : null, file.lastModified);
    if (handle && own) addRecent(handle, p);
  }

  // teljes tár (minden projekt) visszaállítása biztonsági mentésből
  function importStoreBackup(d) {
    if (!confirm("Ez egy teljes biztonsági mentés (minden projekt). Betöltés után lecseréli a jelenlegi projekteket. Folytatod?")) return;
    store = normalizeStore(d);
    project = activeProject();
    fileHandles = {}; fileMeta = {};
    loadActiveSurface();
    refreshAll();
    persistFiles();
    updateFileStatus();
  }

  // ---- Mentés / Mentés másként ---------------------------------------------------------
  const suggestedName = (p) => ((p.name || "Projekt").replace(/[\\/:*?"<>|]+/g, "_").trim() || "Projekt") + FILE_EXT;

  async function saveProjectFile(saveAs) {
    const p = project;
    const text = JSON.stringify(serializeProject(), null, 2);
    if (!fsaSupported) {
      // tartalék: letöltés (a böngésző a Letöltések mappába teszi)
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const name = fileNameOf(p) || suggestedName(p);
      triggerDownload(name, url);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      markSaved(p, name);
      flashSaved();
      return;
    }
    let h = saveAs ? null : fileHandles[p.id];
    if (!h) {
      try {
        h = await window.showSaveFilePicker({
          id: "lapterv", suggestedName: fileNameOf(p) || suggestedName(p),
          types: [{ description: "Lapkiosztás terv", accept: { [FILE_MIME]: [FILE_EXT] } }],
        });
      } catch (e) {
        if (e && e.name !== "AbortError") alert("A mentés nem sikerült: " + (e.message || e));
        return;
      }
    }
    try {
      if (!(await ensureRWPermission(h))) { alert("A fájl írásához engedély kell."); return; }
      const w = await h.createWritable();
      await w.write(text);
      await w.close();
    } catch (e) {
      alert("A mentés nem sikerült: " + (e && e.message || e));
      return;
    }
    fileHandles[p.id] = h;
    markSaved(p, h.name);
    addRecent(h, p);
    flashSaved();
  }

  async function ensureRWPermission(handle) { return ensurePermission(handle, "readwrite"); }
  async function ensurePermission(handle, mode) {
    if (!handle || !handle.queryPermission) return true;
    const opts = { mode };
    if ((await handle.queryPermission(opts)) === "granted") return true;
    return (await handle.requestPermission(opts)) === "granted";
  }

  // ---- Fájl fül → Tulajdonságok: a projekt adatai --------------------------------------------
  function infoRows(rows) {
    return rows.map(([k, v, cls]) => "<span>" + escapeHtml(k) + "</span><span" + (cls ? ' class="' + cls + '"' : "") + ">" + escapeHtml(String(v)) + "</span>").join("");
  }
  function renderFileInfo() {
    const info = document.getElementById("fileInfo");
    if (!info || !store || !project || activeRibbonTab() !== "file") return;
    const m = fileMeta[project.id];
    const name = fileNameOf(project);
    const dirty = isDirty(project);
    const unsaved = store.projects.filter(isDirty).length;
    const rows = [
      ["Projekt neve", project.name || "Projekt"],
      ["Fájl", name || "nincs (Ctrl+S: mentés fájlba)"],
      ["Állapot", dirty ? "mentetlen változás *" : name ? "mentve" : "csak a böngészőben", dirty ? "dirty" : ""],
    ];
    if (name && m && m.savedAt) rows.push(["Utolsó mentés", fmtRecentTime(m.savedAt)]);
    rows.push(["Nyitott projektek", store.projects.length + (unsaved ? " (" + unsaved + " mentetlen)" : "")]);
    info.innerHTML = infoRows(rows);

    const surfs = project.surfaces || [];
    const rooms = new Set(surfs.map((x) => x.roomName).filter(Boolean));
    const floors = surfs.filter((x) => x.mode === "floor").length;
    const t = computeProjectTileNumbers(project);
    document.getElementById("fileStats").innerHTML = infoRows([
      ["Helyiségek", rooms.size || "—"],
      ["Felületek", surfs.length + " (" + floors + " padló, " + (surfs.length - floors) + " fal)"],
      ["Burkolt terület", t.area > 0 ? (t.area / 1e6).toFixed(2) + " m²" : "—"],
      ["Szükséges lap", t.needed > 0 ? t.needed + " db" : "—"],
      ["Laptípusok", (project.tileTypes || []).length + " db"],
    ]);

    const rp = document.getElementById("fileRecentPanel");
    if (rp) rp.hidden = !fsaSupported;
    if (fsaSupported) renderRecentList(document.getElementById("fileRecent"), false);
  }

  // ---- Legutóbbi fájlok (Fájl fül → Legutóbbi ▾) ----------------------------------------
  // Csak File System Access mellett van értelme (a fájl-handle-lel nyitható meg újra).
  async function findRecent(handle) {
    for (let i = 0; i < recentFiles.length; i++) {
      const h = recentFiles[i].handle;
      try { if (h === handle || (h && h.isSameEntry && await h.isSameEntry(handle))) return i; } catch (_) {}
    }
    return -1;
  }
  function persistRecent() {
    idbSet(RECENT_KEY, recentFiles).catch(() => {});
    if (!el.recentFilesMenu.hidden) renderRecentMenu();
    renderFileInfo();
  }
  async function addRecent(handle, p) {
    const i = await findRecent(handle);
    if (i >= 0) recentFiles.splice(i, 1);
    recentFiles.unshift({ name: handle.name, projectName: p ? p.name : "", time: Date.now(), handle });
    recentFiles.length = Math.min(recentFiles.length, RECENT_MAX);
    persistRecent();
  }
  async function removeRecent(handle) {
    const i = await findRecent(handle);
    if (i >= 0) { recentFiles.splice(i, 1); persistRecent(); }
  }

  function fmtRecentTime(t) {
    const d = new Date(t), now = new Date();
    const hm = d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return "ma " + hm;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "tegnap " + hm;
    return d.toLocaleDateString("hu-HU") + " " + hm;
  }
  function closeRecentMenu() {
    el.recentFilesMenu.hidden = true;
    el.recentFilesBtn.setAttribute("aria-expanded", "false");
  }
  // a lista kirajzolása: a lenyíló menübe és a Fájl fül Tulajdonságok-paneljére is
  function renderRecentList(m, withFooter) {
    m.innerHTML = "";
    if (!recentFiles.length) {
      const e = document.createElement("div");
      e.className = "menu-empty";
      e.textContent = "Még nincs legutóbbi fájl. A megnyitott és mentett .lapterv fájlok itt jelennek meg.";
      m.appendChild(e);
      return;
    }
    recentFiles.forEach((r) => {
      const row = document.createElement("div");
      row.className = "menu-item";
      const main = document.createElement("button");
      main.className = "mi-main"; main.setAttribute("role", "menuitem");
      main.title = "Megnyitás: " + r.name;
      const nm = document.createElement("span"); nm.className = "mi-name"; nm.textContent = r.name;
      const sub = document.createElement("span"); sub.className = "mi-sub";
      sub.textContent = (r.projectName ? r.projectName + " · " : "") + fmtRecentTime(r.time);
      main.append(nm, sub);
      main.addEventListener("click", async () => {
        closeRecentMenu();
        if (await openHandle(r.handle)) {
          await addRecent(r.handle, project); // a lista elejére
        }
      });
      const del = document.createElement("button");
      del.className = "mi-del"; del.innerHTML = iconSvg("dismiss"); del.title = "Eltávolítás a listából (a fájl megmarad)";
      del.setAttribute("aria-label", del.title);
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        await removeRecent(r.handle);
      });
      row.append(main, del);
      m.appendChild(row);
    });
    if (!withFooter) return;
    const foot = document.createElement("div");
    foot.className = "menu-foot";
    const clr = document.createElement("button");
    clr.textContent = "Lista törlése";
    clr.addEventListener("click", () => { recentFiles = []; persistRecent(); });
    foot.appendChild(clr);
    m.appendChild(foot);
  }
  function renderRecentMenu() { renderRecentList(el.recentFilesMenu, true); }

  function toggleRecentMenu() {
    if (!el.recentFilesMenu.hidden) { closeRecentMenu(); return; }
    renderRecentMenu();
    const r = el.recentFilesBtn.getBoundingClientRect();
    const m = el.recentFilesMenu;
    m.hidden = false;
    m.style.top = Math.round(r.bottom + 4) + "px";
    m.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8))) + "px";
    el.recentFilesBtn.setAttribute("aria-expanded", "true");
  }
  function initRecentMenu() {
    if (!fsaSupported) { el.recentFilesBtn.hidden = true; return; }
    el.recentFilesBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleRecentMenu(); });
    document.addEventListener("pointerdown", (e) => {
      if (!el.recentFilesMenu.hidden && !el.recentFilesMenu.contains(e.target) && !el.recentFilesBtn.contains(e.target)) closeRecentMenu();
    });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.recentFilesMenu.hidden) closeRecentMenu(); });
    window.addEventListener("resize", closeRecentMenu);
  }

  // ---- Indítás ----------------------------------------------------------------------------
  async function initProjectFiles() {
    try {
      fileMeta = (await idbGet(FILES_KEY)) || {};
      if (fsaSupported) fileHandles = (await idbGet(HANDLES_KEY)) || {};
      if (fsaSupported) recentFiles = ((await idbGet(RECENT_KEY)) || []).filter((r) => r && r.handle);
    } catch (_) {}
    initRecentMenu();
    try { await idbSet("linkedHandle", null); } catch (_) {} // a régi „csatolt tár” megszűnt

    el.openFileBtn.addEventListener("click", openProjectFile);
    el.saveFileBtn.addEventListener("click", () => saveProjectFile(false));
    el.saveFileAsBtn.addEventListener("click", () => saveProjectFile(true));
    el.openFileInput.addEventListener("change", async () => {
      const files = [...(el.openFileInput.files || [])];
      el.openFileInput.value = "";
      for (const f of files) await openFileObject(f, null);
    });
    // Ctrl+S / Ctrl+Shift+S / Ctrl+O — beviteli mezőben is (előbb lezárjuk a mezőt,
    // hogy a beírt érték bekerüljön a mentésbe)
    window.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== "s" && k !== "o") return;
      e.preventDefault();
      const a = document.activeElement;
      if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) a.blur();
      if (k === "o") openProjectFile();
      else saveProjectFile(e.shiftKey);
    });
    // bezáráskor figyelmeztetés, ha van mentetlen változás (a böngészős tárban
    // ettől még megmarad, de a fájl nem frissült)
    window.addEventListener("beforeunload", (e) => {
      if (!skipUnloadWarning && store && store.projects.some(isDirty)) { e.preventDefault(); e.returnValue = ""; }
    });
    // dupla kattintás egy .lapterv fájlra (telepített app, fájltársítás a manifestben)
    if ("launchQueue" in window) {
      window.launchQueue.setConsumer(async (params) => {
        for (const h of (params && params.files) || []) await openHandle(h);
      });
    }
    updateFileStatus();
  }
