# Despliegue a producción — Sistema de Matrículas SLEP Valparaíso

Dominio objetivo: `matricula.slepvalparaiso.gob.cl`

Este documento resume la arquitectura tras la migración a Supabase y los
pasos pendientes para poner el sistema en producción.

---

## 1. Arquitectura actual

- **Base de datos**: Supabase (proyecto `directorio_escolar_slep`,
  ref `gyhihuovussdauehmeuk`). Las tablas del sistema viven en el
  **schema `matriculas`** (separado de los otros sistemas del SLEP que
  usan `public`: reservas, OIRS, funcionarios, documentos).
- **Backend**: FastAPI + psycopg2. Se conecta a Supabase por el pooler.
  Configuración por variables de entorno (`backend/.env`).
- **Frontend**: React + Vite. URL de API y Client ID de Google por
  variables de entorno (`frontend-matriculas/.env*`).

### Datos migrados (desde `backup_rgm.sql`)
| Tabla | Filas |
|---|---|
| estudiante | 34.164 |
| matricula | 91.733 (2022–2026) |
| establecimiento | 66 (65 enlazados a `slep_establecimientos` por RBD) |
| catalogo_grado | 15 |
| catalogo_tipo_ensenanza | 18 |
| usuario | 6 |
| apoderado | 3 |

La tabla `auditoria_matricula` se dejó vacía a propósito (los ~284k
registros históricos no se migraron).

### Acceso por establecimiento
- `matriculas.acceso_establecimiento` relaciona `correo` (Google) →
  `id_establecimiento` → `rol`. Se pobló con los 65 directores desde
  `slep_establecimientos.correo_director`.
- Para dar acceso a más funcionarios de un colegio: insertar una fila
  en esa tabla con su correo `@slepvalparaiso.cl`, el `id_establecimiento`
  y el `rol` (`Colegio` o `Visualizador_Colegio`).

---

## 2. Pasos manuales pendientes (requieren tu acción)

### 2.1 Google Cloud — OAuth Client ID
1. Google Cloud Console → APIs & Services → Credentials.
2. Crear **OAuth client ID** tipo *Web application*.
3. **Authorized JavaScript origins**:
   - `http://localhost:5173` (desarrollo)
   - `https://matricula.slepvalparaiso.gob.cl` (producción)
4. Copiar el Client ID y ponerlo en:
   - `backend/.env` → `GOOGLE_CLIENT_ID=...`
   - `frontend-matriculas/.env.local` (dev) y `.env.production` (prod) → `VITE_GOOGLE_CLIENT_ID=...`
   (deben ser el MISMO valor)

### 2.2 Seguridad — rotar credenciales
- **Rotar la `service_role` key** de Supabase (se expuso durante la
  configuración): Dashboard → Project Settings → API → Reset.
- Definir un **`JWT_SECRET_KEY`** aleatorio y largo en `backend/.env`
  (no usar el valor por defecto en producción).
- Considerar rotar la contraseña de la base de datos tras el despliegue.

### 2.3 CORS
- En `backend/.env` de producción definir:
  `CORS_ORIGINS=https://matricula.slepvalparaiso.gob.cl`

### 2.4 Hosting
- **Frontend**: `npm run build` genera `dist/`, servir como estático
  (Nginx, Vercel, Netlify, o el servidor institucional).
- **Backend**: ejecutar con un servidor ASGI de producción, p.ej.:
  `uvicorn main:app --host 0.0.0.0 --port 8000` detrás de un reverse
  proxy (Nginx) con HTTPS.
- Definir la URL pública del backend en `VITE_API_URL` del frontend.

### 2.5 RLS (opcional, recomendado)
- Las tablas del schema `matriculas` tienen RLS deshabilitado. No están
  expuestas por la API REST de Supabase (solo `public` lo está por
  defecto) y el backend usa conexión directa con rol postgres, por lo
  que no hay exposición vía anon key. Aun así, si en el futuro se accede
  a estas tablas desde el cliente Supabase, habrá que habilitar RLS y
  definir políticas.

---

## 3. Ejecución local (recordatorio)

Backend:
```
cd backend
python -m uvicorn main:app --reload --port 8000
```

Frontend:
```
cd frontend-matriculas
npm run dev
```

Variables de entorno locales ya configuradas en `backend/.env` y
`frontend-matriculas/.env.local` (ambos ignorados por git).
