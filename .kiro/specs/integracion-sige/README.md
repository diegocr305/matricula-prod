# Spec — Módulo Integración SIGE (RGM SLEP Valparaíso)

Paquete de documentación para implementar el módulo **Integración SIGE** dentro del RGM existente.
La implementación la realizará otra IA; estos documentos son el contrato.

## Alcance aprobado
- Módulo **integrado** al RGM actual: FastAPI + psycopg2, schema `matriculas` en Supabase.
- **Sin** SQLAlchemy, **sin** Docker/Postgres local, **sin** app paralela.
- Tablas de staging con prefijo **`sige_`**, aditivas, sin tocar producción.
- Primera versión: **solo matrícula**. Asistencia preparada en el modelo, implementada en etapa 2.
- Camino oficial = `/sige/*`; el `carga-masiva` legacy se conserva marcado como legacy.
- Validación OTP Mineduc y API oficial = futuro, solo con convenio.

## Orden de lectura
1. `requirements.md` — qué debe hacer (requisitos EARS + funciones de verificación).
2. `design.md` — cómo hacerlo (DDL real `matriculas`, adaptadores, conciliación, endpoints).
3. `tasks.md` — plan por fases (empezar por Fase 1, DRY-RUN primero).
4. `mapeo-ceds-nds.md` — calidad de datos: RGM ↔ CEDS/NDS + funciones de verificación.
5. `validacion-otp-mineduc.md` — firma OTP Mineduc (futuro).

## Documento maestro relacionado (no duplicar)
`csv pruebas/libro-digital/Documentacion_Integracion_SIGE_RGM_SLEP.md` (v1.0). Este spec lo
complementa y fija la nomenclatura definitiva `sige_*` (el maestro usa nombres genéricos
`integration_*`).

## Insumos de referencia (en `csv pruebas/libro-digital/`)
- `Descripción de Funciones de Verificación - Hoja 1.csv` (99 funciones).
- `Funciones de Verificación - Diccionario de datos - Diccionario.csv` (mapeo tabla/columna ↔ función).
- `NDS-Reference-v7_1.xlsx - NDS Tables.csv`, `reference - tables.csv`, `CEDS-V7_1-with-Extend (2).xlsx`.

## Reglas no negociables
- Nada escribe en producción hasta `aplicar`, y solo filas `APROBADA`, en transacción, con auditoría.
- RUN nunca es clave única histórica → conciliar por `(id_estudiante, id_establecimiento, anio_escolar)`.
- No retiro automático por ausencia en nómina. No borrar registros.
- Idempotencia por `hash_archivo` (SHA-256).
- Datos de menores: solo sintéticos en tests/logs/git; acceso por rol/RBD.
- No ejecutar migraciones sin "ya" del dueño; correr `apply_sige_staging_migration.py` en DRY-RUN primero.

## Estado
- Fase 0 (diagnóstico + esta documentación): **hecha**.
- Fase 1+ (código): **pendiente de ejecución por la otra IA**, tras aprobación de la migración.
