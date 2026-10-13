# Documento maestro: Integración SIGE → RGM
**SLEP Valparaíso | Versión 1.0 | 13 de octubre de 2026**

## 1. Objetivo y decisión arquitectónica

Incorporar al **Registro General de Matrícula (RGM) existente** un módulo de integración y conciliación con SIGE, sin crear otra aplicación ni duplicar sus entidades. **Prioridad 1: alimentar y depurar matrícula vigente 2026 para preparar RGM 2027. Prioridad 2: incorporar asistencia histórica, actualmente con rezago cercano a un mes según disponibilidad de SIGE. Prioridad 3: habilitar actualización diaria cuando exista interoperabilidad oficial autorizada y técnicamente disponible.**

Usar una arquitectura con dos conectores intercambiables:
- `SigeFileConnector` (MVP): archivos oficiales XLS, XML, TXT o CSV obtenidos por personas autorizadas.
- `SigeOfficialApiConnector` (futuro): integración mediante convenio, documentación y credenciales institucionales. **No asumir que la API futura incluirá asistencia diaria hasta confirmarlo con Mineduc.**

Ambos ingresan por la misma cadena: **ingestión → validación → staging → normalización → conciliación → aprobación → aplicación transaccional → RGM**.

No automatizar inicios de sesión, reutilizar JSESSIONID ni efectuar extracciones masivas no autorizadas. El encabezado CORS no transforma en públicos a los endpoints autenticados.

## 2. Evidencia empírica reunida en pruebas

| Funcionalidad | Ruta/mecanismo observado | Alcance y limitación |
|---|---|---|
| Matrícula curso | `POST /Sige/Matricula/DespliegaCurso` | HTML, datos por curso; no API pública comprobada |
| Exportación nóminas | `POST /Sige/Reportes/ExportarNomina` | Selección de año, enseñanza o **todo el establecimiento**; XML/TXT/Excel; algunos `.xls` son HTML |
| Asistencia individual | `POST /Sige/Sep/IngresoAsistenciaSep` | HTML con alumno × día. Piloto de 32 alumnos × 30 días = 960 registros |
| Asistencia agregada | `POST /Sige/Sep/ResumenAsistencia` | HTML y variables JS `Resumen`, `DT` para indicadores diarios por curso |
| Filtros dinámicos | JS `resumen_asistencia.js`: `accion=obtieneCursos`, `tipo_ens` | POST que devuelve XML de grados; **no** asistencia individual |
| Enseñanzas | 110 básica y 310 media HC en RBD probado | SIGE obliga a seleccionar separadamente; no son todos los códigos posibles |

En el RBD 1520 se identificaron en el ejemplo **3 cursos de básica y 18 de media**. Es un caso puntual, no inventario de todos los establecimientos SLEP. Para resumen, `orden=1` presentes, `2` ausentes, `3` matrícula, `4` % de asistencia; `dia1..dia31` representan valores diarios. El período de septiembre tiene 30 días; **no importar un día 31 como fecha válida**. Validar la fórmula del porcentaje oficial antes de utilizarla.

Asistencia individual identifica estados mediante nombre de archivo en `img.src`:
`presente_a.png → PRESENTE`, `ausente_a.png → AUSENTE`, `notrabajado_a.png → NO_TRABAJADO`, `retirado_a.png → NO_MATRICULADO`, `noingresado_a.png → SIN_REGISTRO`. No confiar en `alt`: puede indicar incorrectamente “no trabajado”.

El campo `%Asistenca` de la nómina SIGE **no fue confiable** en la prueba para representar asistencia real; no usarlo como fuente principal.

## 3. Barrido operacional por colegio/RBD

Diseñar cobertura para el conjunto de establecimientos autorizados del SLEP (referencia de planificación: 66), **no** un acceso automatizado indiscriminado.

1. Catálogo institucional de establecimientos y RBD activos, revisado con UATP.
2. Responsable y permisos de carga por RBD.
3. Calendario de cortes por establecimiento y fuente.
4. Importar nómina de todo el establecimiento mediante la exportación oficial disponible.
5. Validar RBD, año, enseñanza, grado, curso, fechas, estado, duplicados y formato.
6. Guardar lote en staging, **sin modificar inmediatamente los datos productivos**.
7. Comparar matrícula SIGE contra matrícula RGM; identificar diferencias por curso y estudiante.
8. Revisar y aprobar propuestas según rol UATP/administrativo.
9. Aplicar cambios aprobados con transacción y auditoría.
10. Mostrar cobertura: RBD, último período disponible, fecha de descarga, fecha de importación, registros, conflictos y responsable.

Para asistencia, cargar archivos de resumen de cada enseñanza por separado; unir por RBD, período y curso. Los datos individuales requieren extracción específica por curso o un servicio autorizado que los proporcione; los agregados **no sustituyen** registros individuales.

## 4. Separar temporalidad y oportunidad del dato

Guardar como mínimo:
- `periodo_referencia`: año/mes/día de matrícula o asistencia.
- `fecha_efectiva`: fecha real de ingreso, retiro o traslado.
- `fecha_extraccion_origen`: cuándo se consultó/descargó SIGE.
- `fecha_importacion`: cuándo se incorporó al módulo RGM.
- `fecha_cierre_origen` / `estado_declaracion` **solo si están disponibles y verificados**.

Ejemplo: “Asistencia septiembre 2026, importada 13-octubre-2026”. **No decir ‘asistencia al día’** si la fuente oficial trae el mes anterior. Cargas o correcciones posteriores deben generar versiones y preservar el histórico.

**Cadencia MVP propuesta:** matrícula semanal durante conciliación crítica (o según disponibilidad y responsables); asistencia después del cierre/disponibilidad de cada mes. Configurar SLAs por fuente, no inventar plazos de SIGE. **Cadencia futura:** consulta diaria únicamente si el convenio/API la permite; desacoplar tiempo de extracción y fecha escolar.

## 5. Arquitectura técnica propuesta

```text
Exportaciones oficiales SIGE       API SIGE institucional futura
          |                                       |
    SigeFileConnector                 SigeOfficialApiConnector
          +-------------------+-------------------+
                              |
                      Ingestion Service
                              |
              Parser XLS-HTML / XML / TXT / CSV
                              |
               STAGING con lote y procedencia
                              |
            Validadores + normalización canónica
                              |
                 Motor SIGE ↔ RGM (dry-run)
                              |
                Cola revisión / aprobación
                              |
            Aplicación transaccional autorizada
                              |
            Dominio y base existente del RGM
                              |
                  Reportes / RGM 2027 / BI
```

**Tecnologías:** reutilizar stack, ORM, DB, autenticación y frontend del RGM actual. No imponer FastAPI, otro PostgreSQL ni Supabase adicional si ya hay infraestructura equivalente. Usar puertos/adaptadores o separación por servicios para cambiar origen SIGE sin reescribir conciliación.

## 6. Modelo de datos a revisar y extender

**Inspeccionar primero tablas existentes:** establecimientos, estudiantes, apoderados, cursos, matrículas, movimientos y roles. No crear duplicados.

**Posibles nuevas tablas o equivalentes:**
- `integration_sources`: origen y canal.
- `integration_runs`: lote, RBD, período, origen, formato, hash, usuario, fechas, estado, métricas, versión parser.
- `integration_files`: referencia segura a original, MIME verdadero, checksum, política de retención.
- `integration_staging_enrollments`: registros brutos/minimizados y normalizados, sin escritura al RGM.
- `integration_staging_attendance_student`: alumno, curso, fecha, estado, lote, versión.
- `integration_staging_attendance_course`: curso, fecha, presentes, ausentes, matrícula, lote, versión.
- `integration_conflicts`: diferencias, propuesta, severidad, causa y resolución.
- `integration_approvals`: acción propuesta, aprobador, timestamp, resultado y reversión.
- `integration_field_mappings`: contrato de cada formato/versión.

**Identificadores:**
- Establecimiento: RBD contra catálogo autorizado.
- Curso: RBD + año + tipo enseñanza + grado + letra (+ sección/jornada si aplica).
- Alumno: ID interno RGM y datos verificados; no resolver únicamente por nombre.
- Matrícula histórica: entidad/evento con vigencia; **no `UNIQUE(RUN)` como regla universal**.
- Asistencia estudiante-día y curso-día deben poder registrar rectificaciones/versiones.

## 7. Contratos y datos normalizados

Entidad canónica de matrícula:
`source, rbd, school_year, education_code, grade_code, course_letter, student_external_id, student_internal_id?, enrollment_effective_date?, withdrawal_effective_date?, enrollment_status?, extracted_at, import_run_id`.

Entidad canónica asistencia individual:
`source, rbd, school_year, education_code, grade_code, course_letter, student_internal_id?, attendance_date, attendance_state, import_run_id, version`.

Estados:
`PRESENTE`, `AUSENTE`, `NO_TRABAJADO`, `NO_MATRICULADO`, `SIN_REGISTRO`, `DESCONOCIDO`.

Entidad canónica asistencia agregada:
`source, rbd, school_year, education_code, grade_code, course_letter, attendance_date, present_count, absent_count, enrolled_count, source_period, import_run_id, version`.

Separar estadística agregada de registro individual; validar sumas entre ambas solo cuando existan ambas fuentes y sean comparables.

## 8. Conciliación de matrícula, reglas y seguridad

Clasificaciones: `SIN_CAMBIO`, `NUEVO_EN_SIGE`, `SOLO_EN_RGM`, `CAMBIO_CURSO`, `RETIRO_SIGE`, `FECHA_DISTINTA`, `DUPLICADO`, `IDENTIDAD_INCIERTA`, `CONFLICTO`, `REQUIERE_REVISION`.

Reglas obligatorias:
- Importaciones repetidas: idempotencia por checksum/contenido/contexto.
- Carga en `staging` y **dry run** antes de escritura definitiva.
- No borrar o retirar automáticamente a un alumno ausente de una nómina (podría ser parcial).
- No sobrescribir con una extracción antigua información más reciente sin aprobación.
- Retiros, traslados, cambios de curso y continuidad requieren reglas y responsables.
- No calcular vacantes operativas desde la nómina exclusivamente: contrastar con cupos/capacidad informados por UATP.
- Validar fechas inexistentes, columnas, duplicados, RBD cruzados y códigos educativos configurables.
- Distinguir `NO_TRABAJADO`, `NO_MATRICULADO` y `SIN_REGISTRO` de `AUSENTE`.
- Mantener originales protegidos, trazabilidad de importación, errores por fila, aprobación y rectificación.

**Datos de menores:** mínimos necesarios, acceso por rol/RBD, cifrado, auditoría, ambiente institucional, respaldos y política de retención. No subir RUN, nombres, PIE/SEP ni documentos completos a repositorios públicos, logs o asistentes externos. Usar datos sintéticos en tests. Cerrar o revocar sesiones expuestas. Acordar autorización/finalidad y tratamiento de datos con responsables competentes antes de cargar datos reales.

## 9. Pantallas del módulo

**Integración SIGE:** selector RBD/año y tipo de dato, archivo, previsualización, validaciones, historial y resultado.

**Conciliación:** diferencias SIGE↔RGM, filtros, propuestas, aprobación individual/por lote y exportación autorizada.

**Cobertura SLEP:** por RBD, último corte de matrícula, último mes asistencia, fecha importación, conflictos, errores, responsable y antigüedad del dato.

**Auditoría:** acciones aplicadas, usuario, fecha, valores anteriores/nuevos y origen.

## 10. Roadmap y condiciones de salida

**Fase 0 — Diagnóstico RGM existente.** Inspeccionar stack, esquema real, roles, procesos de matrícula/continuidad, importadores existentes y riesgo. Entregar arquitectura e historias de usuario. **No ejecutar migraciones todavía**.

**Fase 1 — Importador nóminas.** Parser para XML/TXT/XLS-HTML, mapeo versionado, staging y validaciones con datos ficticios. Criterio: carga sin modificación productiva; informe filas válidas/errores.

**Fase 2 — Conciliación.** Comparar RGM y SIGE por RBD/estudiante/curso, cambios, altas/retiros y conflictos. Criterio: prueba de casos y reporte de diferencias.

**Fase 3 — Aprobación.** Revisión UATP, aplicación transaccional, auditoría, idempotencia, reversión y permisos. Criterio: piloto autorizado sin cruces de RBD ni pérdidas de historial.

**Fase 4 — Asistencia histórica.** CSV agregados por enseñanza; asistencia individual cuando exista canal permitido, fechas de corte y conciliación de sumas. Criterio: mes disponible visible, sin confundirlo con dato diario.

**Fase 5 — Extender cobertura.** Procedimiento controlado con responsables en colegios autorizados y tablero de cobertura de los RBD.

**Fase 6 — Interoperabilidad Mineduc.** Solo al existir convenio, API documentada, granularidad, permisos, credenciales institucionales y pruebas. Comparar resultado de conector oficial con archivos existentes. Activar actualización diaria únicamente si ese servicio está disponible.

## 11. Pruebas de SIGE que faltan (no bloquean el desarrollo)

1. Validar estructura XML/TXT y XLS-HTML de nómina y tratamiento de alumnos retirados (solo encabezados/tipos y totales en evidencias compartidas).
2. Verificar si un mes cerrado de asistencia se rectifica y cómo cambia el dato entre cortes.
3. Evaluar escuelas con otras modalidades de enseñanza y calendarios, si corresponden.
4. Comparar asistencia agregada y la individual en el mismo curso/día, sin divulgar identificadores.
5. Pedir a Mineduc documentación oficial de APIs, alcance por RBD, frecuencia, fecha de corte y posibilidades reales de consulta diaria.

## 12. Criterios de aceptación

- [ ] Reutiliza arquitectura y modelo del RGM sin repositorio/base paralela innecesaria.
- [ ] Toda importación registra RBD, período, fuente, usuario, hash, fecha y versión.
- [ ] Importar no altera matrícula productiva.
- [ ] Conciliación y revisión obligatorias antes de aplicar.
- [ ] Historial y rectificaciones preservados.
- [ ] Archivos repetidos no duplican registros.
- [ ] Reportes indican el desfase de asistencia.
- [ ] Acceso restringido por RBD/rol y auditoría.
- [ ] Pruebas unitarias/integración con datos sintéticos.
- [ ] Conector API futuro puede sustituir exportaciones sin rehacer reglas de dominio.

---

## 13. Prompt de ejecución para la IA que ya desarrolla el RGM

**Analiza el repositorio del RGM existente y este documento. NO crees una aplicación independiente, ni introduzcas un backend o base de datos nueva sin diagnóstico.**

Antes de escribir código entrega:
1. Inventario real de stack, módulos, procesos, autenticación, roles, ORM y migraciones.
2. Diagrama de tablas y relaciones relevantes (establecimiento, alumno, apoderado, curso, matrícula y estado/histórico).
3. Brechas entre el sistema real y las funciones solicitadas.
4. Modelo de entidades de integración/staging y mapeo contra tablas existentes.
5. Diseño del parser multiformato de nómina (prioridad), luego asistencia.
6. Motor de conciliación, workflow de aprobaciones y controles de seguridad.
7. Migraciones aditivas propuestas (sin ejecutarlas).
8. Historias de usuario ordenadas por dependencia, estimaciones y criterios de aceptación.
9. Pruebas técnicas con datos sintéticos y plan piloto seguro.

**Primera entrega de implementación tras aprobación:** importar una nómina SIGE de prueba, detectar RBD/año y formato real, normalizar, guardar en staging, comparar con matrículas RGM de prueba y mostrar una vista previa de diferencias. Ninguna escritura automática a matrícula de producción. El origen diario futuro debe quedar desacoplado del importador actual y condicionado a servicios oficiales de Mineduc.
