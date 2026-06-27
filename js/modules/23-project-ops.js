"use strict";
  // ---- Projekt-műveletek -----------------------------------------------
  function switchProject(id) {
    if (id === store.activeProjectId) { expandedProjects.add(id); renderProjectTree(); return; }
    saveActiveSurface();
    store.activeProjectId = id;
    expandedProjects.add(id); // az új aktív projekt automatikusan kinyitva
    project = activeProject();
    loadActiveSurface();
    refreshAll();
  }

  function addProjectFn() {
    saveActiveSurface();
    const name = prompt("Új projekt neve:", "Projekt " + (store.projects.length + 1));
    if (name === null) return;
    const p = defaultProject(name.trim() || "Projekt");
    store.projects.push(p);
    store.activeProjectId = p.id;
    project = p;
    loadActiveSurface();
    refreshAll();
  }

  function renameProjectFn(id) {
    const p = store.projects.find((x) => x.id === id);
    if (!p) return;
    const name = prompt("Projekt neve:", p.name);
    if (name === null) return;
    p.name = name.trim() || p.name;
    renderProjectTree();
    if (p === project && el.projName) el.projName.value = project.name;
    updateCanvasTitle();
    save();
  }

  function deleteProjectFn(id) {
    if (store.projects.length <= 1) { alert("Legalább egy projektnek maradnia kell."); return; }
    const p = store.projects.find((x) => x.id === id);
    if (!p) return;
    if (!confirm("Töröljük a(z) „" + p.name + "” projektet (minden felületével)?")) return;
    const wasActive = id === store.activeProjectId;
    store.projects = store.projects.filter((x) => x.id !== id);
    if (wasActive) {
      store.activeProjectId = store.projects[0].id;
      project = activeProject();
      loadActiveSurface();
    }
    refreshAll();
  }

