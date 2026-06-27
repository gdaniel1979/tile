"use strict";
  function initMaterialUI() {
    if (!el.groutPreset) return;
    const m = () => (project.material = project.material || defaultMaterial());
    el.groutPreset.addEventListener("change", () => {
      m().groutPreset = el.groutPreset.value in GROUT_DENSITIES ? el.groutPreset.value : "cg1";
      // a friss aktív felület mutatóit is újra kell festeni; render() újrarajzolja a layoutot
      render(); save();
    });
    const numHandler = (input, key, min) => () => {
      const v = parseFloat(input.value);
      if (v >= (min || 0)) { m()[key] = v; updateProjectMaterialReport(); save(); }
    };
    el.silWidth.addEventListener("change", numHandler(el.silWidth, "silWidthMm", 0.1));
    el.silDepth.addEventListener("change", numHandler(el.silDepth, "silDepthMm", 0.1));
    el.silTube.addEventListener("change", numHandler(el.silTube, "silTubeMl", 50));
    el.silWaste.addEventListener("change", numHandler(el.silWaste, "silWastePct", 0));
    if (el.gluePreset) {
      el.gluePreset.addEventListener("change", () => {
        m().gluePreset = el.gluePreset.value in GLUE_KG_PER_M2 ? el.gluePreset.value : "c2s1";
        updateProjectMaterialReport(); save();
      });
    }
    if (el.glueWaste) el.glueWaste.addEventListener("change", numHandler(el.glueWaste, "glueWastePct", 0));
    if (el.groutPricePack) el.groutPricePack.addEventListener("change", numHandler(el.groutPricePack, "groutPricePack", 0));
    if (el.gluePricePack) el.gluePricePack.addEventListener("change", numHandler(el.gluePricePack, "gluePricePack", 0));
    if (el.silPriceTube) el.silPriceTube.addEventListener("change", numHandler(el.silPriceTube, "silPriceTube", 0));
    if (el.edgingPricePerM) el.edgingPricePerM.addEventListener("change", numHandler(el.edgingPricePerM, "edgingPricePerM", 0));
  }

  function syncMaterialUI() {
    if (!el.groutPreset || !project) return;
    const m = project.material || defaultMaterial();
    el.groutPreset.value = m.groutPreset || "cg1";
    el.silWidth.value = m.silWidthMm;
    el.silDepth.value = m.silDepthMm;
    el.silTube.value = m.silTubeMl;
    el.silWaste.value = m.silWastePct;
    if (el.gluePreset) el.gluePreset.value = m.gluePreset || "c2s1";
    if (el.glueWaste) el.glueWaste.value = m.glueWastePct;
    if (el.groutPricePack) el.groutPricePack.value = m.groutPricePack || 0;
    if (el.gluePricePack) el.gluePricePack.value = m.gluePricePack || 0;
    if (el.silPriceTube) el.silPriceTube.value = m.silPriceTube || 0;
    if (el.edgingPricePerM) el.edgingPricePerM.value = m.edgingPricePerM || 0;
  }

  // ---- Csatolt JSON-fájl (File System Access API) ---------------------
  // A felhasználó kiválaszt egy JSON-fájlt (pl. OneDrive-ban), a böngésző
  // megőriz egy "handle"-t, és a Mentés gomb közvetlenül felülírja a fájlt.
  // A handle az IDB-ben perzisztálódik, így reload után is megmarad
  // (engedélyt egyszer újra kérünk).
