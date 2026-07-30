// Service worker sederhana: bikin app tetap kebuka walau internet mati.
//
// Strateginya "network first, fallback ke cache" — bukan cache first. Alasannya
// app ini sering diperbarui; kalau cache didahulukan, user bakal nyangkut di
// versi lama sampai cache-nya dibuang manual.

const CACHE = "guru-biola-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // POST (mis. /api/guru) gak boleh di-cache
  if (req.method !== "GET") return;
  // Cuma urus permintaan ke asal yang sama
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        // navigasi ke halaman yang belum pernah dibuka: kasih beranda
        if (req.mode === "navigate") {
          const home = await caches.match("./");
          if (home) return home;
        }
        return new Response("Offline dan halaman ini belum pernah dibuka.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      })
  );
});
