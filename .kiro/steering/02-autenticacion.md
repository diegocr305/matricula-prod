# Autenticación — Sistema de Matrículas SLEP Valparaíso

## Modelo de autenticación
El sistema tiene DOS vías de login, ambas emiten un **JWT propio** del backend
(NO usa Supabase Auth):

1. **Login tradicional** (`POST /login`): email + password contra `matriculas.usuario`
   (password_hash bcrypt). Definido en `services/auth_service.py`.
2. **Login con Google** (`POST /login/google`): el frontend usa `@react-oauth/google`
   (Google Identity Services), obtiene un **ID token** y lo manda al backend. El backend
   lo valida con `id_token.verify_oauth2_token` usando `GOOGLE_CLIENT_ID`.

> Importante: este flujo es de verificación propia del ID token. NO usa el flujo OAuth
> server-side de Supabase (no aplica el Client Secret ni el callback `/auth/v1/callback`).

## Flujo de login Google (backend `login_google_service`)
1. Valida el ID token con Google.
2. Valida el dominio: el correo debe terminar en `@GOOGLE_HOSTED_DOMAIN` (`slepvalparaiso.cl`).
3. Busca el correo primero en `matriculas.usuario` (roles SLEP / admin / visualizadores).
4. Si no está, busca en `matriculas.acceso_establecimiento` (directores/funcionarios de colegio).
   Al entrar por esta vía, hace UPSERT en `usuario` para tener `id_usuario` real
   (necesario por la FK `matricula.id_usuario_ejecutor`).
5. Emite JWT con: `sub` (email), `id_usuario`, `rol`, `id_establecimiento`.

## Roles

### Catálogo central (FUENTE ÚNICA DE VERDAD)
La definición de roles vive centralizada en **`backend/roles.py`** y su espejo
**`frontend-matriculas/src/config/roles.ts`**. Toda comparación de rol se hace
NORMALIZADA (minúsculas) para tolerar la mezcla histórica de capitalización en la
BD (`Colegio` / `COLEGIO` / `Director`). NO volver a hardcodear listas de roles
sueltas en routers/hooks; usar los helpers (`es_slep`, `puede_escribir`,
`puede_ver_pestana` / `esSlep`, `puedeEscribir`, `puedeVerPestana`).

| Rol | Alcance | Escribe | Pestañas que ve |
|---|---|---|---|
| `admin_slep` (Super Admin) | SLEP (todos) | Sí | Todas (incl. Auditoría, carga SIGE) |
| `Visualizador_SLEP` | SLEP (todos) | No | Todas, solo lectura |
| `Colegio` (Director/directivo) | Su establecimiento | Sí | Inicio, Matrículas, Estudiantes, Panel, Asistencia |
| `Matriculador` | Su establecimiento | Sí | Inicio, Matrículas, Estudiantes (NO Panel ni Asistencia) |
| `Visualizador_Colegio` | Su establecimiento | No | Inicio, Matrículas, Estudiantes, Panel, Asistencia (lectura) |
| `Docente_Jefe` (futuro) | Su curso | Sí | Inicio, Matrículas, Estudiantes — requiere `id_curso` en `acceso_establecimiento` (steering 08) |

- Alias legacy reconocidos: `SLEP`/`admin` → admin_slep; `Director`/`establecimiento` → Colegio.
- `admin_slep` sin `id_establecimiento` (NULL) = ve todo el SLEP.
- Guard de pestaña por endpoint: `Depends(requiere_pestana(roles.TAB_*))` en `security.py`
  (aplicado hoy a dashboard y asistencia). En el frontend, `RutaPorRol` en `App.tsx`
  bloquea acceso por URL directa a pestañas no habilitadas.

## Dar acceso a nuevos usuarios
- **Director / funcionario / matriculador de un colegio**: insertar en
  `matriculas.acceso_establecimiento` (correo `@slepvalparaiso.cl`, `id_establecimiento`,
  `rol` = 'Colegio' | 'Matriculador' | 'Visualizador_Colegio'). La constraint única es
  compuesta **(correo, id_establecimiento)** (no solo correo), ojo con el ON CONFLICT.
  Los 65 directores ya se poblaron desde `slep_establecimientos.correo_director`.
- **Administrador SLEP** (ve todo): insertar en `matriculas.usuario` con `rol='admin_slep'`
  e `id_establecimiento=NULL`.
- **Script de alta en lote** (producción, idempotente): `crear_admins/crear_usuarios_lote.py`
  lee `backend/.env` (DATABASE_URL) y fija search_path a `matriculas`. OJO: los otros
  scripts de `crear_admins/` apuntan a una BD local de desarrollo, NO a producción.

## Accesos otorgados (oct 2026, correo del jefe)
- **admin_slep** (nivel central, acceso total), en `usuario`: araceli.contreras,
  daniela.aguilera, marta.villegas, angelica.zamora, mauricio.montero, maria.guerra,
  daniel.gajardo (todos @slepvalparaiso.cl).
- **Matriculador** RBD 1520 (id_establecimiento=17), en `acceso_establecimiento`:
  tamar.rubina, analia.torres, yasna.diaz.
- `carolina.conchap@slepvalparaiso.cl` sigue como **Director** (`Colegio`) del RBD 1520
  (NO es matriculadora; aclarado por el dueño).

## Configuración Google Cloud (GCP)
- OAuth Client ID dedicado del sistema de matrículas: "SLEP Matrículas Web Client".
  Client ID: `498300607567-edt5c28askolgncq8t2pg6o39lhnlb0f.apps.googleusercontent.com`.
  (Existe otro client aparte, "SLEP Reservas Web Client", que usa el sistema de reservas — no confundir.)
- El Client Secret NO se usa en este flujo (solo haría falta para OAuth server-side / Supabase Auth).
- **Orígenes autorizados de JavaScript** que deben estar registrados en ese OAuth client:
  - `http://localhost:5173`, `http://127.0.0.1:5173` (desarrollo)
  - `https://matricula.slepvalparaiso.gob.cl`, `https://rgm.slepvalparaiso.gob.cl` (producción)
  - Agregar `http://<IP-LAN>:5173` si se prueba auth desde la red local.
- URIs de redirección: NO se necesitan para este flujo (dejar vacías).
- Pantalla de consentimiento: recomendado tipo **Interno** (solo cuentas del Workspace `slepvalparaiso.cl`).

## Variables de entorno de auth
- Backend (`backend/.env`): `GOOGLE_CLIENT_ID`, `GOOGLE_HOSTED_DOMAIN=slepvalparaiso.cl`,
  `JWT_SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`.
- Frontend: `VITE_GOOGLE_CLIENT_ID`. En dev vive en `.env.local`; en producción en
  `.env.production` (el servidor NO tiene `.env.local`). Vite prioriza `.env.local` sobre
  `.env.production`, así que en local ese archivo gana.
- El Client ID debe ser IDÉNTICO en backend y frontend:
  `498300607567-edt5c28askolgncq8t2pg6o39lhnlb0f.apps.googleusercontent.com`.

### Client ID en el frontend (NO hardcodear placeholder)
- `src/app/main.tsx` lee el Client ID de `import.meta.env.VITE_GOOGLE_CLIENT_ID`, con
  fallback al Client ID real. Vite lo hornea en el bundle EN EL BUILD (no en runtime):
  tras cambiar el `.env` hay que re-`npm run build`.
- Antecedente: `main.tsx` tenía hardcodeado `"AQUI_IRA_TU_CLIENT_ID_DE_GOOGLE..."`, lo que
  ignoraba la variable y producía **Error 401 invalid_client** en el login de Google.
  NO reintroducir un placeholder; mantener la lectura desde `VITE_GOOGLE_CLIENT_ID`.

## Accesos otorgados (registro)
- `mauricio.casanova@slepvalparaiso.cl` → `acceso_establecimiento` id_establecimiento=17
  (Liceo Bicentenario Marítimo de Valparaíso, RBD 1520), rol `Colegio` (escritura).

## Seguridad pendiente (higiene)
- El Client Secret de GCP y la `service_role` key de Supabase se expusieron durante la
  configuración → conviene rotarlos.
- En producción definir un `JWT_SECRET_KEY` aleatorio (no el valor por defecto).
