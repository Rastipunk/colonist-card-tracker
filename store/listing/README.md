# Ficha de la Chrome Web Store por idioma

## Textos

Un archivo por idioma con los dos campos que el panel de desarrollador pide por idioma:

- **Resumen** (≤ 132 caracteres): sale del paquete (`appDesc` en `i18n/<locale>.json`); no se edita en el panel.
- **Descripción**: versión traducida de la descripción larga de `store/LISTING.md`; se pega a mano.

Cómo cargarlos: Developer Dashboard → el elemento → **Ficha de Play Store** → en el selector de
idioma de arriba, **Añadir idioma** → elegir el idioma → pegar la descripción → Guardar
borrador. Repetir por idioma y al final **Enviar para revisión**.

## Capturas por idioma (`store/shots/<locale>/`)

Cuatro capturas de 1280×800 por idioma, en este orden de subida:

1. `1-promo.png` — promocional: nombre, eslogan, cuatro puntos y el panel. Va primera porque es
   la que Google enseña en los resultados de búsqueda y en la cabecera de la ficha.
2. `2-stats.png` — el panel con "Más estadísticas" abierto.
3. `3-game.png` — isla de una partida real (anonimizada) junto al panel.
4. `4-features.png` — tabla de funciones en el estilo del panel.

Opcionales, no incluidas por defecto: `extra-research.png` (consentimiento) y `extra-options.png`.

En el panel, con cada idioma seleccionado en el selector de arriba, la sección **Capturas** tiene
una casilla "Capturas localizadas": márcala y sube las cuatro de esa carpeta. Si un idioma no
tiene capturas propias, Google muestra las del idioma predeterminado (inglés).

Se generan con `node tools/shot-store.mjs` (captura el panel en cada idioma con Chromium
`--lang`) y `python tools/compose-store.py` (composición); los textos están en
`store/shots-i18n.json`. Las promocionales comunes (`store/promo-440x280.png` y
`store/marquee-1400x560.png`) se generan con la pasada en inglés.

| Carpeta | Idioma en el panel de Google |
| --- | --- |
| `en` | English |
| `es` | Español |
| `zh_CN` | 中文 (简体) |
| `de` | Deutsch |
| `ja` | 日本語 |
| `fr` | Français |
| `pt_BR` | Português (Brasil) |
| `pt_PT` | Português (Portugal) |
| `ro` | Română |
| `ru` | Русский |
| `tr` | Türkçe |
| `pl` | Polski |
| `nl` | Nederlands |
| `ms` | Bahasa Melayu |
| `ko` | 한국어 |
| `it` | Italiano |
