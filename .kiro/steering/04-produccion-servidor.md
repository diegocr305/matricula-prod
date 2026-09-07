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

## Nginx (server blocks)
Ubicación: `/opt/bitnami/nginx/conf/server_blocks/`. Los nuestros:
- `14-matriculas-https.conf`: `server_name matricula...`, sirve el `dist/` (SPA con
  `try_files $uri $uri/ /index.html`) y hace proxy `location /api/ -> http://127.0.0.1:8000/`.
- `15-rgm-redirect.conf`: `server_name rgm...`, `return 301 https://matricula.slepvalparaiso.gob.cl$request_uri`.
- Ambos usan el cert `/etc/letsencrypt/live/matricula.slepvalparaiso.gob.cl/`.
- Validar SIEMPRE con `sudo /opt/bitnami/nginx/sbin/nginx -t` antes de recargar.
- Recargar: `sudo /opt/bitnami/ctlscript.sh restart nginx`.

## HTTPS / Certificado
- Emitido con: `sudo certbot certonly --webroot -w /opt/bitnami/nginx/html -d matricula.slepvalparaiso.gob.cl -d rgm.slepvalparaiso.gob.cl`
- Método webroot (el mismo que usan reservas/repositorio). Renovación automática por certbot.

## Procedimiento de actualización (redeploy)
Desde el servidor:
```
cd /opt/bitnami/nginx/apps/matriculas
git pull origin main
# si cambió backend:
cd backend && ./venv/bin/pip install -r requirements.txt && sudo systemctl restart matriculas-backend
# si cambió frontend:
cd ../frontend-matriculas && npm ci && npm run build
```
Nota: el `dist/` se sirve estático; tras rebuild no hace falta recargar Nginx. Cloudflare puede
cachear; usar Ctrl+F5 o incógnito para ver cambios de HTML/favicon.

## Dependencias de runtime del backend (aprendidas en deploy)
`requirements.txt` DEBE incluir `requests` (lo usa google-auth) y `python-multipart`
(lo usa FastAPI para Form/uploads). Faltaban y rompían el arranque en un venv limpio.
