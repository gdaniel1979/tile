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

  // ---- „Új verzió érhető el” ------------------------------------------------------
  // Induláskor feljegyezzük az app fájljainak (index.html, CSS, JS) verzió-jelét
  // (ETag / Last-Modified — a GitHub Pages minden kiadásnál frissíti), majd
  // 15 percenként és az ablakba visszatérve összevetjük a szerverével. HEAD kérés:
  // a service worker nem nyúl hozzá, és alig van adatforgalom.
  (function () {
    const CHECK_EVERY_MS = 15 * 60 * 1000;
    const FOCUS_MIN_GAP_MS = 60 * 1000;
    let baseline = null, lastCheck = 0, checking = false, dismissed = false;

    function assetUrls() {
      const urls = ["index.html"];
      document.querySelectorAll('script[src], link[rel="stylesheet"][href]').forEach((n) => {
        const u = n.getAttribute("src") || n.getAttribute("href");
        if (u && !/^[a-z]+:|^\/\//i.test(u)) urls.push(u);
      });
      return urls;
    }
    const tagOf = (h) => h && (h.get("etag") || h.get("last-modified") || h.get("content-length")) || "";
    async function serverTags(urls) {
      const out = {};
      await Promise.all(urls.map(async (u) => {
        const r = await fetch(u, { method: "HEAD", cache: "no-store" });
        if (r.ok) out[u] = tagOf(r.headers);
      }));
      return out;
    }
    // a betöltött változat jele: online a szerverről; offline indításkor a service
    // worker gyorsítótárából (abból töltődött be az app)
    async function loadedTags(urls) {
      if (navigator.onLine) { try { return await serverTags(urls); } catch (_) {} }
      if (!window.caches) return null;
      const out = {};
      for (const u of urls) {
        const r = await caches.match(u, { ignoreSearch: true });
        if (r) out[u] = tagOf(r.headers);
      }
      return Object.keys(out).length ? out : null;
    }
    async function check() {
      if (checking || dismissed || (baseline && !navigator.onLine)) return;
      checking = true; lastCheck = Date.now();
      try {
        const urls = assetUrls();
        if (!baseline) { baseline = await loadedTags(urls); return; } // az első hívás csak feljegyez
        const now = await serverTags(urls);
        const changed = Object.keys(now).some((u) => baseline[u] !== undefined && now[u] && now[u] !== baseline[u]);
        if (changed) showUpdateBar();
      } catch (_) { /* hálózati hiba: majd legközelebb */ }
      finally { checking = false; }
    }
    function showUpdateBar() { if (el.updateBar) el.updateBar.hidden = false; }
    async function reloadNow() {
      el.updateReloadBtn.disabled = true;
      // a munka a böngészős tárba (a projektfájlok „*” jelzése is megmarad)
      try { if (!idbReadFailed) await idbSet(STORE_KEY, JSON.stringify(serializeStore())); } catch (_) {}
      skipUnloadWarning = true;
      location.reload();
    }

    window.addEventListener("load", () => {
      if (!el.updateBar) return;
      el.updateReloadBtn.addEventListener("click", reloadNow);
      el.updateLaterBtn.addEventListener("click", () => { el.updateBar.hidden = true; dismissed = true; });
      check();
      setInterval(check, CHECK_EVERY_MS);
      const again = () => { if (document.visibilityState === "visible" && Date.now() - lastCheck > FOCUS_MIN_GAP_MS) check(); };
      document.addEventListener("visibilitychange", again);
      window.addEventListener("focus", again);
      window.addEventListener("online", () => check());
    });
  })();
