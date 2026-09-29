"use strict";
  // ---- PWA: service worker + „Telepítés” gomb ------------------------------
  // A service worker csak biztonságos környezetben (HTTPS vagy localhost) fut;
  // máshol (pl. http://IP:8000) egyszerűen kimarad, az app ugyanúgy működik.
  (function () {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker:", e));
      });
    }

    // A böngésző csak akkor küldi a beforeinstallprompt eseményt, ha az app még
    // nincs telepítve és telepíthető (Chrome/Edge) — addig a gomb rejtve marad.
    const group = document.getElementById("pwaInstallGroup");
    const btn = document.getElementById("pwaInstallBtn");
    let deferred = null;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferred = e;
      if (group) group.hidden = false;
    });
    if (btn) btn.addEventListener("click", async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
      if (group) group.hidden = true;
    });
    window.addEventListener("appinstalled", () => {
      deferred = null;
      if (group) group.hidden = true;
    });
  })();
