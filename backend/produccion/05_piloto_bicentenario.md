# Paso a paso — Re-ejecutar el PILOTO Bicentenario Marítimo (RBD 1520) en producción

Objetivo: dejar el piloto de renovación 2027 **listo y limpio** para la prueba
oficial, después de limpiar las pruebas previas de 2027.

Colegio piloto: **RBD 1520 — Liceo Bicentenario Marítimo de Valparaíso**,
`id_establecimiento = 17`.

El script que genera la pre-matrícula 2027 YA existe y es idempotente:
`backend/apply_prematricula_2027.py` (DRY-RUN por defecto, `--apply` para aplicar).

---

## Qué hace el script `apply_prematricula_2027.py`
- Toma los alumnos **Activos 2026** del colegio 17.
- A cada uno que continúa le crea una matrícula **2027** con:
  `estado='Activa'`, `estado_firma='Pendiente'`, `estado_renovacion='Por renovar'`,
  curso **promovido** al nivel siguiente (misma letra; el colegio ajusta luego).
- Los de **4° medio** no reciben fila 2027: su matrícula 2026 se marca
  `estado_renovacion='Egresado'`.
- Es idempotente: no duplica si ya existe la 2027 del alumno; solo marca Egresado
  lo que falte.

Mapa de promoción actual (en el script, constante `PROMOCION`):
7°→8° básico · 8° básico→1° medio · 1°→2° medio · 2°→3° medio · 3°→4° medio ·
4° medio→Egresa. Cursos sin regla salen listados como alerta `[!]`.

---

## Secuencia recomendada (en el servidor de producción)

> Prerrequisitos: ya hiciste el RESPALDO (01_respaldo.py) y ya limpiaste 2027
> (04_limpiar_2027.py --apply). Idealmente en ventana de mantención.

1. **Verificar la columna de renovación** (idempotente, no daña si ya existe):
   ```
   cd backend
   ./venv/bin/python apply_renovacion_migration.py
   ```

2. **DRY-RUN de la pre-matrícula** (no escribe, solo muestra qué haría):
   ```
   ./venv/bin/python apply_prematricula_2027.py
   ```
   Revisa el reporte:
   - "A crear en 2027 (Por renovar)" ≈ alumnos que continúan.
   - "A marcar Egresado" ≈ 4° medios.
   - Si aparece `[!] Cursos SIN regla de promocion`, DETENTE y avísame: hay un
     curso 2026 que el mapa no sabe promover (ej. una especialidad T-P). Hay que
     agregar la regla antes de aplicar, o esos alumnos quedarán sin su 2027.

3. **Aplicar** (solo si el DRY-RUN se ve correcto):
   ```
   ./venv/bin/python apply_prematricula_2027.py --apply
   ```

4. **Verificar en la base** (debe cuadrar con el DRY-RUN):
   ```
   ./venv/bin/python produccion/02_diagnostico.py
   ```
   En la sección "Año 2027" deberías ver las matrículas recién creadas, todas en
   `estado_renovacion = Por renovar` y 0 firmas (aún nadie firmó).

5. **Prueba funcional end-to-end** (manual, con el colegio):
   - El funcionario entra, confirma una renovación → pasa a `Pendiente firma`.
   - El apoderado firma en SIMPLE con Clave Única → la Edge Function `sync-matricula`
     marca `estado_renovacion='Firmada'` (ver steering 05).
   - Verificar que el badge de estado y el bloqueo de emisión funcionan.

---

## Si algo sale mal
- El script corre en transacción por operación; si falla, revierte.
- Para volver a cero el 2027 y reintentar: `04_limpiar_2027.py --apply --confirmo-respaldo`
  y repetir desde el paso 2.
- Si el mapa de promoción no cubre un curso del piloto, editar la constante
  `PROMOCION` en `apply_prematricula_2027.py` agregando la regla
  `(cod_grado, cod_tipo_ensenanza): {...}` y re-correr el DRY-RUN.

---

## Pendiente conocido / verificado
- El `id_usuario_ejecutor = 9` está hardcodeado en el script (admin SLEP).
  VERIFICADO en la base actual: id 9 = `diego.cabrera@slepvalparaiso.cl` (rol SLEP),
  existe. Si en producción cambiara, actualizar la constante `ID_USUARIO_EJECUTOR`.
- OBSERVACIÓN: hay usuarios de PRUEBA en la tabla `usuario` que conviene limpiar
  antes de producción (no los usa el piloto, pero ensucian): id 1
  `director@slepvalparaiso.cl` (rol 'Director' atípico), id 2 `director@colegioprueba.cl`,
  id 3 `admin@slep.cl`, id 4 `director.valparaiso@colegioslep.cl`, id 5
  `visor.valparaiso@colegioslep.cl`, id 6 `visor.global@slep.cl`. NO borrar sin
  antes verificar que ninguna matrícula los referencia en `id_usuario_ejecutor`
  (FK sin cascada). Esto es una limpieza aparte, opcional, a decidir por el dueño.
