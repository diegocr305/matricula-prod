# Operación local y despliegue — Sistema de Matrículas SLEP Valparaíso

## Ejecutar en local

Backend (FastAPI) — desde `backend/`:
```
python -m uvicorn main:app --reload --port 8000
```
- Requiere `backend/.env` configurado (DATABASE_URL, GOOGLE_CLIENT_ID, etc.).
- Dependencias en `backend/requirements.txt` (`pip install -r requirements.txt`).

Frontend (Vite) — desde `frontend-matriculas/`:
```
npm install   # primera vez
npm run dev   # levanta en http://localhost:5173
```
- Requiere `frontend-matriculas/.env.local` con `VITE_GOOGLE_CLIENT_ID` y `VITE_API_URL`.

> Nota: `npm run dev` y `uvicorn` son procesos long-running; el usuario los ejecuta
> manualmente en su terminal.

## URL de la API en el frontend
- Centralizada en `frontend-matriculas/src/config/api.ts` → `API_URL`.
- Lee `VITE_API_URL` (fallback `http://127.0.0.1:8000`). NO hardcodear URLs nuevas;
  importar `API_URL` desde `config/api`.

## Build de producción (frontend)
```
npm run build   # genera dist/
```
- `tsconfig.app.json` tiene `noUnusedLocals`/`noUnusedParameters` en `false`
  (había errores TS6133 preexistentes). El build compila OK.

## Despliegue (producción)
Ver `DESPLIEGUE.md` en la raíz para la guía completa. Puntos clave:
- Frontend: servir `dist/` como estático. Definir `VITE_API_URL` en `.env.production`.
- Backend: uvicorn detrás de reverse proxy (Nginx) con HTTPS.
- CORS: definir `CORS_ORIGINS` en `backend/.env` (coma-separado). Vacío = permite todo (solo dev).
- Registrar los dominios de producción como orígenes en el OAuth client de GCP.

## Archivos sensibles (NO commitear)
- `backend/.env`, `frontend-matriculas/.env.local`, `.env.production` → ignorados por git.
- No poner secretos (passwords, client secret, service_role key) en steering, código ni docs versionados.

## Git
- Repo: `matriculas-sistema` (rama `main`). El backend delega lógica a `backend/services/`;
  el frontend usa hooks en `features/*/hooks/`.
