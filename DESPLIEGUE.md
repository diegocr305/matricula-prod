# Despliegue — Sistema de Matrículas SLEP Valparaíso

**Estado: DESPLEGADO y operativo en https://matricula.slepvalparaiso.gob.cl**
(`rgm.slepvalparaiso.gob.cl` redirige al principal con 301).

> La referencia técnica detallada del servidor vive en
> `.kiro/steering/04-produccion-servidor.md`. Este documento es el resumen general.

---

## 1. Arquitectura

- **Base de datos**: Supabase (proyecto `directorio_escolar_slep`, ref `gyhihuovussdauehmeuk`).
  Tablas del sistema en el **schema `matriculas`** (aislado de `public`, que usan reservas/OIRS/etc.).
- **Backend**: FastAPI + psycopg2. Corre como servicio systemd (`matriculas-backend`) en
  `127.0.0.1:8000`. Config por `backend/.env`.
- **Frontend**: React + Vite. Build estático en `dist/`, servido por Nginx.
- **Nginx**: sirve el frontend y hace proxy `/api/` → backend. Detrás de Cloudflare (HTTPS).
- **Servidor**: AWS Lightsail, Bitnami Nginx, IP `54.86.236.154`, compartido con otros sistemas SLEP.

### Datos migrados (desde `backup_rgm.sql`)
| Tabla | Filas |
|---|---|
| estudiante | 34.164 |
| matricula | 91.733 (2022–2026, parcial en 2026) |
| establecimiento | 66 (65 enlazados a `slep_establecimientos` por RBD) |
| catalogo_grado | 15 |
| catalogo_tipo_ensenanza | 18 |
| usuario | 6 |
| apoderado | 3 |

`auditoria_matricula` se dejó vacía a propósito (los ~284k históricos no se migraron).
Nota: no todos los establecimientos tienen matrícula 2026 (el backup era parcial en ese año).

### Acceso por establecimiento
- `matriculas.acceso_establecimiento`: `correo` (Google) → `id_establecimiento` → `rol`.
  Poblada con los 65 directores desde `slep_establecimientos.correo_director`.
- **Agregar funcionario a un colegio**: insertar fila con correo `@slepvalparaiso.cl`,
  `id_establecimiento` y `rol` (`Colegio` o `Visualizador_Colegio`).
- **Agregar admin SLEP** (ve todo): insertar en `matriculas.usuario` con `rol='SLEP'`,
  `id_establecimiento=NULL`.

---

## 2. Pendientes (requieren acción manual)

### 2.1 Google Cloud — orígenes OAuth  ⚠️ NECESARIO PARA LOGIN EN PRODUCCIÓN
En el OAuth client "SLEP Matrículas Web Client" (`498300607567-edt5c28...`), agregar en
**Orígenes autorizados de JavaScript**:
- `https://matricula.slepvalparaiso.gob.cl`
- `https://rgm.slepvalparaiso.gob.cl`
- (dev) `http://localhost:5173`, `http://127.0.0.1:5173`
Sin esto, el botón de Google falla con `origin_mismatch` en el dominio real.
Recomendado: pantalla de consentimiento en modo **Interno** (solo Workspace slepvalparaiso.cl).

### 2.2 Seguridad — rotar credenciales expuestas durante la configuración
- **Llave SSH** del servidor Lightsail (se pegó en el chat).
- **Contraseña de la BD** de Supabase.
- **service_role key** de Supabase.
- **Client Secret** de GCP.
- **JWT_SECRET_KEY** del backend (regenerar y actualizar `backend/.env` en el server, luego
  `sudo systemctl restart matriculas-backend`).

### 2.3 RLS en Supabase (opcional, recomendado)
Las tablas del schema `matriculas` tienen RLS deshabilitado. No están expuestas por la API REST
de Supabase (solo `public` lo está) y el backend usa conexión directa (rol postgres), así que no
hay exposición vía anon key. Habilitar RLS + políticas solo si en el futuro se accede desde el
cliente Supabase.

### 2.4 Funcionalidades pendientes (`por hacer.txt`)
- Contar matriculados por curso (alumnos excedentes) y llevarlo visible al registro.
- Sacar los Jardines Infantiles del sistema.

---

## 3. Ejecución local (desarrollo)

Backend (desde `backend/`):
```
python -m uvicorn main:app --reload --port 8000
```
Frontend (desde `frontend-matriculas/`):
```
npm run dev   # http://localhost:5173
```
Requiere `backend/.env` y `frontend-matriculas/.env.local` (ambos ignorados por git;
ver `.env.example` / `.env.production.example`).

---

## 4. Redeploy a producción (resumen)
Desde el servidor, en `/opt/bitnami/nginx/apps/matriculas` (remote se llama `origin`):
```
git pull origin main
# backend cambió:  cd backend && ./venv/bin/pip install -r requirements.txt && sudo systemctl restart matriculas-backend
# frontend cambió: cd frontend-matriculas && npm ci && npm run build
```
Detalle completo en `.kiro/steering/04-produccion-servidor.md`.
