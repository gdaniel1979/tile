"use strict";
  // ---- Tár (több projekt) ----------------------------------------------
  let store = null;
  const STORE_KEY = "tile-planner-store";

  // ---- IndexedDB tároló (a localStorage 5-10 MB-os limitje helyett) ----
  // Egyetlen "kv" object store, key-value (key="tile-planner-store",
  // value = JSON-stringre szerializált store snapshot).
  const IDB_NAME = "tile-planner-db";
  const IDB_STORE = "kv";
  let idbConnPromise = null;
  function idbOpen() {
    if (idbConnPromise) return idbConnPromise;
    idbConnPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("Az IndexedDB nem elérhető")); return; }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return idbConnPromise;
  }
  function idbGet(key) {
    return idbOpen().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }
  function idbSet(key, value) {
    return idbOpen().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  function activeProject() {
    return store.projects.find((p) => p.id === store.activeProjectId) || store.projects[0];
  }

  function serializeProject() { saveActiveSurface(); return project; }
  function serializeStore() { saveActiveSurface(); return store; }

