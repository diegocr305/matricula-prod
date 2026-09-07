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
- `SLEP`, `admin_slep`, `Visualizador_SLEP` → portal "Administración Central (SLEP)". Ven todos los establecimientos.
- `Colegio`, `Visualizador_Colegio` → portal "Establecimiento Educacional". Ven solo su `id_establecimiento`.
- Los `Visualizador_*` son de solo lectura (guard `verificar_escritura` en `security.py`).

## Dar acceso a nuevos usuarios
- **Director / funcionario de un colegio**: insertar en `matriculas.acceso_establecimiento`
  (correo `@slepvalparaiso.cl`, `id_establecimiento`, `rol` = 'Colegio' o 'Visualizador_Colegio').
  Los 65 directores ya se poblaron desde `slep_establecimientos.correo_director`.
- **Administrador SLEP** (ve todo): insertar en `matriculas.usuario` con `rol='SLEP'` e
  `id_establecimiento=NULL`.

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
- Frontend (`frontend-matriculas/.env.local`): `VITE_GOOGLE_CLIENT_ID` (mismo valor que el backend).
- El Client ID debe ser IDÉNTICO en backend y frontend.

## Seguridad pendiente (higiene)
- El Client Secret de GCP y la `service_role` key de Supabase se expusieron durante la
  configuración → conviene rotarlos.
- En producción definir un `JWT_SECRET_KEY` aleatorio (no el valor por defecto).
