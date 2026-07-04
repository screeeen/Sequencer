// Service worker de Strobo: precache del app-shell con clave de versión.
//
// La versión llega por query en el registro (sw.js?v=X.Y.Z) — así no se
// duplica aquí y cada release invalida el SW/caché anterior. Estrategia:
// network-first para navegaciones (nunca servir un shell viejo), cache-first
// con relleno en runtime para el resto (el vídeo de ejemplo entra solo).

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `strobo-${VERSION}`;

const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./reset.css",
  "./manifest.webmanifest",
  "./src/main.js",
  "./src/ui.js",
  "./src/strobe.js",
  "./src/pipeline.js",
  "./src/imageops.js",
  "./src/video.js",
  "./src/cropper.js",
  "./src/histview.js",
  "./src/sharedb.js",
  "./src/version.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
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

// --- Web Share Target (Android) ---
// Espejo mínimo de src/sharedb.js (un SW clásico no puede importar módulos).
const SHARE_DB = "strobo-share";
const SHARE_STORE = "shared";
const SHARE_KEY = "video";

function putShared(file) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SHARE_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(SHARE_STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(SHARE_STORE, "readwrite");
      tx.objectStore(SHARE_STORE).put(file, SHARE_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // "Compartir → Strobo": guarda el vídeo y entra en la app con ?shared=1.
  if (req.method === "POST" && url.pathname.endsWith("/share")) {
    event.respondWith(
      (async () => {
        const data = await req.formData();
        const file = data.get("video");
        if (file) await putShared(file);
        return Response.redirect(new URL("./?shared=1", self.location.href), 303);
      })()
    );
    return;
  }

  if (req.method !== "GET") return;

  // Navegación: network-first, con el shell cacheado como fallback offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }

  // Resto: cache-first; los aciertos de red se guardan para offline.
  // Solo respuestas 200 completas (los 206 de vídeo con Range no se cachean).
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
    )
  );
});
