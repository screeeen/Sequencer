# Spec — Flujo Instagram, Fase 1 (rama `isntaconnect`)

Objetivo: que el ciclo **conseguir vídeo → strobo → publicar en Instagram**
sea cómodo en móvil, manteniendo la app 100% cliente (sin backend, sin tocar
los ToS de Meta desde la app).

La adquisición del vídeo queda **fuera de la app** (AirDrop de un amigo,
yt-dlp, atajo de iOS, grabación de pantalla); esta fase elimina la fricción de
todo lo demás.

## Alcance

| # | Feature | Resultado para el usuario |
|---|---------|---------------------------|
| 1 | PWA instalable | Icono "Strobo" en el móvil, abre a pantalla completa |
| 2 | `share_target` (Android) | "Compartir → Strobo" desde galería/apps de descarga |
| 3 | Trim + crop del vídeo | Aislar la jugada y quitar la UI de las grabaciones de pantalla |
| 4 | Presets de export IG | PNG a 4:5, 9:16, 1:1 u original, listo para publicar |
| 5 | Crédito | Estampar @autor en una esquina antes de compartir |

**No-goals** (documentados, no incluidos): campo "pegar enlace" con backend
extractor (módulo futuro, desacoplado); API oficial de Instagram (solo sirve
para contenido propio); export a vídeo.

## 1. PWA instalable

- `manifest.webmanifest`: `name: "Strobo"`, `display: standalone`,
  `orientation: portrait`, `background_color/theme_color` acordes al diseño,
  iconos 192/512 + `apple-touch-icon` 180 (generar desde el título girado).
- `sw.js` (service worker): app-shell **cache-first con clave de versión**
  (importa `VERSION` o se genera con el hash del build): HTML, CSS, JS e
  iconos. El vídeo de ejemplo (`video_adxnap.mov`, 1,6 MB) se cachea bajo
  demanda, no en la instalación. Al activar una versión nueva se purgan las
  caches viejas.
- `index.html`: `<link rel="manifest">`, meta `apple-mobile-web-app-*`.
- **Riesgo conocido**: en iOS la PWA instalada pierde el contexto al ir a
  segundo plano con más facilidad; no afecta al flujo (la caché de frames es
  por sesión de todos modos).

Criterio de aceptación: Lighthouse marca la app como instalable; instalada en
iOS y Android abre sin barra de navegador y funciona offline (con el vídeo de
ejemplo ya visitado).

## 2. Web Share Target (solo Android/Chromium)

- En el manifest:

```json
"share_target": {
  "action": "/share",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": { "files": [{ "name": "video", "accept": ["video/*"] }] }
}
```

- El SW intercepta el `POST /share`, guarda el `File` (Cache API o IndexedDB),
  responde con redirect a `/?shared=1`; al arrancar, `main.js` detecta el flag,
  recupera el archivo y lo carga por el mismo camino que `fileInput`
  (`videoSource.loadFile`).
- En iOS no existe soporte: no se anuncia ni rompe nada; el picker de Fotos
  sigue siendo la vía.

Criterio de aceptación: en Android, "Compartir" un vídeo desde Fotos/galería
muestra Strobo y el vídeo queda cargado y listo para Play.

## 3. Trim + crop

El caso que resuelve: grabaciones de pantalla (UI de Instagram arriba/abajo,
la jugada empieza tarde) y clips deportivos largos. Además mejora la calidad
del strobo: `MAX_FRAMES = 60` se reparte solo sobre el segmento útil.

### Trim (temporal)

- UI: dos sliders (in/out) bajo el vídeo, con el tiempo en s; el vídeo salta
  a `in` al soltar (preview). Por defecto in=0, out=duración.
- Pipeline: `onPlay` hace `video.currentTime = in` antes de capturar;
  `maybeCapture` ignora frames fuera de `[in, out]` y al superar `out` se
  pausa el vídeo y se dispara la composición (mismo camino que `ended`).
- `captureInterval = (out - in) / MAX_FRAMES`.
- El progreso de captura pasa a ser `(t - in) / (out - in)`.

### Crop (espacial)

- UI: rectángulo arrastrable con 4 asas sobre el `<video>` (overlay
  absolutamente posicionado), con botón "reset". Sin rotación ni aspecto
  bloqueado en v1.
- Pipeline: `grab()` usa el rect como *source rect* de `drawImage`; la
  resolución de trabajo del strobo pasa a ser la del recorte (re-aplicando la
  cota `MAX_DIM`). Cambiar trim/crop **invalida la caché de frames** (hay que
  recapturar: aviso "replay to apply" en Status).

Criterio de aceptación: con una grabación de pantalla de un reel, se puede
recortar la UI y quedarse con 3 s de jugada, y el strobo sale limpio y con
más densidad de frames que sin trim.

## 4. Presets de export para Instagram

- Selector en la sección Result: `original · 1:1 (1080) · 4:5 (1080×1350) ·
  9:16 (1080×1920)`, por defecto `original`.
- Modos de encuadre por preset:
  - **fit**: el strobo entero dentro del lienzo, bandas rellenas con un
    desenfoque ampliado del propio strobo (estándar en apps de edición).
  - **fill**: recorte centrado que llena el lienzo, con arrastre para
    reencuadrar (un offset x/y basta en v1).
- Implementación: módulo nuevo `src/exporter.js` — canvas offscreen del
  tamaño del preset, compone (blur de fondo si fit + strobo + crédito) y
  genera el PNG. `ui.js` lo llama desde "save picture"; el canvas de Result
  no cambia (sigue mostrando la resolución de trabajo).
- La vista previa del preset se muestra como marco/overlay proporcional sobre
  el canvas de Result (barato y suficiente en v1).

Criterio de aceptación: exportar en 4:5 produce un PNG 1080×1350 que Instagram
acepta sin recortar; en fill se puede reencuadrar al sujeto.

## 5. Crédito

- Toggle "add credit" + campo de texto (`@usuario`) junto a los controles de
  export. Persistido en `localStorage` (se repite el mismo autor a menudo).
- El exporter estampa el texto en la esquina inferior derecha: system-ui,
  tamaño ~2.2% de la altura del lienzo, blanco con sombra suave (legible sobre
  cualquier fondo), margen 3%.

## Plan de entrega (commits/versiones)

1. `v0.9.0` — PWA: manifest + SW + iconos (features 1).
2. `v0.9.1` — share_target Android (feature 2; PATCH porque solo añade una vía
   de entrada).
3. `v0.10.0` — trim + crop con invalidación de caché (feature 3, la mayor).
4. `v0.11.0` — exporter con presets + crédito (features 4 y 5).

Cada paso se valida en navegador (`yarn dev`) y en un iPhone/Android reales
antes de push; el SW se prueba también con `yarn build && vite preview`
(la caché no se sirve igual en dev).

## Riesgos y decisiones abiertas

- **SW vs vite**: en dev el SW se desactiva (`import.meta.env.DEV`); en
  producción Vercel sirve el build y GitHub Pages el estático — el SW debe
  registrarse con ruta relativa para funcionar en ambos.
- **Crop UI en móvil**: gestos de arrastre sobre el vídeo compiten con el
  scroll; las asas deben ser grandes (44px) y el arrastre solo activo dentro
  del rect.
- **Memoria**: trim denso sube la densidad de frames en el segmento; mantener
  `MAX_FRAMES = 60` como cota dura.
- Abierta: ¿el preset debería aplicarse también al canvas de Result en vivo
  (ver el encuadre final mientras ajustas)? Se decide al implementar la
  feature 4 según coste.
