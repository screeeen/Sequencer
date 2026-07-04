// Lado app del Web Share Target: recupera el vídeo que el service worker
// guardó en IndexedDB al recibir un "Compartir → Strobo" (Android).
//
// El SW escribe con la misma base de datos/clave pero con su propia copia
// del código (sw.js es un script clásico y no puede importar este módulo;
// duplicar ~15 líneas es más barato que un SW de tipo module, que rompería
// el registro en iOS < 16.4).

const DB = "strobo-share";
const STORE = "shared";
const KEY = "video";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Devuelve el File compartido (o null) y lo borra — consumo de un solo uso. */
export async function takeShared() {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const get = store.get(KEY);
    get.onsuccess = () => {
      store.delete(KEY);
      resolve(get.result || null);
    };
    get.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
  });
}
