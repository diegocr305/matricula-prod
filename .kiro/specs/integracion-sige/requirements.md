# Requisitos — Módulo Integración SIGE (RGM SLEP Valparaíso)

> **Estado:** aprobado el alcance (módulo integrado al RGM existente, sin SQLAlchemy/Docker,
> staging con prefijo `sige_`). **No** se ejecutan migraciones hasta aprobación de la Fase 1.
> La implementación la realizará otra IA; este documento es el contrato funcional.

## Introducción

El Registro General de Matrícula (RGM) del SLEP Valparaíso necesita un módulo administrativo
llamado **Integración SIGE** para alimentar, validar y conciliar la matrícula del RGM a partir
de archivos exportados oficialmente desde SIGE (Mineduc). La primera versión cubre
**exclusivamente matrícula**; asistencia queda preparada (contratos y `tipo_fuente`) pero se
implementa en una etapa posterior.

El módulo se construye **dentro del backend FastAPI + psycopg2 existente**, en el schema
`matriculas` de Supabase, reutilizando autenticación JWT, roles (SLEP/Colegio), aislamiento por
`id_establecimiento` y el patrón de servicios/routers/migraciones idempotentes ya vigentes.

Este documento complementa (no reemplaza) el documento maestro
`csv pruebas/libro-digital/Documentacion_Integracion_SIGE_RGM_SLEP.md`. Donde el maestro usa
nombres genéricos (`integration_*`), aquí se fija la nomenclatura definitiva **`sige_*`** acordada
con el dueño.

### Glosario breve
- **RGM**: tablas productivas del schema `matriculas` (`estudiante`, `matricula`, etc.).
- **Staging**: tablas `sige_*` que guardan lo importado SIN tocar producción.
- **Conciliación**: comparación staging ↔ RGM que clasifica cada registro.
- **Aplicación**: escritura transaccional y auditada de los cambios aprobados al RGM.
- **CEDS/NDS**: estándar de datos de referencia (archivo `LibroDeClasesDigital_v02.svg` y
  Excels CEDS). Es **norte de calidad**, no el esquema a implementar ahora.

---

## Requisitos

### Requisito 1 — Carga de archivos SIGE a staging

**Historia:** Como analista UATP del SLEP, quiero cargar un archivo de nómina SIGE
(XLS-HTML, XML, TXT o CSV) para que sus registros queden en staging sin afectar la matrícula
productiva.

#### Criterios de aceptación
1. CUANDO el usuario envía un archivo a `POST /sige/importaciones` ENTONCES el sistema DEBE
   detectar el formato real (XLS-que-es-HTML vía `read_html`, XML, TXT delimitado, CSV `;`) y
   parsearlo con el adaptador correspondiente.
2. CUANDO el archivo es un `.xls` que internamente es una tabla HTML ENTONCES el sistema DEBE
   procesarlo con `pandas.read_html` (encoding `latin1` con fallback `utf-8`), igual que el
   importador legacy existente.
3. CUANDO se carga un archivo ENTONCES el sistema DEBE crear una fila en `sige_importacion` con
   `rbd`, `id_establecimiento`, `anio`, `origen_archivo`, `tipo_fuente`, `nombre_archivo`,
   `hash_archivo`, `id_usuario`, `fecha_importacion` y `estado='CARGADA'`.
4. CUANDO el parseo termina ENTONCES cada fila del archivo DEBE quedar en
   `sige_matricula_staging` con sus valores crudos (`datos_json`) y normalizados.
5. SI el archivo no se puede parsear con ningún adaptador ENTONCES el sistema DEBE responder un
   error legible indicando el formato esperado, SIN crear filas de staging huérfanas.
6. EN TODO MOMENTO la carga NO DEBE escribir ni modificar ninguna tabla productiva del RGM.

### Requisito 2 — Idempotencia de importaciones

**Historia:** Como analista, quiero que reimportar el mismo archivo no duplique datos.

#### Criterios de aceptación
1. CUANDO se carga un archivo ENTONCES el sistema DEBE calcular `hash_archivo`
   (SHA-256 del contenido binario).
2. SI ya existe una `sige_importacion` con el mismo `hash_archivo` en estado distinto de
   `RECHAZADA` ENTONCES el sistema DEBE rechazar la carga indicando la importación previa (id y
   fecha), SIN crear filas nuevas.
3. CUANDO una importación fue `RECHAZADA` ENTONCES el sistema PUEDE permitir recargar el mismo
   hash como una importación nueva.

### Requisito 3 — Validación de datos

**Historia:** Como analista, quiero que el sistema valide cada fila para separar lo aceptable de
lo que requiere revisión.

#### Criterios de aceptación
1. CUANDO se valida una fila ENTONCES el sistema DEBE verificar presencia de campos obligatorios:
   RUN del estudiante, RBD, año y curso/grado.
2. CUANDO valida el RUN ENTONCES el sistema DEBE normalizarlo (sin puntos ni guion, dígito
   verificador) reutilizando `services/utils.normalizar_rut` y verificar dígito verificador.
3. CUANDO valida el RBD ENTONCES el sistema DEBE confirmar que exista en `establecimiento` o
   marcarlo para revisión (no crear establecimientos automáticamente en la validación).
4. CUANDO valida códigos de enseñanza ENTONCES el sistema DEBE aceptar como conocidos
   `110` (Básica) y `310` (Media HC) y marcar los demás como "revisar código" sin descartarlos.
5. CUANDO valida fechas (incorporación, retiro) ENTONCES el sistema DEBE rechazar fechas
   inexistentes (p. ej. día 31 en un mes de 30) y fechas centinela como `1900-*`.
6. SI una fila falla una validación ENTONCES el sistema DEBE registrar el motivo en
   `motivos_validacion` (JSONB) de la fila y una entrada en `sige_error_importacion`, marcando
   `valido=false`.
7. CUANDO termina la validación ENTONCES `sige_importacion` DEBE actualizar `total_filas`,
   `filas_ok`, `filas_error` y pasar a estado `VALIDADA`.

### Requisito 4 — Conciliación staging ↔ RGM

**Historia:** Como analista, quiero ver cómo difiere la nómina SIGE respecto de la matrícula del
RGM antes de aplicar ningún cambio.

#### Criterios de aceptación
1. CUANDO se concilia una importación `VALIDADA` ENTONCES el sistema DEBE comparar cada fila
   válida de staging contra el RGM usando la **triple clave** `(id_estudiante,
   id_establecimiento, anio_escolar)` — NUNCA el RUN como clave única histórica.
2. CUANDO el estudiante no existe en el RGM (por `run_ipe` normalizado) ENTONCES la fila DEBE
   clasificarse como `NUEVO`.
3. CUANDO existe matrícula con misma triple clave y mismo curso/plan ENTONCES DEBE clasificarse
   como `COINCIDENTE`.
4. CUANDO existe matrícula con misma triple clave pero distinto curso/plan ENTONCES DEBE
   clasificarse como `CAMBIO_CURSO`.
5. CUANDO la fila SIGE trae fecha de retiro válida y el RGM la tiene activa ENTONCES DEBE
   clasificarse como `RETIRO`.
6. CUANDO hay ambigüedad de identidad (RUN que mapea a más de un estudiante, o datos
   inconsistentes) ENTONCES DEBE clasificarse como `CONFLICTO`.
7. SI falta un dato bloqueante para crear/actualizar (p. ej. `fecha_nacimiento` para un `NUEVO`,
   que es NOT NULL en `estudiante`) ENTONCES DEBE clasificarse como `REVISAR` y NO como error
   fatal.
8. CUANDO termina la conciliación ENTONCES cada diferencia DEBE quedar en `sige_conciliacion`
   con `clasificacion`, `id_matricula_rgm` (si aplica), `diferencias_json` (antes/después) y
   `estado_aprobacion='PENDIENTE'`; la importación pasa a `CONCILIADA`.
9. EN TODO MOMENTO la conciliación NO DEBE modificar ninguna tabla productiva del RGM.

### Requisito 5 — Vista previa de diferencias

**Historia:** Como analista, quiero una vista previa de las diferencias propuestas por
clasificación.

#### Criterios de aceptación
1. CUANDO el usuario consulta `GET /sige/importaciones/{id}/preview` ENTONCES el sistema DEBE
   devolver el conteo por clasificación y el detalle paginado de `sige_conciliacion`.
2. CUANDO el usuario filtra por clasificación o curso ENTONCES el sistema DEBE respetar el
   filtro.
3. CUANDO el detalle incluye datos personales de menores ENTONCES el sistema DEBE entregarlos
   solo a usuarios autorizados por rol/RBD (ver Requisito 8).

### Requisito 6 — Aprobación individual o por lote

**Historia:** Como responsable UATP/administrativo, quiero aprobar o rechazar las acciones
propuestas, individualmente o por lote.

#### Criterios de aceptación
1. CUANDO el usuario aprueba/rechaza una fila de `sige_conciliacion` ENTONCES el sistema DEBE
   actualizar `estado_aprobacion`, `id_usuario_aprueba` y `fecha_aprobacion`.
2. CUANDO el usuario aprueba por lote con filtros ENTONCES el sistema DEBE aplicar la decisión a
   todas las filas que cumplan el filtro y estén en `PENDIENTE`.
3. SI el usuario es de rol Colegio ENTONCES solo PUEDE aprobar filas de su propio
   `id_establecimiento`.
4. CUANDO una fila está en `CONFLICTO` ENTONCES el sistema NO DEBE permitir aprobación "ciega"
   por lote; requiere resolución explícita.

### Requisito 7 — Aplicación transaccional y auditable

**Historia:** Como responsable, quiero que los cambios aprobados se incorporen al RGM de forma
transaccional, auditable y conservando el dato original.

#### Criterios de aceptación
1. CUANDO se aplican las filas `APROBADA` de una importación ENTONCES el sistema DEBE ejecutar
   los cambios en una transacción (commit al final; rollback ante cualquier error).
2. CUANDO aplica un `NUEVO` ENTONCES DEBE crear/actualizar `estudiante` por `run_ipe`
   (`ON CONFLICT (run_ipe)`, con COALESCE para no pisar datos buenos) y crear la `matricula`
   reutilizando la lógica de correlativo (`MAX+1` por establecimiento/año/curso) y jerarquía
   (`obtener_rango_curso`).
3. CUANDO aplica un `CAMBIO_CURSO` o `RETIRO` ENTONCES DEBE respetar las reglas del RGM
   (traslado, repitente/promovido, estados) sin inventar transiciones nuevas.
4. CUANDO aplica cualquier cambio ENTONCES DEBE escribir una fila en `auditoria_matricula`
   (`accion`, `id_usuario`, `datos_anteriores`, `datos_nuevos` en JSONB).
5. EN TODO MOMENTO el sistema NO DEBE eliminar registros existentes ni retirar automáticamente a
   un alumno solo por estar ausente de la nómina.
6. CUANDO termina la aplicación ENTONCES las filas aplicadas pasan a `estado_aprobacion='APLICADA'`
   y la importación a `estado='APLICADA'`; staging y conciliación se conservan para trazabilidad.

### Requisito 8 — Seguridad, roles y aislamiento por establecimiento

**Historia:** Como administrador, quiero que el módulo respete la autenticación, los roles y el
aislamiento por RBD existentes.

#### Criterios de aceptación
1. CUANDO un endpoint muta datos ENTONCES DEBE exigir `Depends(verificar_escritura)` (bloquea
   roles `visualizador_*`).
2. CUANDO opera un usuario de rol Colegio ENTONCES el sistema DEBE forzar su propio
   `id_establecimiento` vía `validar_acceso_colegio` y bloquear (403) cualquier intento sobre
   otro RBD.
3. CUANDO la carga/aplicación es de alcance multi-establecimiento ENTONCES DEBE restringirse a
   roles SLEP/admin (check explícito de rol, patrón de `carga-masiva`).
4. EN TODO MOMENTO no se DEBE escribir RUN, nombres ni documentos de menores en logs; los datos
   sensibles se referencian por id interno.

### Requisito 9 — Reporte de resultados y errores

**Historia:** Como analista, quiero un reporte de la importación con filas aceptadas, rechazadas
y motivos.

#### Criterios de aceptación
1. CUANDO el usuario consulta `GET /sige/importaciones/{id}/reporte` ENTONCES el sistema DEBE
   devolver totales (cargadas, válidas, con error, por clasificación, aplicadas) y la lista de
   errores por fila desde `sige_error_importacion`.
2. CUANDO existe desfase temporal del dato ENTONCES el reporte DEBE indicar `fecha_importacion`
   y, si está disponible, la fecha de corte de origen (sin afirmar "al día" si la fuente trae un
   período anterior).

### Requisito 10 — Preparación para asistencia (etapa 2)

**Historia:** Como arquitecto, quiero que el modelo no se tenga que rediseñar cuando se agregue
asistencia.

#### Criterios de aceptación
1. CUANDO se define `sige_importacion.tipo_fuente` ENTONCES DEBE admitir ya los valores
   `NOMINA_XLS_HTML`, `NOMINA_XML`, `NOMINA_TXT`, `NOMINA_CSV`, `ASISTENCIA_CSV_INDIVIDUAL`,
   `ASISTENCIA_CSV_RESUMEN`, aunque solo los de nómina se implementen ahora.
2. CUANDO se diseñen las tablas de asistencia (etapa 2) ENTONCES DEBEN separar estado individual
   (`PRESENTE/AUSENTE/NO_TRABAJADO/NO_MATRICULADO/SIN_REGISTRO/DESCONOCIDO`) de los agregados por
   curso, y NO tratar `NO_TRABAJADO`/`NO_MATRICULADO` como `AUSENTE`.

### Requisito 11 — Alineación con estándar CEDS/NDS (calidad de datos, referencia)

**Historia:** Como arquitecto, quiero que el módulo deje trazado el mapeo hacia el estándar para
el futuro libro digital, sin reescribir el RGM ahora.

#### Criterios de aceptación
1. CUANDO se documenta el modelo ENTONCES DEBE existir un mapeo entre entidades RGM
   (`estudiante`, `matricula`, `establecimiento`, `apoderado`) y entidades CEDS/NDS
   (`Person`, `K12StudentEnrollment`, `Organization/K12School`, `PersonRelationship`,
   `OrganizationPersonRole`), indicando campos equivalentes y brechas (ver `mapeo-ceds-nds.md`).
2. EN TODO MOMENTO la implementación actual NO DEBE adoptar el esquema T-SQL de CEDS; se usa solo
   como referencia de calidad y para preparar interoperabilidad futura.

### Requisito 11bis — Funciones de verificación del libro de clases (reglas de calidad)

**Historia:** Como analista de calidad, quiero que la validación/conciliación de matrícula se
alinee con las funciones de verificación oficiales aplicables, para que el dato quede apto para el
futuro libro digital.

> Fuente: `csv pruebas/libro-digital/Descripción de Funciones de Verificación - Hoja 1.csv`
> (99 funciones) y `Funciones de Verificación - Diccionario de datos - Diccionario.csv` (mapeo
> tabla/columna CEDS por función). Las aplicables a este MVP son las de **matrícula** y
> **salidas/retiro**.

#### Criterios de aceptación
1. CUANDO se valida contenido mínimo (análogo a **fn2EA**, "los alumnos tienen todos sus datos
   obligatorios") ENTONCES el sistema DEBE verificar los obligatorios del Requisito 3.
2. CUANDO se concilia estructura (análogo a **fn2FA**, "matriculados − bajas = inscritos")
   ENTONCES el reporte DEBE exponer totales que permitan ese cuadre por RBD/curso.
3. CUANDO una alta/baja requiere documento (análogo a **fn2DA/fn2CA/fn2CB**, documento de
   ingreso/retiro, declaración jurada o verificador de identidad) ENTONCES el sistema DEBE
   permitir marcar la fila como `REVISAR` si el documento no está presente, SIN bloquear la
   importación.
4. CUANDO se trata un retiro (análogo a **fn0FA/fn0FB**, persona autorizada + documento o
   verificador de identidad) ENTONCES la conciliación DEBE señalar la ausencia de esos datos como
   observación de calidad, no como error fatal.
5. EN TODO MOMENTO estas funciones son **referencia de calidad**: su incumplimiento genera
   observaciones (`motivos_validacion`), no impide la trazabilidad en staging.

### Requisito 12 — Validación de firma OTP Mineduc (futuro, documentado)

**Historia:** Como arquitecto, quiero dejar especificada la validación de firma del libro digital
contra la API OTP de Mineduc, para cuando exista convenio.

#### Criterios de aceptación
1. CUANDO se documente la validación de firma ENTONCES DEBE describir los modos **transaccional**
   (`GET /otp/verify-otp?rut=&otp=&DateWithTimeZone=`) y **masivo**
   (`POST /otp/verify-otp` con lista `{RUT, OTP, TIMESTAMP}`), y el uso de la clave pública RSA
   provista (ver `validacion-otp-mineduc.md`).
2. EN TODO MOMENTO esta validación NO forma parte del MVP de matrícula; se implementa solo con
   convenio y credenciales institucionales, y NO se versiona ningún secreto.

---

## Fuera de alcance (esta versión)
- Implementación de asistencia (individual o agregada).
- Adopción del esquema CEDS/NDS completo.
- Conector de API oficial Mineduc (`SigeOfficialApiConnector`) y validación OTP en línea.
- Scraping, automatización de sesiones SIGE o reutilización de cookies.
- Cualquier escritura automática a producción sin aprobación humana.
