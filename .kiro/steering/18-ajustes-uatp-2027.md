# Ajustes post-revisión UATP — Admisión Escolar 2027

Estado: IMPLEMENTADO en local (sin commit, sin desplegar). Pendiente de revisión del dueño.
Pruebas: `python -m pytest -q` (108 OK) + `npm run build` OK.

## Qué se cambió
1. **Seguridad multi-tenant** (`matricula_service.py`): los 9 chequeos de rol usaban la
   lista exacta `["Colegio","Visualizador_Colegio"]` y dejaban sin restricción a
   `Matriculador`, `Director`, `COLEGIO` y roles desconocidos. Ahora usan
   `_es_usuario_acotado()` (todo rol no-SLEP queda acotado a su colegio, vía `roles.py`), y la
   pertenencia es estricta (sin establecimiento asignado = 403).
   - `verificar_acceso_matricula_db()` reutilizable. Aplicado a `POST /documentos/emitir`
     (ahora además exige rol de escritura) y `GET /documentos/comprobante/{rut}`.
   - `id_usuario_ejecutor` en `POST/PUT /matriculas` se toma SIEMPRE del JWT, nunca del cliente.
2. **Parentesco**: catálogo único `backend/parentescos.py` ↔ `frontend/src/config/parentescos.ts`
   (Madre, Padre, Abuelo/Abuela Paterno/a, Abuelo/Abuela Materno/a, Tutor Legal Designado, Otro).
   Componente `components/SelectParentesco.tsx` para titular y suplente en: wizard de crear
   estudiante, edición de ficha, ModalFaltantes y ConfirmarRenovacion.
   - Valores históricos fuera de catálogo se muestran tal cual (sin etiqueta extra, decisión del
     dueño) como una opción adicional del select, y se aceptan solo si
     son idénticos al ya guardado (misma regla en front y back). No se migran ni se sobrescriben.
   - El suplente NO exige documento adjunto. El documento sigue siendo solo del titular tutor.
3. **Nomenclatura**: "Matrículas" → "Admisión Escolar" en menú, tarjeta Home, título de página y
   "Volver a…". Rutas, API y tablas sin cambios. "Área de Matrícula": 0 apariciones. Steering 02:
   el rol `Colegio` es "director/a o directivo", no "Administrador".
4. **Domicilios** (`estudiante_service.py`): BUG corregido — el domicilio desglosado del
   apoderado/suplente que envía ConfirmarRenovacion se ignoraba y se pisaba con el del estudiante.
   Ahora se compone (`componer_domicilio`) y, si no viene, se conserva el ya guardado.
   `normalizar_numero_domicilio()` unifica "s/n", "sn", "sin número" → `S/N`. Validación servidor:
   domicilio estructurado del estudiante exige calle, número y comuna (422).
5. **Libro de Matrícula**: `GET /matriculas/libro?formato=pdf|xlsx` (+ establecimiento, año, curso,
   nivel, modalidad, incluir_pendientes). Columnas = Res. Exenta 0030/2021 punto 5.2
   (`services/libro_matricula_service.py`). Sin datos de salud, sin datos inventados, sin
   respuestas confidenciales de retiro; excluye `Anulada`; por defecto excluye pre-matrículas
   "Por renovar"/"Pendiente firma". PDF tope 15.000 filas (413 si excede).
   Frontend: botón "Libro de Matrícula" + `ModalLibroMatricula.tsx`.
6. **Auditoría de exportaciones**: tabla nueva `auditoria_exportacion`; se registra el libro y
   el Excel existente (`services/auditoria_exportacion_service.py`). Si la tabla no existe, la
   exportación NO se bloquea pero queda error en `journalctl`.
   Fix: evento `CAMBIO_CURSO` comparaba `id_curso` (columna inexistente); ahora compara `curso`.
7. **Correo del estudiante**: columnas `estudiante.correo_personal` / `correo_institucional`.
   Regla parametrizada `backend/reglas_estudiante.py` ↔ `frontend/src/config/reglasEstudiante.ts`:
   4° medio OBLIGATORIO, 3° medio OPCIONAL (para activarlo, cambiar el valor en ambos archivos).
   Formato validado siempre. Capturado en ConfirmarRenovacion, edición de ficha y ModalFaltantes.
8. **Continuidad**: `crear_nueva_matricula_db` ya no anula en silencio una pre-matrícula del mismo
   año/colegio en "Por renovar"/"Pendiente firma": responde 409 indicando usar "Confirmar renovación".

## ORDEN DE DESPLIEGUE (obligatorio: migraciones ANTES del restart)
```
cd /opt/bitnami/nginx/apps/matriculas
git pull origin main
cd backend
./venv/bin/python apply_correo_estudiante_migration.py            # DRY-RUN
./venv/bin/python apply_correo_estudiante_migration.py --apply
./venv/bin/python apply_auditoria_exportacion_migration.py        # DRY-RUN
./venv/bin/python apply_auditoria_exportacion_migration.py --apply
sudo systemctl restart matriculas-backend
sudo journalctl -u matriculas-backend -n 30
cd ../frontend-matriculas && npm ci && npm run build
```
El código es TOLERANTE al orden: si `apply_correo_estudiante_migration.py` aún no se aplicó,
la ficha abre y guarda igual, pero el correo no se muestra ni se exige (`_tiene_columnas_correo`
en estudiante_service.py; detecta la migración sin reiniciar). Aun así, correr las migraciones
primero para que el correo funcione. Ambas son aditivas (columnas NULL / tabla nueva).

## Pendientes / decisiones abiertas
- **Cupos y vacantes**: PENDIENTE por decisión del dueño (sin cambios de lógica).
- 3° medio: activar obligatoriedad del correo cuando se confirme.
- El Excel "completo" existente (4 hojas, incluye salud) sigue disponible para todo rol con
  acceso a Admisión Escolar; evaluar restringirlo.
- `verificar_acceso_estudiante_db` sigue sin restringir lectura/edición de fichas entre colegios
  (diseño original, para traslados). Requiere decisión: separar lectura para traslado de escritura.
- `/matriculas/{id}/cuestionario*` siguen públicos con id secuencial (requiere token opaco por correo).
- Token aceptado por `?token=` en la URL (queda en logs). Pendiente.
- Trigger de auditoría de `matricula` no está versionado en el schema `matriculas`; verificar en BD.
- La columna `apoderado.calle/numero/sector/comuna` existe por migración previa pero el backend
  solo guarda el domicilio compuesto en `apoderado.domicilio`.
