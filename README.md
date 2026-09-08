# Colonist Card Tracker

Extensión de Chrome (Manifest V3) para [colonist.io](https://colonist.io) con dos funciones:

1. **Contador de cartas** en vivo: recursos por jugador con probabilidades para los robos ocultos,
   banco, cartas de desarrollo y estadísticas de dados.
2. **Grabación para investigación** (requiere aceptación explícita; sin ella el contador no se
   activa): guarda la historia completa de cada partida (jugadas, intercambios, dados, estado y chat)
   anonimizada en el navegador y la envía a tu servidor al terminar.

A diferencia de los trackers anteriores, **no lee el DOM**. Intercepta el WebSocket del juego,
decodifica los mensajes (MessagePack) y procesa el log estructurado que el servidor envía al
cliente. Funciona en cualquier idioma de la interfaz y sobrevive a una recarga a mitad de partida.

## Idiomas

La interfaz de la extensión (panel, consentimiento, página de opciones, nombre y descripción)
está en 15 idiomas más una variante: inglés (por defecto), chino simplificado, alemán, japonés,
español, francés, portugués de Brasil y de Portugal, rumano, ruso, turco, polaco, neerlandés,
malayo, coreano e italiano. Chrome elige el idioma según el de su propia interfaz y cae a inglés
clave por clave si falta algo.

- Fuente de verdad: `i18n/<locale>.json` (mapa plano clave → texto) y `i18n/_meta.json` (notas
  para traductores y límites de longitud). `_locales/` se **genera** con `npm run i18n`; no se
  edita a mano.
- El código pide los textos con `chrome.i18n.getMessage`; los números y porcentajes se formatean
  con `Intl.NumberFormat` en el idioma del navegador, y el panel respeta `@@bidi_dir` (RTL listo
  para cuando se añada hebreo o árabe).
- Nombres de recursos alineados con los que colonist.io muestra en cada idioma.
- `test/i18n.test.js` comprueba que todos los idiomas tienen las mismas claves, que ningún texto
  supera su límite (la descripción del manifiesto no puede pasar de 132 caracteres), que los textos
  legales no se han acortado y que `_locales` está al día.
- `node tools/shot-i18n.mjs [locale…]` abre Chromium con `--lang` y captura consentimiento, panel
  y opciones en cada idioma (`tools/out/i18n/`).
- Para añadir un idioma: copiar `i18n/en.json` con el código de Chrome (p. ej. `sv`, `he`,
  `zh_TW`), traducir, registrarlo en `_meta.json`, `npm run i18n`, `npm test`.

## Instalación (desarrollo)

1. `chrome://extensions` → **Modo de desarrollador** → **Cargar descomprimida** → esta carpeta.
2. Entra a una partida. Si ya estabas dentro, recarga (F5).
3. El panel aparece arriba a la derecha: arrastrable, minimizable (`–`), ocultable (`×` o `Alt+Shift+C`).
   `%` alterna rango / valor esperado, `⤓` exporta un diagnóstico JSON, `⚙` abre Opciones.

## El contador

| Columna | Significado |
| --- | --- |
| 🪵 🧱 🐑 🌾 🪨 | Cartas de cada recurso. `2 +1 65%` = 2 seguras y 65 % de probabilidad de una más. |
| ❓ | Solo si el servidor reporta cartas que la extensión no pudo ver (tras una desincronización). |
| Σ | Total según el servidor. `✓` coincide con el modelo, `!` hubo que corregir. |
| 🃏 | Cartas de desarrollo en mano y jugadas (`K` caballero, `M` monopolio, `RB` carreteras, `YP` abundancia). Tooltip: PV esperados. |
| Banco / Dados | Datos del servidor / histograma de tiradas. |

Los robos entre rivales se modelan como **mundos posibles** con probabilidad exacta; construcciones,
descartes, intercambios, monopolios y ofertas eliminan los mundos imposibles, y el total de cartas
que envía el servidor verifica el modelo en cada actualización.

## La grabación

```
colonist.io ──WebSocket──► src/inject.js (MAIN)        bytes crudos, ambas direcciones
                              │ postMessage
                              ▼
                         src/content.js (aislado)     tracker + panel + consentimiento
                              │ chrome.runtime
                              ▼
                         src/background.js (SW)      IndexedDB → anonimiza → CCTR → gzip → POST /ingest
                              │
                              ▼
                         backend/server.js (Railway)  volumen + índice SQLite
```

- Se graba **todo** lo que pasa por el socket de la partida: tramas entrantes y salientes, texto y
  binario. El tracker es solo un derivado; la fuente de verdad son las tramas.
- Formato **CCTR** (`src/recorder/format.js`, lector en `tools/cctr_reader.py`): cabecera JSON con
  metadatos + registros `[Δt varint][flags][len][bytes]`, todo gzip. Una partida de 4 jugadores
  ronda los 30-100 KB.
- **Anonimización en el navegador**: nombres de usuario e identificadores → `p_<hash>` con una clave
  aleatoria por instalación; avatares, tokens y similares → `null`; menciones en el chat → mismo
  código. Las tramas se re-codifican en msgpack tras el filtrado. Ver `PRIVACY.md`.
- **Se conserva la estructura**: cada mensaje de chat lleva el color (asiento) del remitente, y los
  metadatos incluyen la clasificación final (`standings`: puesto, color y puntos de victoria) y el
  color del ganador. Así se sabe qué dijo e hizo el 1.º, 2.º, 3.º y 4.º sin saber quiénes son.
- Persistencia y reintentos: las tramas se guardan en IndexedDB durante la partida; al terminar
  (o al cerrar el socket / recargar) se finaliza y se sube. Sin servidor configurado, la partida queda
  en local y se puede exportar desde Opciones. Alarma cada 15 min para reintentos.
- Consentimiento: tarjeta en el panel la primera vez y radio en Opciones. Sin aceptar no se graba nada
  y el contador permanece desactivado (el texto público habla de investigación sobre toma de decisiones
  y negociación).

### Backend

Ver `backend/README.md` (despliegue en Railway en cinco comandos). Antes de publicar, pon la URL en
`DEFAULT_ENDPOINT` de `src/background.js`, el enlace de la política en `PRIVACY_URL` de
`src/options.js` y el contacto en `PRIVACY.md`.

### Dataset

```
node tools/sync.mjs <endpoint> <ADMIN_TOKEN> ./dataset       # descarga incremental
python tools/cctr_reader.py archivo.cctr.gz --summary        # metadatos y recuento de eventos
python tools/cctr_reader.py archivo.cctr.gz --events         # log, chat, intercambios y acciones propias (JSONL)
python tools/cctr_reader.py archivo.cctr.gz --jsonl          # todas las tramas decodificadas
```

## Desarrollo

```
npm test                 # 35 tests: msgpack, motor de mundos, tracker, formato y anonimizador
node tools/simulate.mjs  # prueba de extremo a extremo: backend local + Chromium + partida sintética
npm run live             # abre Chromium con la extensión contra colonist.io y registra lo capturado
npm run zip              # dist/colonist-card-tracker-<versión>.zip
```

Sin paso de build: `src/` se carga tal cual. Chrome de marca (137+) ignora `--load-extension`, por
eso las herramientas usan el Chromium de Playwright.

## Modos de juego

Base y Seafarers. Cities & Knights: se cuentan mercancías, caballeros y mejoras de ciudad; las
cartas de progreso no se modelan. La grabación es independiente del modo.

## Aviso

Herramienta no oficial, sin relación con Colonist. Solo lee el tráfico que el servidor ya envía a
tu navegador; no envía nada a Colonist ni modifica la partida.
