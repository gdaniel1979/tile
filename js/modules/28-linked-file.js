"use strict";
  let linkedHandle = null;
  const fsaSupported = typeof window !== "undefined"
    && typeof window.showOpenFilePicker === "function"
    && window.isSecureContext;

  function updateLinkedUI() {
    if (!el.saveLinkedBtn) return;
    if (linkedHandle) {
      el.saveLinkedBtn.disabled = false;
      el.saveLinkedBtn.title = "Mentés a csatolt fájlba: " + (linkedHandle.name || "?") + " (Ctrl+S)";
      if (el.linkedFileName) el.linkedFileName.textContent = linkedHandle.name || "(ismeretlen)";
      if (el.unlinkJsonBtn) el.unlinkJsonBtn.hidden = false;
    } else {
      el.saveLinkedBtn.disabled = true;
      el.saveLinkedBtn.title = "Mentés a csatolt JSON-fájlba (előbb csatolj egyet az Export fülön)";
      if (el.linkedFileName) el.linkedFileName.textContent = "—";
      if (el.unlinkJsonBtn) el.unlinkJsonBtn.hidden = true;
    }
  }

  async function ensureRWPermission(handle) {
    if (!handle || !handle.queryPermission) return false;
    const opts = { mode: "readwrite" };
    const cur = await handle.queryPermission(opts);
    if (cur === "granted") return true;
    const req = await handle.requestPermission(opts);
    return req === "granted";
  }

  async function linkJsonFile() {
    if (!fsaSupported) {
      alert("Ez a böngésző nem támogatja a File System Access API-t. Használj Chrome-ot vagy Edge-et.");
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "Projekt-tár (JSON)", accept: { "application/json": [".json"] } }],
        multiple: false,
      });
      // először töltsük be a fájl tartalmát az appba (mintha a "Betöltés" gombbal csinálnánk)
      const file = await handle.getFile();
      const text = await file.text();
      try {
        const d = JSON.parse(text);
        if (d && Array.isArray(d.projects)) {
          if (!confirm("Csatoláskor a fájl tartalmával felülírjuk a jelenlegi tárat. Folytatod?")) return;
          store = normalizeStore(d);
          project = activeProject();
          loadActiveSurface();
          refreshAll();
        } else if (d && Array.isArray(d.surfaces)) {
          const p = normalizeProject(d);
          p.id = newProjectId();
          store.projects.push(p);
          store.activeProjectId = p.id;
          project = p;
          loadActiveSurface();
          refreshAll();
        } else {
          alert("Ismeretlen fájlformátum.");
          return;
        }
      } catch (e) {
        alert("Hibás vagy sérült fájl: " + e.message);
        return;
      }
      // csak sikeres betöltés után kapcsoljuk a handle-t
      linkedHandle = handle;
      await idbSet("linkedHandle", handle);
      updateLinkedUI();
    } catch (e) {
      if (e && e.name === "AbortError") return; // user mégse
      alert("Csatolás nem sikerült: " + (e && e.message || e));
    }
  }

  async function saveToLinkedFile() {
    if (!linkedHandle) {
      alert('Nincs csatolt fájl. Az Export fülön a „Tár megnyitása írhatóan…” gombbal csatolhatsz egyet.');
      return;
    }
    const ok = await ensureRWPermission(linkedHandle);
    if (!ok) { alert("A fájl írásához engedély kell."); return; }
    try {
      const snap = JSON.stringify(serializeStore(), null, 2);
      const w = await linkedHandle.createWritable();
      await w.write(snap);
      await w.close();
      // vizuális visszajelzés a gombon
      if (el.saveLinkedBtn) {
        el.saveLinkedBtn.textContent = "✓";
        setTimeout(() => { if (el.saveLinkedBtn) el.saveLinkedBtn.textContent = "💾"; }, 800);
      }
    } catch (e) {
      alert("Mentés nem sikerült: " + (e && e.message || e));
    }
  }

  async function unlinkJsonFile() {
    linkedHandle = null;
    try { await idbSet("linkedHandle", null); } catch (_) {}
    updateLinkedUI();
  }

  // Reload után: visszatöltjük a handle-t IDB-ből.
  async function restoreLinkedHandle() {
    if (!fsaSupported) return;
    try {
      const h = await idbGet("linkedHandle");
      if (h && typeof h.queryPermission === "function") {
        linkedHandle = h;
        updateLinkedUI();
      }
    } catch (_) {}
  }

