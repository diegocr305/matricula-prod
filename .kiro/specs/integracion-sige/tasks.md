# Plan de implementación — Módulo Integración SIGE

> Tareas para la IA que programará. Cada tarea apunta a requisitos de `requirements.md` y al
> diseño de `design.md`. Orden por dependencia. **Fase 0 ya está hecha** (diagnóstico + esta
> documentación). Empezar por Fase 1. No ejecutar migraciones hasta aprobación del dueño; correr
> primero en DRY-RUN.

## Fase 1 — Migración de staging (idempotente)

- [ ] 1.1 Crear `backend/apply_sige_staging_migration.py` siguiendo el patrón de
  `apply_renovacion_migration.py` (check-before-create, commit por paso, `if __name__=='__main__'`).
  - Incluir modo DRY-RUN por defecto y `--apply` (como `apply_asistencia_migration.py`).
  - Crear las 4 tablas del DDL de `design.md` §3 con sus CHECK e índices.
  - _Requisitos: 1, 2, 3, 4, 9, 10_

- [ ] 1.2 Ejecutar en DRY-RUN y mostrar el SQL que generaría. **No** aplicar sin "ya" del dueño.
  - _Requisitos: 10_

- [ ] 1.3 Crear datos sintéticos de prueba en `backend/tests/fixtures/sige/`
  (nómina XLS-HTML, XML, CSV `;`) con RUN/nombres **ficticios** (nunca datos reales de menores).
  - _Requisitos: 8_

## Fase 2 — Ingestión y staging

- [ ] 2.1 Crear `backend/services/sige_service.py` con `get_db_connection()` y el patrón
  commit/rollback/finally.
  - _Requisitos: 1_

- [ ] 2.2 Implementar `detectar_formato(nombre, bytes)` y los adaptadores de parseo
  (XLS-HTML con `read_html` latin1→utf-8, XML, TXT, CSV `;`), devolviendo `FilaCanonica`.
  Reutilizar el enfoque de `procesar_carga_masiva_db`.
  - _Requisitos: 1_

- [ ] 2.3 Implementar `calcular_hash` (SHA-256) e idempotencia: rechazar hash ya cargado salvo
  importación previa `RECHAZADA`.
  - _Requisitos: 2_

- [ ] 2.4 Implementar carga a `sige_importacion` + `sige_matricula_staging` con `execute_values`
  en chunks (patrón `importar_registro_2026.py`, `SET statement_timeout=0`).
  - _Requisitos: 1_

- [ ] 2.5 Crear `backend/routers/sige.py` con `POST /sige/importaciones` y registrarlo en
  `main.py`. Guards: `verificar_escritura` + `validar_acceso_colegio`; multi-RBD solo SLEP.
  - _Requisitos: 1, 8_

- [ ] 2.6 Tests pytest de ingestión con los fixtures sintéticos (formato detectado, filas en
  staging, idempotencia). Sin tocar producción.
  - _Requisitos: 1, 2, 8_

## Fase 3 — Validación

- [ ] 3.1 Implementar validaciones por fila (obligatorios, RUN+DV con `normalizar_rut`, RBD,
  códigos 110/310, fechas inexistentes/centinela, fecha_nacimiento para NUEVO) escribiendo
  `motivos_validacion` y `sige_error_importacion`. Alinear mensajes con funciones fn2EA/fn2DA/
  fn2CA (ver `mapeo-ceds-nds.md`).
  - _Requisitos: 3, 11bis_

- [ ] 3.2 `POST /sige/importaciones/{id}/validar`: actualiza totales y estado `VALIDADA`.
  - _Requisitos: 3_

- [ ] 3.3 Tests de validación con filas buenas y malas sintéticas.
  - _Requisitos: 3_

## Fase 4 — Conciliación y vista previa

- [ ] 4.1 Implementar el clasificador (NUEVO/COINCIDENTE/CAMBIO_CURSO/RETIRO/CONFLICTO/REVISAR)
  por **triple clave** `(id_estudiante, id_establecimiento, anio_escolar)`, solo-lectura sobre
  RGM, escribiendo `sige_conciliacion` con `diferencias_json`.
  - _Requisitos: 4_

- [ ] 4.2 `POST /sige/importaciones/{id}/conciliar` → estado `CONCILIADA`.
  - _Requisitos: 4_

- [ ] 4.3 `GET /sige/importaciones/{id}/preview` (conteo por clasificación + detalle paginado,
  filtros, control rol/RBD).
  - _Requisitos: 5, 8_

- [ ] 4.4 Tests de conciliación cubriendo cada clasificación (incluido REVISAR por
  fecha_nacimiento faltante y CONFLICTO por identidad ambigua).
  - _Requisitos: 4, 5_

## Fase 5 — Aprobación y aplicación transaccional

- [ ] 5.1 `POST /sige/importaciones/{id}/aprobar` (individual y por lote con filtro; CONFLICTO no
  por lote ciego); escribe `estado_aprobacion`, `id_usuario_aprueba`, `fecha_aprobacion`.
  - _Requisitos: 6, 8_

- [ ] 5.2 `POST /sige/importaciones/{id}/aplicar`: transacción única que procesa solo `APROBADA`:
  - upsert `estudiante` por `run_ipe` con COALESCE;
  - crear/actualizar `matricula` reutilizando correlativo + `obtener_rango_curso` del RGM;
  - escribir `auditoria_matricula` por cada cambio;
  - nunca borrar ni retiro automático por ausencia;
  - rollback total ante error; al éxito estados `APLICADA`.
  - _Requisitos: 7_

- [ ] 5.3 Tests de aplicación: atomicidad (rollback), auditoría escrita, idempotencia (reaplicar
  no duplica), y que staging/conciliación se conservan.
  - _Requisitos: 7_

## Fase 6 — Reporte y marcado del legacy

- [ ] 6.1 `GET /sige/importaciones/{id}/reporte` (totales, por_clasificacion, cuadre fn2FA,
  errores; indica desfase con `fecha_importacion`/`fecha_corte_origen`).
  - _Requisitos: 9_

- [ ] 6.2 Marcar `procesar_carga_masiva_db` + `POST /matriculas/carga-masiva` como **legacy** en
  comentarios/docstring (no borrar), señalando que el camino oficial es `/sige/*`.
  - _Requisitos: 7_

## Fase 7 — Frontend (sección "Integración SIGE")

- [ ] 7.1 Nueva ruta/sección React "Integración SIGE": subir archivo, ver validación, preview de
  diferencias, aprobar individual/lote, aplicar, ver reporte. Reutilizar patrón de hooks
  `features/*/hooks/` y `config/api`.
  - _Requisitos: 1, 5, 6, 9_

- [ ] 7.2 Condicionar visibilidad por rol (patrón `puedeVerAuditoria`), coherente con la visión de
  permisos por pestaña (steering 12, Frente 3).
  - _Requisitos: 8_

## Etapa 2 (posterior) — Asistencia (solo cuando se pida)
- [ ] E2.1 Diseñar tablas de asistencia individual y agregada (estados completos; separar
  NO_TRABAJADO/NO_MATRICULADO de AUSENTE). Reutilizar `tipo_fuente` ya reservado.
  - _Requisitos: 10_

## Futuro (con convenio Mineduc) — Validación OTP y API oficial
- [ ] F.1 Implementar validación de firma OTP (transaccional/masiva) según
  `validacion-otp-mineduc.md`, con credenciales institucionales y sin versionar secretos.
- [ ] F.2 `SigeOfficialApiConnector` que reemplace al conector de archivos sin reescribir la
  conciliación.

---

## Checklist de criterios de aceptación global (del maestro §12)
- [ ] Reutiliza arquitectura y modelo del RGM, sin base paralela.
- [ ] Toda importación registra RBD, período, fuente, usuario, hash, fecha y versión.
- [ ] Importar no altera matrícula productiva.
- [ ] Conciliación y revisión obligatorias antes de aplicar.
- [ ] Historial y rectificaciones preservados.
- [ ] Archivos repetidos no duplican registros (idempotencia por hash).
- [ ] Reportes indican el desfase del dato.
- [ ] Acceso restringido por RBD/rol y auditoría.
- [ ] Pruebas con datos sintéticos.
- [ ] Conector API futuro sustituible sin rehacer reglas de dominio.
