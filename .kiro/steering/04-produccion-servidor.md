# Producción — Servidor Lightsail / Nginx (SLEP Valparaíso)

Estado: el sistema está DESPLEGADO y operativo en `https://matricula.slepvalparaiso.gob.cl`.

## Servidor
- AWS Lightsail, Bitnami **NGINX 1.28** sobre Debian 12 (bookworm). Región us-east-1.
- IP estática: `54.86.236.154`. Usuario SSH: `bitnami` (acceso por consola SSH de Lightsail).
- Es un servidor COMPARTIDO: ya aloja `reservas.slepvalparaiso.gob.cl`, `repositorio...`,
  `slepvalparaiso.gob.cl`. NO tocar sus server blocks ni sus certificados.
- Servicios Bitnami: `mariadb`, `nginx`, `php-fpm` (gestionados con `/opt/bitnami/ctlscript.sh`).
- Node **20.20.2** (instalado con NodeSource para poder buildear Vite 8; antes tenía Node 18
  que NO sirve para Vite 8). Python **3.11**. `python3.11-venv` y `python3-dev` instalados.

## DNS / Cloudflare
- Los dominios `matricula.slepvalparaiso.gob.cl` y `rgm.slepvalparaiso.gob.cl` están detrás
  del **proxy de Cloudflare** (resuelven a IPs `2606:4700:...`, no a la IP del server).
- Cloudflare termina el HTTPS público con su propio certificado y habla con el origen por
  HTTPS (modo Full / Full strict, igual que reservas). No tenemos acceso al panel de Cloudflare.
- El certificado Let's Encrypt del servidor cubre el tramo Cloudflare↔origen.

## Estructura en el servidor
- Código: `/opt/bitnami/nginx/apps/matriculas/` (clonado de `github.com/diegocr305/matricula-prod`).
  - remote en el servidor se llama **`origin`** (en la máquina local del dev se llama `prod`).
- Backend: `/opt/bitnami/nginx/apps/matriculas/backend` con venv en `backend/venv`.
- Frontend build: `/opt/bitnami/nginx/apps/matriculas/frontend-matriculas/dist`.

## Backend (servicio systemd)
- Unidad: `/etc/systemd/system/matriculas-backend.service`.
- Corre `uvicorn main:app --host 127.0.0.1 --port 8000` como usuario `bitnami`, `Restart=always`,
  `enabled` (arranca al bootear el server).
- Comandos: `sudo systemctl {status|restart|stop} matriculas-backend`,
  logs con `sudo journalctl -u matriculas-backend -n 30`.
- `.env` de producción en `backend/.env` (chmod 600). Contiene DATABASE_URL (pooler Supabase),
  DB_SCHEMA=matriculas, GOOGLE_CLIENT_ID, GOOGLE_HOSTED_DOMAIN, JWT_SECRET_KEY (aleatorio),
  ACCESS_TOKEN_EXPIRE_MINUTES, CORS_ORIGINS.
- **CORS_ORIGINS es obligatorio en producción**: si falta, `config.py` cae al default de
  localhost y el frontend queda BLOQUEADO por CORS. Debe listar los dominios reales:
  `CORS_ORIGINS=https://matricula.slepvalparaiso.gob.cl,https://rgm.slepvalparaiso.gob.cl`.
- **Nombres de variables (contrato config.py)**: el backend lee la clave JWT desde
  `JWT_SECRET_KEY` (con fallback a `SECRET_KEY`). `DATABASE_URL` y `DB_SCHEMA` se leen del
  entorno; si `DATABASE_URL` está definida, se usa en vez del host/user/pass sueltos y se fija
  `search_path` a `DB_SCHEMA` (matriculas). Todo esto vive en `backend/config.py`.
- **Almacenamiento de documentos** (`STORAGE_PROVIDER`, desde el consolidado de sep-2026):
  - `local` (default): guarda en disco. Definir `STORAGE_LOCAL_DIR` a una ruta persistente
    con permisos del usuario `bitnami` (ej. `backend/uploads`).
  - `s3`: requiere `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
    `S3_BUCKET_NAME`, `S3_REGION_NAME`. Sin credenciales válidas hace fallback a local.
  - Límite de subida: `MAX_FILE_SIZE_BYTES` (default 5 MB).

## Nginx (server blocks)
Ubicación: `/opt/bitnami/nginx/conf/server_blocks/`. Los nuestros:
- `14-matriculas-https.conf`: `server_name matricula...`, sirve el `dist/` (SPA con
  `try_files $uri $uri/ /index.html`) y hace proxy `location /api/ -> http://127.0.0.1:8000/`.
- `15-rgm-redirect.conf`: `server_name rgm...`, `return 301 https://matricula.slepvalparaiso.gob.cl$request_uri`.
- Ambos usan el cert `/etc/letsencrypt/live/matricula.slepvalparaiso.gob.cl/`.
- Validar SIEMPRE con `sudo /opt/bitnami/nginx/sbin/nginx -t` antes de recargar.
- Recargar: `sudo /opt/bitnami/ctlscript.sh restart nginx`.

### Caché del frontend — evitar el Ctrl+F5 tras cada deploy (IMPORTANTE)
Problema: tras `npm run build`, los usuarios seguían viendo el front viejo hasta hacer
Ctrl+F5, porque el navegador/Cloudflare cacheaban el `index.html`. Vite ya pone hash en
los assets (`index-<hash>.js`), así que el ÚNICO archivo que debe NO cachearse es el
`index.html`: si llega fresco, apunta al JS/CSS nuevo y todo se propaga solo.

Solución (dos capas, ya que los dominios están detrás de Cloudflare):
1. **HTML (ya en el repo)**: `frontend-matriculas/index.html` lleva meta tags
   `Cache-Control: no-cache, no-store, must-revalidate`. Se despliega con el build normal.
2. **Nginx (aplicar en el servidor, en `14-matriculas-https.conf`)**: agregar DENTRO del
   `server { ... }` que sirve el `dist/`, ANTES del `location /` de la SPA:

   ```nginx
   # index.html SIEMPRE fresco (se propaga el deploy sin Ctrl+F5)
   location = /index.html {
       root /opt/bitnami/nginx/apps/matriculas/frontend-matriculas/dist;
       add_header Cache-Control "no-cache, no-store, must-revalidate" always;
       expires -1;
   }
   # Assets con hash: cachear agresivo (su nombre cambia en cada build)
   location /assets/ {
       root /opt/bitnami/nginx/apps/matriculas/frontend-matriculas/dist;
       expires 1y;
       add_header Cache-Control "public, immutable";
   }
   # SPA (debe ir DESPUÉS de los dos anteriores)
   location / {
       root /opt/bitnami/nginx/apps/matriculas/frontend-matriculas/dist;
       try_files $uri $uri/ /index.html;
   }
   ```
   Validar y recargar: `sudo /opt/bitnami/nginx/sbin/nginx -t` y luego
   `sudo /opt/bitnami/ctlscript.sh restart nginx`.

Alcance real: esto elimina el Ctrl+F5 para quien **navega o recarga** tras el deploy.
Una pestaña YA abierta y quieta seguirá en la versión vieja hasta un F5 normal (ninguna
config "empuja" código a una pestaña inactiva; eso requeriría un chequeo de versión en la
app, pendiente). Si Cloudflare tuviera una Cache Rule propia para el HTML, habría que
excluir `index.html` ahí también (hoy no tenemos acceso al panel de Cloudflare).

## HTTPS / Certificado
- Emitido con: `sudo certbot certonly --webroot -w /opt/bitnami/nginx/html -d matricula.slepvalparaiso.gob.cl -d rgm.slepvalparaiso.gob.cl`
- Método webroot (el mismo que usan reservas/repositorio). Renovación automática por certbot.

## Procedimiento de actualización (redeploy)
Desde el servidor:
```
cd /opt/bitnami/nginx/apps/matriculas
git pull origin main
# si cambió backend:
cd backend
# 1. si hay variables nuevas en .env.example, agregarlas a backend/.env (ej. CORS_ORIGINS, config S3)
./venv/bin/pip install -r requirements.txt
# 2. correr migraciones idempotentes SI el deploy trae cambios de esquema/almacenamiento:
./venv/bin/python apply_storage_migration.py   # columnas ruta_documento_resolucion / ruta_documento_tutor
./venv/bin/python apply_indexes.py             # 5 índices de rendimiento
sudo systemctl restart matriculas-backend
sudo journalctl -u matriculas-backend -n 30    # verificar que arrancó sin ImportError
# si cambió frontend:
cd ../frontend-matriculas && npm ci && npm run build
```
Nota: el `dist/` se sirve estático; tras rebuild no hace falta recargar Nginx. Cloudflare puede
cachear; usar Ctrl+F5 o incógnito para ver cambios de HTML/favicon.

### Scripts de migración de BD (en `backend/`)
- `apply_storage_migration.py`: agrega `matricula.ruta_documento_resolucion` y
  `apoderado.ruta_documento_tutor` (VARCHAR 500, nullable). Chequea antes de alterar → idempotente.
- `apply_indexes.py`: crea 5 índices (`CREATE INDEX IF NOT EXISTS`) para auditoría, matrícula
  y estudiante. Idempotente, seguro de re-ejecutar.
- Ambos usan el pool de `database.py`, así que actúan sobre el schema `matriculas` (search_path).

## Dependencias de runtime del backend (aprendidas en deploy)
`requirements.txt` DEBE incluir `requests` (lo usa google-auth) y `python-multipart`
(lo usa FastAPI para Form/uploads). Faltaban y rompían el arranque en un venv limpio.
Desde el consolidado de sep-2026 también incluye `boto3` (cliente S3 en `storage_service.py`);
recordar `pip install -r requirements.txt` en el redeploy para traerlo.
