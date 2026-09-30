// Service worker — offline működés (PWA).
// Stratégia: "hálózat először". Online mindig a friss fájl jön (és frissül a
// gyorsítótár is), offline a legutóbb letöltött változat. Így kiadáskor nem kell
// verziót léptetni; a CACHE nevét csak a tárolás szerkezetének változásakor kell.
const CACHE = "tile-planner-v1";

// Telepítéskor az index.html-ből kiolvassuk a helyi fájlokat (script/link/ikon),
// így egy új modul felvétele után sem kell ezt a listát kézzel karbantartani.
const BASE = ["./", "index.html", "manifest.webmanifest", "favicon.svg",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
  // csak a PDF-mentéskor töltődnek be, de offline is kellenek
  "js/vendor/jspdf.umd.min.js", "fonts/NotoSans-Regular.ttf", "fonts/NotoSans-Bold.ttf"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const urls = new Set(BASE);
    try {
      const res = await fetch("index.html", { cache: "no-store" });
      const html = await res.text();
      for (const m of html.matchAll(/\s(?:src|href)="([^"#?:]+)"/g)) urls.add(m[1]);
    } catch (e) { /* offline telepítés: marad az alaplista */ }
    await Promise.all([...urls].map((u) =>
      fetch(u, { cache: "no-store" }).then((r) => r.ok && cache.put(u, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: "no-store" });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(req, { ignoreSearch: true })
        || (req.mode === "navigate" && await cache.match("./"));
      return hit || Response.error();
    }
  })());
});
