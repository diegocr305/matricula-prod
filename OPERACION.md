# Operación diaria — Matrículas SLEP Valparaíso

Guía rápida de comandos frecuentes. Los SQL se ejecutan en Supabase
(SQL Editor del dashboard, o vía MCP). Los comandos de despliegue se ejecutan
en el servidor por la consola SSH de Lightsail.

---

## 1. Gestión de usuarios / accesos

Recordatorio del modelo:
- **Admin SLEP** (ve TODOS los establecimientos) → va en `matriculas.usuario` con `rol='SLEP'` e `id_establecimiento=NULL`.
- **Director / funcionario de un colegio** (ve solo SU establecimiento) → va en `matriculas.acceso_establecimiento`.
- Solo entran correos `@slepvalparaiso.cl` que existan en una de esas tablas.

### 1.1 Agregar un ADMIN SLEP (acceso total)
```sql
INSERT INTO matriculas.usuario (email_institucional, nombre, rol, id_establecimiento, activo)
VALUES ('nombre.apellido@slepvalparaiso.cl', 'Nombre Apellido', 'SLEP', NULL, true)
ON CONFLICT (email_institucional) DO UPDATE
  SET rol = 'SLEP', id_establecimiento = NULL, activo = true;
```
> Al entrar, debe elegir el perfil **Administración Central (SLEP)**.

### 1.2 Agregar un funcionario ADICIONAL a un establecimiento (además del director)
Primero, encontrar el id del establecimiento por su RBD:
```sql
SELECT id_establecimiento, rbd, nombre FROM matriculas.establecimiento WHERE rbd = '1504';
```
Luego, agregar el acceso (reemplaza el id_establecimiento por el que salió arriba):
```sql
INSERT INTO matriculas.acceso_establecimiento (correo, id_establecimiento, rol, es_principal, activo)
VALUES ('nombre.apellido@slepvalparaiso.cl', 2, 'Colegio', false, true)
ON CONFLICT (correo, id_establecimiento) DO UPDATE
  SET rol = 'Colegio', activo = true;
```
> `rol` puede ser `'Colegio'` (edita) o `'Visualizador_Colegio'` (solo lectura).
> `es_principal=false` = funcionario adicional; el director suele ser `true`.
> Al entrar, debe elegir el perfil **Establecimiento Educacional**.

### 1.3 Quitar / desactivar un acceso
```sql
-- Desactivar (recomendado, reversible):
UPDATE matriculas.acceso_establecimiento SET activo = false WHERE correo = 'nombre.apellido@slepvalparaiso.cl';
UPDATE matriculas.usuario SET activo = false WHERE email_institucional = 'nombre.apellido@slepvalparaiso.cl';

-- Borrar del todo (irreversible):
DELETE FROM matriculas.acceso_establecimiento WHERE correo = 'nombre.apellido@slepvalparaiso.cl';
```

### 1.4 Ver los accesos actuales de un establecimiento
```sql
SELECT a.correo, a.rol, a.es_principal, a.activo
FROM matriculas.acceso_establecimiento a
JOIN matriculas.establecimiento e ON a.id_establecimiento = e.id_establecimiento
WHERE e.rbd = '1504';
```

---

## 2. Despliegue de cambios (en el servidor por SSH de Lightsail)

Ir siempre a la carpeta del proyecto:
```bash
cd /opt/bitnami/nginx/apps/matriculas
```

### 2.1 Si cambió TODO (backend + frontend) — el caso general
```bash
cd /opt/bitnami/nginx/apps/matriculas
git pull origin main
cd backend && ./venv/bin/pip install -r requirements.txt && sudo systemctl restart matriculas-backend
cd ../frontend-matriculas && npm run build
```

### 2.2 Si SOLO cambió el backend (python)
```bash
cd /opt/bitnami/nginx/apps/matriculas
git pull origin main
cd backend && ./venv/bin/pip install -r requirements.txt
sudo systemctl restart matriculas-backend
```

### 2.3 Si SOLO cambió el frontend (react/vite)
```bash
cd /opt/bitnami/nginx/apps/matriculas
git pull origin main
cd frontend-matriculas && npm run build
```

> Nota: en el servidor el remote se llama **origin** (no `prod`).
> Tras el `npm run build` no hace falta recargar Nginx (sirve el `dist/` estático).
> En el navegador usa **Ctrl+F5** para saltarte el caché de Cloudflare.

### 2.4 Verificaciones útiles en el servidor
```bash
# ¿El backend está corriendo?
sudo systemctl status matriculas-backend --no-pager | head -6

# Logs recientes del backend (si algo falla):
sudo journalctl -u matriculas-backend --no-pager -n 30

# ¿Responde el backend localmente?
curl -s http://127.0.0.1:8000/ ; echo

# Validar config de Nginx antes de recargar (si tocas server blocks):
sudo /opt/bitnami/nginx/sbin/nginx -t
# Recargar Nginx:
sudo /opt/bitnami/ctlscript.sh restart nginx
```

---

## 3. Publicar cambios desde tu PC (local)

```bash
# Estando en c:\github\matricula
git add <archivos>
git commit -m "mensaje"
git push prod main
```
> En tu PC el remote de producción se llama **prod** (`diegocr305/matricula-prod`).
> `origin` en tu PC apunta al repo original de bastianaravenaSLEP (sin permiso de escritura).

---

## 4. Datos útiles del proyecto
- Supabase project_id: `gyhihuovussdauehmeuk` (schema `matriculas`).
- Servidor: Lightsail `54.86.236.154`, app en `/opt/bitnami/nginx/apps/matriculas`.
- Dominios: `matricula.slepvalparaiso.gob.cl` (principal), `rgm.slepvalparaiso.gob.cl` (redirect).
- Detalle técnico completo en `.kiro/steering/04-produccion-servidor.md` y `DESPLIEGUE.md`.
