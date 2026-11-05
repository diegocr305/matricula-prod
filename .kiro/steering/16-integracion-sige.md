---
inclusion: manual
---

# Integración SIGE → RGM — diseño del módulo (NO es implementación)

Estado: DISEÑO / DOCUMENTACIÓN. No hay código escrito para esto todavía. Este documento
define arquitectura, modelo de datos, reglas y roadmap para incorporar al RGM un módulo de
**ingestión y conciliación con SIGE**. Lee primero el steering 15 (diagnóstico real del RGM).

Principio rector: **evolucionar lo que ya existe**, no construir una app paralela. El RGM ya
ingiere nóminas SIGE por `POST /matriculas/carga-masiva` (`procesar_carga_masiva_db`), pero
escribe directo en producción. El trabajo es intercalar entre el parser y la escritura una
capa de **staging → conciliación → aprobación → aplicación**, reutilizando el stack actual
(FastAPI + psycopg2 + schema `matriculas`). Prohibido: módulo con otro backend/base, ORM
nuevo, o reescribir el dominio del RGM.

## 0. Alcance y prioridades

1. **(P1) Matrícula vigente**: cargar nóminas por RBD, compararlas con el RGM, detectar
   altas/retiros/cambios de curso/traslados y conciliar para dejar un padrón 2026 limpio que
   habilite la renovación 2027.
2. **(P2) Asistencia histórica**: cargar meses disponibles mostrando el desfase (ya existe
   la base en `asistencia_mensual`; aquí se formaliza como fuente SIGE con metadatos de fecha).
3. **(P3) Interoperabilidad oficial**: cuando Mineduc habilite servicios, reemplazar la carga
   de archivos por un conector oficial que use la MISMA canalización. No asumir que habrá
   asistencia diaria hasta confirmarlo.

Fuera de alcance inicial: libro de clases, notas, cálculo automático de vacantes (los cupos
los valida UATP aparte), decisiones automáticas de continuidad/SAE/retiros.

Reglas duras (MVP): nada de reutilizar `JSESSIONID`/cookies, ni scraping desatendido no
autorizado del portal SIGE. El origen de datos en el MVP son **exportaciones oficiales**
hechas por personas autorizadas y subidas al RGM.

## 1. Arquitectura lógica (dos conectores, una canalización)

```
 Exportaciones oficiales SIGE          API SIGE institucional (futuro)
   .xls(HTML)/XML/TXT/CSV                     convenio Mineduc
            |                                       |
   SigeFileConnector  (hoy)              SigeOfficialConnector (futuro)
            +-------------------+-------------------+
                                |
                        Ingestión (guarda archivo + hash + metadatos de corrida)
                                |
                        Parser (read_html latin1 ya probado / XML / TXT)
                                |
                        STAGING por corrida (NO escribe en matricula/estudiante)
                                |
                        Normalización canónica (RUN, RBD, curso, estado)
                                |
                        Motor de conciliación SIGE <-> RGM (dry-run, por RBD)
                                |
                        Cola de diferencias + revisión/aprobación (UATP/SLEP)
                                |
                        Aplicación transaccional de lo aprobado (+ auditoria_matricula)
                                |
                        Dominio existente del RGM (estudiante / matricula)
```

El conector es un detalle intercambiable: ambos producen el MISMO "lote de registros
normalizados" que entra a staging. Cambiar de archivo a API no debe tocar la conciliación.

## 2. Modelo de datos propuesto (tablas NUEVAS en schema `matriculas`)

Todas aditivas, con su `apply_*.py` idempotente (ver §7). No tocan `estudiante`/`matricula`.
Grano y llaves pensados para UPSERT idempotente, igual que `asistencia_mensual`.

- **`integracion_corrida`** (una fila por importación):
  `id_corrida` PK, `fuente` (`SIGE_FILE`|`SIGE_API`), `tipo_dato` (`matricula`|`asistencia`),
  `rbd`, `anio`, `periodo_referencia` (texto, ej. '2026-09'), `fecha_extraccion_origen`,
  `fecha_importacion` (default now), `archivo_nombre`, `archivo_hash` (sha256 para
  idempotencia), `id_usuario` (quién subió), `estado`
  (`cargada`|`conciliada`|`aprobada`|`aplicada`|`rechazada`), `metricas` JSONB
  (filas leídas/válidas/rechazadas), `version_parser`.
- **`integracion_staging_matricula`** (registros crudos normalizados, NO productivos):
  `id` PK, `id_corrida` FK, `rbd`, `run_norm`, `nombres`, `apellidos`, `cod_ensenanza`,
  `cod_grado`, `letra_curso`, `curso_texto`, `anio`, `fecha_incorporacion`, `fecha_retiro`,
  `estado_sige`, `id_estudiante_rgm` (resuelto si matchea), `id_matricula_rgm` (si existe),
  `payload` JSONB (fila original minimizada), `incidencias` JSONB.
- **`integracion_staging_asistencia`** (si se formaliza asistencia por este flujo):
  mismas columnas de grano que `asistencia_mensual` + `id_corrida`. Alternativa: seguir
  cargando con `cargar_asistencia.py` y solo registrar la corrida en `integracion_corrida`.
- **`integracion_diferencia`** (resultado de la conciliación, lo que revisa UATP):
  `id` PK, `id_corrida` FK, `rbd`, `run_norm`, `id_matricula_rgm` (nullable),
  `clasificacion` (ver §4), `severidad`, `detalle` JSONB (valor SIGE vs valor RGM),
  `propuesta` JSONB (cambio sugerido), `estado` (`pendiente`|`aprobada`|`rechazada`),
  `id_usuario_resolucion`, `fecha_resolucion`.

Reutilizar lo existente: `establecimiento` (por `rbd`), `catalogo_grado`,
`catalogo_tipo_ensenanza`, `auditoria_matricula` (escribir al aplicar), `id_usuario_ejecutor`.

### Claves de comparación
- Colegio: `rbd` (varchar) contra `establecimiento.rbd` (NO crear colegios "fantasma" en
  silencio como hace hoy la carga: si el RBD no está, marcar incidencia para revisión).
- Curso: `rbd + anio + cod_ensenanza + cod_grado + letra_curso`.
- Alumno: `run_ipe` normalizado (`upper(regexp_replace(...,'[.\-\s]','','g'))`).
- Matrícula histórica: por evento + fechas; **nunca** `UNIQUE(run)` global (un alumno tiene
  varias matrículas a lo largo de los años).

## 3. Las cuatro fechas (no confundir "fecha del dato" con "fecha de carga")

Guardar siempre, como ya se hace en asistencia:
- `periodo_referencia`: a qué año/mes escolar corresponde el hecho.
- `fecha_efectiva`: ingreso/retiro/traslado real.
- `fecha_extraccion_origen`: cuándo se bajó/consultó SIGE.
- `fecha_importacion`: cuándo entró al RGM.

Toda vista debe exponer "último período disponible" y su antigüedad. Ejemplo correcto:
"Asistencia septiembre 2026, importada el 13-10-2026". **No** mostrar "al día" si la fuente
trae el mes anterior. Un período atrasado no es incumplimiento ni ausencia de información.

## 4. Conciliación: clasificaciones y reglas

Clasificaciones (`integracion_diferencia.clasificacion`):
`SIN_CAMBIO`, `NUEVO_EN_SIGE`, `SOLO_EN_RGM`, `CAMBIO_CURSO`, `RETIRO_SIGE`,
`FECHA_DISTINTA`, `DUPLICIDAD`, `IDENTIDAD_INCIERTA`, `CONFLICTO_REGLA`, `REQUIERE_REVISION`.

Reglas obligatorias (muchas ya existen como lógica suelta en `procesar_carga_masiva_db` y
deben trasladarse al motor con dry-run):
- **Dry-run por lote** antes de escribir; la escritura real ocurre solo tras aprobación.
- **No borrar** alumnos/matrículas por ausencia en una nómina (puede ser parcial). Un retiro
  SIGE se refleja como `estado='Retirado'`/`Inactiva` + fecha, conservando historial.
- **No sobrescribir** un dato más reciente del RGM con una extracción antigua sin aprobación.
- Idempotencia por `archivo_hash` + llave de grano: re-subir el mismo archivo no duplica.
- Respetar la lógica de promoción/repitencia/traslado ya codificada
  (`obtener_rango_curso`, estados `Promovido`/`Repitente`, folios por curso). La transición
  8° básico → 1° medio es promoción (ver steering 13); no romperla.
- RBD del archivo debe pertenecer al alcance autorizado del usuario (multi-tenant, §6).
- Vacantes/cupos NO se calculan desde la nómina: fuente UATP (capacidades DCV).

Asistencia: agregados y detalle individual son datasets distintos; comparar totales solo
cuando ambas fuentes existen y las definiciones coinciden.

## 5. Endpoints propuestos (evolución, no reemplazo)

Mantener el router `/matriculas` y agregar un router `/integracion` (nuevo
`routers/integracion.py` + `services/integracion_service.py`), para no mezclar la ingestión
con la gestión de matrícula. Verbos sugeridos:

- `POST /integracion/cargar` — sube archivo(s) SIGE, los guarda con hash, crea
  `integracion_corrida`, parsea a `integracion_staging_matricula`. NO escribe en matrícula.
- `POST /integracion/{id_corrida}/conciliar` — corre el motor dry-run y llena
  `integracion_diferencia`. Devuelve resumen por clasificación.
- `GET  /integracion/{id_corrida}/diferencias` — lista paginada para la pantalla de revisión.
- `POST /integracion/{id_corrida}/aprobar` — marca diferencias aprobadas (por rol).
- `POST /integracion/{id_corrida}/aplicar` — aplica SOLO lo aprobado en transacción,
  escribe en `estudiante`/`matricula` y en `auditoria_matricula`. Idempotente.
- `GET  /integracion/cobertura` — tablero por RBD (último período, antigüedad, pendientes).

Transición del endpoint actual: `POST /matriculas/carga-masiva` queda como "modo legacy /
directo" o se re-apunta internamente a `cargar` + `conciliar` + `aplicar` con auto-aprobación
solo para SLEP en entorno controlado. Decidir con el dueño; no romper lo que funciona hoy.

## 6. Seguridad y datos de menores

- Reutilizar `security.py`: `validar_acceso_colegio` acota por RBD; `verificar_escritura`
  bloquea visualizadores; el import real conviene restringirlo a SLEP/admin o validar que el
  RBD del archivo coincida con el establecimiento del usuario.
- Datos de menores (RUN, nombres, PIE/SEP): minimizar, cifrar en reposo/tránsito, acceso por
  rol/RBD, auditar. **Nunca** poner RUN/nombres/credenciales en logs, tickets, GitHub ni en
  prompts a IA externas. Tests con datos sintéticos.
- Guardar `archivo_hash` y actor por corrida. Antes de cargar datos reales, confirmar
  autorización/finalidad/base legal con los responsables institucionales.

## 7. Migraciones (patrón del proyecto, SIN ejecutar aún)

Crear `apply_integracion_migration.py` siguiendo el patrón de `apply_asistencia_migration.py`:
idempotente, DRY-RUN por defecto, `--apply` para crear, usa el pool, DDL con `IF NOT EXISTS`
y CHECKs para los enums (`fuente`, `tipo_dato`, `estado`, `clasificacion`). Solo crea las
tablas `integracion_*`; **no** altera `estudiante`/`matricula`. Correr en el deploy que
introduzca el módulo (steering 04 §redeploy).

## 8. Roadmap por fases (con criterio de salida)

- **Fase 0 — Diagnóstico**: ya hecho → steering 15. Criterio: diseño aprobado por el dueño,
  cero migraciones ejecutadas.
- **Fase 1 — Staging + parser**: tablas `integracion_corrida`/`_staging_matricula`,
  endpoint `cargar`, reutilizar `read_html`. Criterio: subir una nómina de prueba, ver
  staging poblado y métricas, SIN tocar matrícula productiva.
- **Fase 2 — Conciliación**: motor + `integracion_diferencia` + `GET /diferencias`.
  Criterio: tests de alta/continuidad/cambio-curso/retiro/no-encontrado/identidad-ambigua.
- **Fase 3 — Aprobación y aplicación**: `aprobar`/`aplicar` transaccional + auditoría +
  idempotencia + reversión. Criterio: piloto RBD 1520 sin afectar otro RBD, validado por UATP.
- **Fase 4 — Asistencia histórica**: formalizar la carga por este flujo (o registrar la
  corrida de `cargar_asistencia.py`), mostrar período/desfase. Criterio: cobertura visible
  sin confundir mes atrasado con dato diario.
- **Fase 5 — Cobertura multi-RBD**: tablero + responsables por colegio. Criterio:
  procedimiento estable con exportación y autorización por RBD.
- **Fase 6 — Interoperabilidad (CONDICIONADA)**: `SigeOfficialConnector` solo con convenio,
  API documentada, credenciales institucionales y ambiente de pruebas. Criterio: equivalencia
  archivo↔API sin regresiones. Actualización diaria solo si el servicio la ofrece.

## 9. Pruebas de SIGE pendientes (no bloquean el desarrollo)

1. Esquema real de nómina XML/TXT/XLS de un RBD autorizado (solo encabezados/tipos y totales,
   sin PII) y cómo marca a los retirados.
2. Cómo refleja SIGE una corrección de un mes de asistencia ya cerrado (comparar dos cortes).
3. Un establecimiento con modalidad distinta a básica/media HC (parvularia/especial/adultos).
4. Conciliar asistencia agregada vs individual del mismo RBD/curso/mes.
5. Pedir formalmente a Mineduc la documentación de APIs, alcance por RBD, frecuencia y cierre.

## 10. Criterios de aceptación del módulo

- [ ] Reutiliza FastAPI + psycopg2 + schema `matriculas`; sin backend/base paralela.
- [ ] Cada corrida registra RBD, período, fuente, usuario, hash y fechas.
- [ ] Importar/previsualizar NO escribe en `estudiante`/`matricula`.
- [ ] Conciliación y aprobación obligatorias antes de aplicar.
- [ ] Historial preservado; nada se borra por omisión en una nómina.
- [ ] Archivo repetido (mismo hash) es idempotente.
- [ ] Asistencia individual y agregada tienen grano distinto y se concilian cuando aplica.
- [ ] La UI expone último período disponible y su desfase.
- [ ] Acceso por RBD/rol (reutiliza `security.py`) y escritura auditada en `auditoria_matricula`.
- [ ] Tests con datos sintéticos (pytest, steering 14).
- [ ] El conector API futuro es reemplazable sin rehacer el dominio ni la conciliación.

## 11. Prompt para la IA que implemente (resumen operativo)

> Lee los steering 15 (diagnóstico real) y 16 (este diseño). NO crees un backend ni base
> nueva. Implementa el módulo de integración DENTRO del RGM reutilizando el pool de
> `database.py`, el parser `read_html` de `procesar_carga_masiva_db`, el patrón de carga
> masiva de `importar_registro_2026.py`, el multi-tenant de `security.py` y la auditoría de
> `auditoria_matricula`. Entrega por fases (§8). Primero: migración aditiva `apply_integracion_
> migration.py` (SIN aplicar) + endpoint `POST /integracion/cargar` que deje los datos en
> `integracion_staging_matricula` sin tocar producción, con datos de prueba sintéticos. No
> ejecutes migraciones ni toques producción sin aprobación del dueño. La interoperabilidad
> diaria queda como capacidad futura condicionada a la documentación oficial de Mineduc.
