# Spec — Flujo Instagram, Fase 1 (rama `isntaconnect`) · v2 (decidido)

> **Estado (2026-07-04): IMPLEMENTADO** en v0.9.0 → v0.11.1, desplegado en
> GitHub Pages (rama `isntaconnect`). Pendiente: validación en dispositivos
> reales (matriz de abajo) — sobre todo gestos de crop/trim en táctil y la
> hoja de compartir con el PNG. Desviaciones del spec: se quitaron los
> controles nativos del `<video>` (chocaban con el overlay de crop; el trim
> cubre el seek) y la guía de estado vacío se oculta al cargar archivo o dar
> a Play (no en `loadedmetadata`, que dispara el vídeo de ejemplo). La Fase 2
> ("pegar enlace" con backend extractor) sigue siendo no-goal documentado.

Objetivo: que el ciclo **conseguir vídeo → strobo → publicar en Instagram**
sea cómodo en móvil, manteniendo la app 100% cliente (sin backend, sin tocar
los ToS de Meta desde la app). La adquisición del vídeo queda fuera de la app
(AirDrop, yt-dlp, atajo de iOS, grabación de pantalla); esta fase elimina la
fricción de todo lo demás.

Este spec es **ejecutable de principio a fin**: todas las decisiones que la
v1 dejaba abiertas están cerradas y marcadas como *[DECISIÓN]*.

## Alcance

| # | Feature | Resultado para el usuario |
|---|---------|---------------------------|
| 1 | PWA instalable | Icono "Strobo" en el móvil, abre a pantalla completa |
| 2 | `share_target` (Android) | "Compartir → Strobo" desde galería/apps de descarga |
| 3 | Trim + crop del vídeo | Aislar la jugada y quitar la UI de las grabaciones de pantalla |
| 4 | Presets de export IG | PNG a 4:5, 9:16, 1:1 u original, con encuadre en vivo |
| 5 | Crédito | Estampar @autor en una esquina antes de compartir |
| 6 | Robustez móvil | Wake lock en captura, avisos de códec, guía de vacío |

**No-goals**: pegar-enlace con backend extractor (módulo futuro desacoplado);
API oficial de Instagram; rotación en el crop. ~~Export a vídeo~~ — levantado
en v0.12.0: `src/recorder.js` graba el canvas de Result durante la composición
(MediaRecorder + captureStream, MP4 si el navegador puede, WebM si no) y
"save video" comparte/descarga el clip de las siluetas pintándose una a una.

## Principios (usabilidad y calidad de imagen)

- **Un gesto, una cosa**: nada de modos ocultos; trim, crop y encuadre se
  manipulan directamente sobre el vídeo/resultado.
- **Nunca perder trabajo silenciosamente**: cualquier acción que invalide la
  caché de frames (trim/crop) lo avisa en Status antes de exigir replay.
- **La calidad manda en el export**: el PNG final se compone a la resolución
  del preset (1080+), con reescalado de alta calidad, nunca desde el canvas de
  pantalla.
- **Presupuesto de memoria fijo**: 60 frames × RGBA a resolución de trabajo
  ≤ 1280 px de lado mayor (~220 MB peor caso). Ninguna feature lo supera.

## 1. PWA instalable — v0.9.0

- `manifest.webmanifest`: `name/short_name: "Strobo"`, `display: standalone`,
  `orientation: portrait`, `start_url: "./"`, `background_color: "#ffffff"`,
  `theme_color: "#ffffff"`.
- **[DECISIÓN] Iconos**: SVG fuente `icons/icon.svg` — una "S" blanca en peso
  300 sobre `#111`, con la rotación característica del título (−6°) — y los
  PNG 192/512/180 exportados **una sola vez y commiteados**. Sin paso de
  build de iconos ni dependencias nuevas.
- `sw.js` en la **raíz** (scope completo), registrado desde `main.js` solo en
  producción (`if (!import.meta.env.DEV)`). Estrategia: precache del app-shell
  (HTML, CSS, JS, iconos) con clave `strobo-v${VERSION}`; **network-first para
  el HTML** (para no servir shells viejos), cache-first para el resto;
  `activate` purga claves de otras versiones. El vídeo de ejemplo se cachea en
  runtime (stale-while-revalidate), no en la instalación.
- **[DECISIÓN] SW y despliegue**: el despliegue es **GitHub Pages sirviendo
  la rama en crudo** (Vercel desconectado), así que `sw.js` y
  `manifest.webmanifest` viven en la **raíz del repo** con rutas relativas
  (Pages sirve bajo `/Sequencer/`). Vite queda solo como servidor de dev. La
  lista de precache se escribe a mano. Para no duplicar la versión dentro del
  SW, el registro la pasa por query —
  `navigator.serviceWorker.register(`sw.js?v=${VERSION}`)` — y el SW usa
  `location.search` como clave de cache; cada release invalida el anterior.
  En dev (vite) no se registra (`import.meta.env.DEV`).

Aceptación: Lighthouse "installable" en verde; instalada en iOS y Android abre
standalone; offline sirve la app (y el vídeo de ejemplo si ya se visitó);
publicar una versión nueva actualiza el shell en la segunda carga como tarde.

## 2. Web Share Target (Android/Chromium) — v0.9.1

- En el manifest:

```json
"share_target": {
  "action": "./share",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": { "files": [{ "name": "video", "accept": ["video/*"] }] }
}
```

- El SW intercepta `POST ./share`: `event.respondWith(Response.redirect("./?shared=1"))`
  y en paralelo `formData()` → guarda el `File` en **IndexedDB**
  (**[DECISIÓN]**: IndexedDB y no Cache API — un `File` con su nombre/tipo se
  guarda tal cual como valor; helper propio de ~30 líneas `src/sharedb.js`,
  sin dependencias: `putShared(file)` / `takeShared()` que borra al leer).
- `main.js`: si `location.search` incluye `shared=1`, `takeShared()` y carga
  por el mismo camino que el picker; limpia la query con `replaceState`.
- iOS no lo soporta: no se anuncia ni afecta.

Aceptación: en Android real, Compartir un vídeo desde Fotos abre Strobo con el
vídeo cargado y listo para Play; compartir dos veces seguidas funciona.

## 3. Trim + crop — v0.10.0

Resuelve grabaciones de pantalla (UI de IG arriba/abajo, la jugada empieza
tarde) y clips largos. Bonus de calidad: los 60 frames se concentran en el
segmento útil, y el crop recupera resolución de trabajo (se re-aplica
`MAX_DIM` al recorte).

### Trim

- **[DECISIÓN] UI**: un solo track con **dos pulgares** (in/out), implementado
  con dos `<input type="range">` superpuestos (técnica estándar, sin
  dependencias), etiquetas `0.0s – 3.4s` en vivo. Al soltar un pulgar, el
  vídeo hace seek a ese extremo (preview inmediato del encuadre temporal).
- Pipeline: `onPlay` asegura `currentTime = in`; `maybeCapture` descarta
  frames fuera de `[in, out]`; al superar `out`, pausa y dispara la
  composición (mismo camino que `ended`). `captureInterval = (out−in)/60`.
  Progreso de captura: `(t − in) / (out − in)`.

### Crop

- **[DECISIÓN] UI**: rectángulo con **asas solo en los 4 bordes** (no
  esquinas) + arrastre del interior para mover; zonas táctiles ≥ 44 px;
  `touch-action: none` y `setPointerCapture` en el overlay para no pelear con
  el scroll; botón "reset". Racional: el caso real dominante es recortar
  bandas de UI (bordes), y las esquinas duplican superficie de error en
  pantallas pequeñas.
- Pipeline: `grab()` usa el rect (en coords de vídeo) como *source rect* de
  `drawImage`; `strobe.resize()` recibe las dimensiones del recorte.
- **Invalidación**: cambiar trim o crop con caché viva ⇒ Status muestra
  "replay to apply trim/crop" (persistente, no barra) y se limpia la caché.
  Los sliders de threshold/interval siguen recomponiendo al instante.

Aceptación: con una grabación de pantalla de un reel se puede recortar la UI,
quedarse con 3 s de jugada y el strobo sale limpio, con más densidad de frames
y mayor resolución efectiva que sin trim/crop.

## 4. Presets de export + encuadre en vivo — v0.11.0

- Selector segmentado en Result: `original · 1:1 · 4:5 · 9:16`
  (1080², 1080×1350, 1080×1920). Persistido en `localStorage`.
- **[DECISIÓN] Encuadre en vivo: SÍ.** Con preset ≠ original, sobre el canvas
  de Result se dibuja un **marco atenuado** (máscara semitransparente fuera
  del área del preset). En modo fill, arrastrar dentro del marco desplaza el
  encuadre (offset x/y). Coste bajo: es un overlay DOM, no re-composición.
- Modos por preset: **fit** (strobo entero, bandas con desenfoque ampliado
  del propio strobo) y **fill** (llena el lienzo, arrastre para reencuadrar).
  Default: **fill** (es lo que Instagram muestra) con el sujeto principal
  centrado.
- **[DECISIÓN] Calidad del export** (módulo nuevo `src/exporter.js`):
  - Canvas offscreen al tamaño exacto del preset.
  - Reescalado en **dos pasos máximo** con `imageSmoothingQuality: "high"`
    (evita el aliasing del escalado directo cuando el factor es > 2×).
  - Fondo fit: strobo escalado a cubrir + `ctx.filter = blur(…)` proporcional
    (~2.5% del lado mayor) + velo blanco 12% para separar del contenido.
  - Formato **PNG** (Instagram recomprime; partir de PNG evita doble pérdida).
  - El canvas de Result no cambia (sigue en resolución de trabajo).
- "save picture" exporta con el preset activo; con `original` el
  comportamiento actual se mantiene intacto.

Aceptación: export 4:5 → PNG 1080×1350 exacto que Instagram publica sin
recortar; en fill el arrastre permite encuadrar al sujeto; sin banding ni
aliasing visibles comparado con el canvas.

## 5. Crédito — v0.11.0 (junto al exporter)

- Toggle "add credit" + campo `@usuario`, persistidos en `localStorage`.
- Estampado por el exporter (nunca en el canvas de trabajo): esquina inferior
  derecha, system-ui **semibold al 2.2% de la altura** del lienzo, blanco con
  sombra `rgba(0,0,0,.45)` blur 4, margen 3%.

## 6. Robustez móvil — transversal

- **Wake lock** (`navigator.wakeLock.request("screen")`) mientras se captura
  — si la pantalla se apaga a mitad de reel, la captura muere. Se libera al
  componer. Silencioso si el navegador no lo soporta.
- **Códecs**: las grabaciones de pantalla de iOS son HEVC `.mov`; Chrome
  Android a veces no las decodifica. Si `video.error` o `videoWidth === 0`
  tras `loadedmetadata` ⇒ mensaje en Status: "this video format isn't
  supported by this browser — try Safari or convert to MP4".
- **Estado vacío**: bajo el picker, tres líneas de guía (get the video → play
  → share), que desaparecen al cargar vídeo.
- **Auto-scroll** suave a la sección Status al pulsar Play en viewport móvil
  (si Status no está visible).

## Plan de entrega

| Versión | Contenido | Validación |
|---------|-----------|------------|
| v0.9.0 | PWA (manifest, SW, iconos) | Lighthouse + iPhone + Android reales |
| v0.9.1 | share_target + sharedb | Android real, compartir ×2 |
| v0.10.0 | trim + crop + invalidación + wake lock + códecs | grabación de pantalla real |
| v0.11.0 | exporter (presets, fit/fill, encuadre) + crédito | publicar de verdad en IG |

Cada versión: `yarn dev` durante el desarrollo, `yarn build && vite preview`
para validar el SW (en dev está desactivado), `node --check` en los módulos,
y prueba en dispositivo real antes de push. El commit de cada versión lleva
su bump en `src/version.js` + `package.json`.

## Matriz de dispositivos (mínimo por versión)

| | iPhone Safari | Android Chrome | Desktop Chrome/Safari |
|---|---|---|---|
| Instalación PWA | ✓ | ✓ | — |
| share_target | n/a | ✓ | — |
| Captura + strobo | ✓ | ✓ | ✓ |
| Share/save PNG | ✓ (share sheet) | ✓ | ✓ (descarga) |

## Riesgos aceptados

- iOS mata PWAs en segundo plano con facilidad: la caché de frames es por
  sesión, no hay nada que persistir; aceptado.
- El blur de fondo en fit sobre canvas grande cuesta ~100–200 ms en móvil:
  aceptable porque solo ocurre al exportar.
- `ctx.filter` no está en Safari < 16: fallback a fondo blanco (detección de
  soporte, una línea).
