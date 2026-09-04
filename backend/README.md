# Ingest backend (Railway)

Servicio Node sin dependencias que recibe las partidas grabadas por la extensión.

## Qué hace

- `POST /ingest`: recibe un archivo `.cctr.gz` (msgpack + gzip, unas decenas de KB por partida),
  valida la cabecera, lo guarda en el volumen persistente y anota una fila en el índice SQLite.
  Idempotente: una clave repetida devuelve 409 y la extensión lo trata como éxito.
- `GET /games`, `GET /games/<key>`, `GET /stats`: rutas de administración (token) para descargar el dataset.
- Sin conexiones en vivo, sin colas: una petición por partida. Mil partidas al día ≈ 50 MB.

## Despliegue en Railway

```
cd backend
railway login
railway init            # nuevo proyecto
railway volume add --mount-path /data
railway variables --set DATA_DIR=/data --set ADMIN_TOKEN=<secreto-largo> --set INGEST_TOKEN=<otro-secreto>
railway up
railway domain          # obtiene la URL pública
```

Variables:

| Variable | Uso |
| --- | --- |
| `DATA_DIR` | Ruta del volumen (`/data`). |
| `ADMIN_TOKEN` | Obligatorio para `/games` y `/stats` (`Authorization: Bearer ...`). |
| `INGEST_TOKEN` | Opcional. Si se define, la extensión debe enviarlo (campo Token en Opciones o `DEFAULT_TOKEN` en `src/background.js`). Frena subidas ajenas; no es secreto real porque va dentro de la extensión. |
| `MAX_BYTES` | Tamaño máximo por partida (8 MB por defecto). |
| `RATE_PER_HOUR` | Subidas por hora y por instalación (60 por defecto). |

Despliegue actual: proyecto `cct-ingest`, servicio `cct-ingest`, dominio `https://cct-ingest-production.up.railway.app` (ya configurado como `DEFAULT_ENDPOINT` en `src/background.js`).

## Descargar el dataset

```
node tools/sync.mjs https://tu-servicio.up.railway.app <ADMIN_TOKEN> ./dataset
python tools/cctr_reader.py ./dataset/games/2026/09/<key>.cctr.gz --summary
```

## Prueba local

```
ADMIN_TOKEN=x node backend/server.js
```

y en Opciones de la extensión pon `http://localhost:8080` como URL de ingesta.
