---
inclusion: manual
---

# Diagnóstico técnico del RGM (base para integrar SIGE) — oct 2026

Estado: DOCUMENTACIÓN. Es el inventario real del backend del RGM que exige la "Fase 0"
del plan de integración SIGE (steering 16). Lo escribí leyendo el código, no es teoría.
Sirve para que cualquier IA/dev que implemente la integración NO vuelva a explorar todo
y para que las decisiones de diseño encajen con lo que YA existe. Rutas y nombres son
reales (archivo + función). No incluye secretos.

> Hallazgo central: **el RGM YA ingiere nóminas SIGE**. El endpoint
> `POST /matriculas/carga-masiva` (`procesar_carga_masiva_db`) lee archivos `.xls`/HTML
> con `pandas.read_html` y escribe DIRECTO en `estudiante` y `matricula`. Por lo tanto la
> integración NO parte de cero: se trata de **evolucionar** esa carga directa a un flujo
> con `staging` + conciliación + aprobación (ver steering 16), reutilizando el parser que
> ya funciona. Esto es más barato y menos riesgoso que un módulo paralelo.

---

## 1. Stack y convenciones (lo que hay que respetar)

- **Backend**: FastAPI + `psycopg2` con **SQL crudo** (sin ORM). Carpeta `backend/`.
  - `database.py`: pool propio `DatabaseConnectionPool`; `get_db_connection()` devuelve un
    `PooledConnection` y en cada conexión hace `SET search_path TO matriculas, public`.
    También hay `get_db_cursor(commit=True)` como context manager. El pool se abre/cierra
    en el `lifespan` de `main.py`. **Regla**: todo código nuevo usa este pool, no abre
    conexiones sueltas (excepción ya existente: `cargar_asistencia.py` usa una conexión
    dedicada fuera del pool para cargas largas; es un patrón válido para ETL pesado).
  - Servicios en `backend/services/*.py`; routers en `backend/routers/*.py`; esquemas
    Pydantic en `backend/schemas.py`; auth/guards en `backend/security.py`.
- **Base de datos**: Supabase (PostgreSQL), schema aislado `matriculas` (el `public` es de
  otros sistemas del SLEP; NO tocar). Latencia ~140 ms/round-trip desde el server → las
  cargas masivas se hacen en memoria + `execute_values` por lotes, nunca query por fila.
- **Frontend**: React + Vite + TS en `frontend-matriculas/`. No es necesario para el MVP de
  ingestión, pero sí para las pantallas de conciliación (ver steering 16 §Pantallas).

## 2. Modelo de datos real (columnas confirmadas en SELECT/INSERT)

Relaciones (de los JOIN en `matricula_service.obtener_todas_matriculas_db`):

```
matricula m
  INNER JOIN estudiante e              ON m.id_estudiante = e.id_estudiante
  LEFT  JOIN apoderado a               ON e.id_apoderado_principal = a.id_apoderado
  LEFT  JOIN apoderado asup            ON e.id_apoderado_suplente  = asup.id_apoderado
  LEFT  JOIN catalogo_tipo_ensenanza cte ON m.cod_tipo_ensenanza = cte.codigo
  INNER JOIN establecimiento est       ON m.id_establecimiento = est.id_establecimiento
```

- **`estudiante`**: `id_estudiante` (PK), `run_ipe` (clave natural = RUN/IPE), `nombres`,
  `apellido_paterno`, `apellido_materno`, `fecha_nacimiento` (**NOT NULL** → bloquea crear
  alumnos nuevos sin fecha, es el cuello de botella de los 861; ver steering 11),
  `sexo`, `domicilio` (texto) + dirección estructurada `calle`/`numero`/`sector`/`comuna`,
  `latitud`/`longitud`, `id_apoderado_principal`, `id_apoderado_suplente`, `pais_origen`,
  `documento_extranjero`, `fecha_actualizacion` (TIMESTAMPTZ). `run_ipe` tiene `ON CONFLICT`
  (UNIQUE) y se normaliza con `upper(regexp_replace(run_ipe,'[.\-\s]','','g'))`.
- **`matricula`**: `id_matricula` (PK), `numero_correlativo` (folio por
  establecimiento+año+curso; se calcula `MAX+1` con `pg_advisory_xact_lock` para evitar
  carreras), `anio_escolar`, `id_estudiante`, `id_establecimiento`, `fecha_matricula`,
  `nivel_ensenanza`, `curso`, `estado`, `cod_tipo_ensenanza`, `cod_grado`, `letra_curso`,
  `id_usuario_ejecutor` (FK a `usuario` → trazabilidad de quién hizo el cambio),
  `es_excedente`/`numero_resolucion_excedente`/`fecha_resolucion_excedente`/`ruta_documento_resolucion`,
  `es_alumno_practica`, campos de firma (`opcion_religion`, `acepta_compromiso`,
  `autoriza_entrevista`, `autoriza_imagen`, `metodo_firma`, `estado_firma`),
  `observaciones`, `ruta_documento_traslado`, `motivo_retiro`, `fecha_retiro`,
  `motivo_cambio_curso`, `estado_renovacion`.
- **`apoderado`**: `id_apoderado` (PK), `rut_pasaporte` (UNIQUE, clave natural normalizada),
  nombres/apellidos, `domicilio`, `telefono`, `correo_electronico`, `pais_origen`,
  `documento_extranjero`, `relacion_estudiante`, `ruta_documento_tutor`. Un mismo apoderado
  se reutiliza por `rut_pasaporte` (no se duplica).
- **`establecimiento`**: `id_establecimiento` (PK), `rbd` (**varchar**, ej. '1520'),
  `nombre`, `tipo_local`, `slep_establecimiento_id` (FK a `public.slep_establecimientos`,
  donde el `rbd` es integer). **El RBD es la clave natural para cruzar con SIGE.**
- **`catalogo_tipo_ensenanza`**: `codigo` + `descripcion`. **`catalogo_grado`**: `codigo` +
  `descripcion`. Ambos están incoherentes (steering 11): el código los puebla "a la fuerza"
  con `ON CONFLICT (codigo) DO NOTHING` cuando llega un código SIGE nuevo.

### Estados de matrícula (hay TRES dimensiones distintas, no confundir)

| Columna | Para qué | Valores |
|---|---|---|
| `matricula.estado` | ciclo de vida real del alumno | `Activa`, `Anulada`, `Retirado`, `Pendiente Retiro`, `Pendiente Firma`, `Promovido`, `Repitente`, `Inactiva` |
| `matricula.estado_renovacion` | flujo piloto 2027 (lo gestiona el funcionario) | NULL (histórico), `Por renovar`, `Pendiente firma`, `Firmada`, `No renueva`, `Egresado` (CHECK `chk_estado_renovacion` en `apply_renovacion_migration.py`) |
| `matricula.estado_firma` | lo que ocurre en SIMPLE | `sin_firma`, `Pendiente`, `Firmada` |

- "Trasladado" NO es un valor de `estado`: se representa con `estado='Retirado'` +
  `motivo_retiro='Traslado...'` + nota en `observaciones`. La grilla lo detecta por
  `ILIKE '%Traslado%'`. **Importante para la conciliación SIGE**: un alumno con fecha de
  retiro en SIGE no debe borrarse, se marca inactivo/retirado conservando historial.

## 3. Importación/ETL que YA existe (reutilizable)

- **`POST /matriculas/carga-masiva`** → `routers/matriculas.py::carga_masiva_sige` →
  `services/matricula_service.py::procesar_carga_masiva_db` (línea ~1059). **ESTE es el
  punto de enganche de SIGE hoy**:
  - Recibe `List[UploadFile]`, guard `verificar_escritura` (restringir a SLEP/admin: ver §5).
  - Parser: `pandas.read_html(io.BytesIO(contenido), encoding='latin1')` con fallback utf-8
    (los `.xls` de SIGE son HTML por dentro, tal como anota tu documento).
  - Columnas del DataFrame que ya mapea: `RBD`, `Run`, `Dígito Ver.`, `Nombres`,
    `Apellido Paterno`, `Apellido Materno`, `Genero` (F/M → Femenino/Masculino),
    `Fecha Nacimiento`, `Dirección`, `Comuna Residencia`, `Año`,
    `Fecha Incorporación Curso`, `Fecha Retiro`/`Fec. Retiro`, `Cod Tipo Enseñanza`,
    `Cod Grado`, `Desc Grado`, `Letra Curso`.
  - Lógica actual: ordena para procesar retiros antes que activos; `UPSERT` estudiante por
    `run_ipe`; crea establecimiento si el RBD no existe ("Generado por SIGE"); inserta en
    catálogos faltantes; detecta cambio de curso/enseñanza → nuevo folio (traslado) o
    mantiene folio (mismo curso); crea matrícula nueva si no existía.
  - **Limitación (lo que la integración debe mejorar)**: escribe DIRECTO en producción, en
    la MISMA transacción, SIN staging, SIN dry-run por lote, SIN pantalla de diferencias y
    SIN registrar la corrida en una tabla de auditoría de importación. No guarda el archivo
    original ni su hash. No separa "fecha del dato" de "fecha de importación".
- **`importar_registro_2026.py`** (patrón de carga masiva eficiente, el mejor modelo a
  copiar para el motor nuevo): carga todo a memoria con 2 queries, procesa el Excel, escribe
  con `execute_values` en chunks de 1000 con commit entre chunks y `SET statement_timeout=0`.
  Reglas "no pisar dato bueno" (`COALESCE(NULLIF(...))`, `WHERE ... IS NULL`), idempotente.
  Matching por RUN normalizado. DRY-RUN por defecto, `--apply` para escribir.
- **`produccion/02_diagnostico.py`** (SOLO lectura): cruza Excel↔base por RUN y clasifica
  (en ambos / solo-excel / solo-base), exporta CSV. Es el embrión de un "motor de
  conciliación" offline. **`produccion/03_reconciliar_2026.py`**: UPSERT por fases
  (A: direcciones seguras; B: solo reporta los nuevos). Buen modelo de "fases + dry-run".

## 4. Migraciones: patrón `apply_*.py`

Todas en `backend/`, idempotentes (chequean `information_schema`/`pg_constraint` o usan
`IF NOT EXISTS`), DRY-RUN que imprime el DDL y `--apply` para ejecutar. Usan el pool.

| Script | Qué crea/altera |
|---|---|
| `apply_asistencia_migration.py` | tabla `asistencia_mensual` + llave única + índices |
| `apply_firma_migration.py` | tabla `firma_matricula` + columnas de firma |
| `apply_renovacion_migration.py` | columna+CHECK `estado_renovacion` + índice |
| `apply_storage_migration.py` | `ruta_documento_resolucion`, `ruta_documento_tutor`, `estudiante.fecha_actualizacion` |
| `apply_apoderado_domicilio_migration.py` | dirección estructurada del apoderado |
| `apply_indexes.py` | 5 índices de rendimiento (auditoría, matrícula, estudiante) |
| `apply_prematricula_2027.py` | pre-crea renovación 2027 (idempotente) |

**Regla del proyecto** (steering 01): cualquier columna/tabla nueva que el código asuma
DEBE quedar en un `apply_*.py` versionado, no aplicarse a mano en Supabase. Las migraciones
de integración SIGE seguirán este patrón (ver steering 16 §Migraciones), y deben ser
**aditivas** (ADD TABLE / ADD COLUMN), nunca destructivas sobre `estudiante`/`matricula`.

## 5. Auditoría y multi-tenant (lo que la integración debe honrar)

- **`auditoria_matricula`**: `id_auditoria` (PK), `id_matricula` (FK), `accion`
  (`INSERT`/`UPDATE`), `fecha_accion` (TIMESTAMPTZ), `id_usuario`, `datos_anteriores`
  (JSONB), `datos_nuevos` (JSONB). Se escribe de forma puntual (p. ej.
  `estudiante_service._registrar_auditoria_estudiante`), NO con triggers automáticos. Se
  lee en `reporte_service` vía `GET /reporte/auditoria-matriculas` (**solo SLEP**). La
  integración SIGE debería escribir aquí al APLICAR cambios aprobados (quién, qué, antes/después).
- **Multi-tenant** (`security.py`):
  - `es_usuario_slep(usuario)` → rol ∈ `slep/admin_slep/admin/visualizador_slep`.
  - `validar_acceso_colegio(id_est, usuario)` → para no-SLEP FUERZA su `id_establecimiento`
    del JWT e ignora/bloquea (403) cualquier otro id. Para SLEP deja ver todo.
  - `verificar_escritura` → bloquea (403) a roles visualizador en escrituras.
  - El JWT lleva `id_usuario`, `rol`, `id_establecimiento` (lo setea `auth_service` en
    `login_tradicional_service`/`login_google_service`).
  - **Decisión para SIGE**: la carga/aprobación debe acotarse por RBD igual que el resto.
    Hoy `carga_masiva_sige` usa `verificar_escritura` (cualquier escritor), pero la lógica
    toma el RBD del archivo; para producción conviene restringir el import real a SLEP/admin
    o validar que el RBD del archivo coincida con el establecimiento del usuario colegio.

## 6. Asistencia (ya resuelto, modelo a imitar para "dato con fecha")

- Tabla `matriculas.asistencia_mensual` (DDL en `apply_asistencia_migration.py`): grano
  **1 fila por alumno/mes/establecimiento**; llave única
  `(id_estudiante, anio_academico, mes_codigo, id_establecimiento)` para UPSERT idempotente;
  `segmento` CHECK `('escolar','vtf','excluido')`; `fecha_carga` TIMESTAMPTZ.
- Carga: `cargar_asistencia.py` (DRY-RUN por defecto; `--apply` → `DELETE` del año +
  re-`INSERT` con `execute_values` en lotes de 5000, conexión dedicada). Enlaza por RUN y RBD.
- Servicio/endpoint: `asistencia_service.py` + `routers/asistencia.py` (`/asistencia/resumen`,
  `/asistencia/anios`) entregan SOLO agregados (sin nombres/RUT), filtran `segmento='escolar'`,
  rol Colegio acotado a su establecimiento. **Este patrón (reemplazo por período + fecha de
  carga explícita) es exactamente el que la asistencia histórica de SIGE debe seguir.**

## 7. Resumen de "qué reutilizar" para la integración SIGE

1. **Parser de nómina**: `read_html` latin1 ya probado en `procesar_carga_masiva_db`.
2. **Carga eficiente**: patrón memoria + `execute_values` por chunks de `importar_registro_2026.py`.
3. **Conciliación offline**: lógica de cruce por RUN de `produccion/02_diagnostico.py` y las
   fases con dry-run de `03_reconciliar_2026.py`.
4. **Dato con fecha / reemplazo por período**: `asistencia_mensual` + `cargar_asistencia.py`.
5. **Migraciones aditivas idempotentes**: patrón `apply_*.py`.
6. **Multi-tenant y auditoría**: `security.py` + `auditoria_matricula` + `id_usuario_ejecutor`.
7. **Clave de cruce de colegio**: `establecimiento.rbd` (varchar) ↔ RBD del archivo SIGE.
