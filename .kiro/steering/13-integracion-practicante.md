# Integración de mejoras del practicante (Bastián Aravena) — oct 2026

Estado: INTEGRADO en `main` tras merge controlado. Registra qué se trajo, cómo se
resolvieron los conflictos y qué quedó pendiente.

## Qué se integró
Mejoras desarrolladas por el practicante Bastián Aravena, tomadas desde la rama
`backup/main` (diegocabrera-22/matricula-prod), que era la versión ya adaptada a
producción con regla de "cero regresión" sobre el trabajo de Diego:

- **Jerarquía escolar y control de regresión** (`frontend/src/utils/gradeHierarchy.ts`):
  bloquea matricular en curso inferior, detecta repitencia y promoción.
- **Estados `Promovido` / `Repitente`** sin duplicar matrícula activa.
- **Trazabilidad de traspasos inter-escolares**: retiro automático en colegio de
  origen al cambiar de colegio, etiqueta `Trasladado`, adjunto de certificado
  (`POST /matriculas/{id}/documento-traslado`).
- **Confidencialidad en retiros**: tabla `encuesta_retiro` separada, auditoría
  sanitizada (no expone respuestas privadas del apoderado).
- **Visualización de motivos** de retiro/traslado: `ModalDetalleMotivo.tsx` + botones
  en la grilla de matrículas.
- **Flujo de postulantes nuevos** (matrícula sin historial previo sin error).
- **Seguridad multi-tenant** (`security.py`/`auth_service.py`): `es_usuario_slep`,
  `validar_acceso_colegio`, roles case-insensitive, filtro institucional.
- **Fix** `apply_firma_migration.py`: detección automática de esquema matriculas/public.
- Paginación y búsqueda avanzada en el directorio de estudiantes.

## Base de datos
Bastián YA aplicó la migración SQL en Supabase (verificado el 04-10-2026):
`encuesta_retiro`, columnas de traslado/retiro/excedente en `matricula`, dirección
estructurada en `estudiante`, `ficha_salud`, e índices. **El merge fue solo de
código; no hubo que aplicar SQL.** Script de referencia: `GUIA_MIGRACION_SUPABASE_Y_CAMBIOS_PROD.md`.

## Cómo se resolvió el merge (5 conflictos)
Rama de integración `integracion-bastian` desde `main`. Tag de respaldo:
`respaldo-pre-merge-bastian-2026-10-04`. Criterio: preservar lo reciente de Diego
(asistencia, firma, Opción-1 apoderado, grado absoluto básica→media) + traer las
mejoras de Bastián.

- `useMatriculas.ts`: combinados los campos de ambas interfaces.
- `useNuevaMatricula.ts`: se conservó la lógica de **grado absoluto** de Diego
  (maneja bien 8° básico → 1° medio como promoción; el `obtenerRangoCurso` de
  Bastián lo marcaría como salto anormal). Se re-agregaron `numPrevioMatch`/`numDestinoMatch`.
- `Matriculas.tsx`: se usa `renderEstadoBadge(mat)` de Bastián (Promovido/Repitente/
  Trasladado) + el badge de `estado_renovacion` de Diego (Firmada/Por renovar/...).
- `matricula_service.py`: SELECT y dict de la grilla combinan columnas de ambos
  (estado_renovacion + suplente de Diego; traslado/retiro de Bastián), índices f[26-29].
- `estudiante_service.py` (el más grande, 26 bloques): se tomó la versión completa
  de Bastián como base (paginación, búsqueda, verificar_acceso, estados nuevos,
  CURRENT_TIMESTAMP) y se re-inyectó quirúrgicamente lo de Diego:
  `normalizar_rut` (import + 6 usos) y `estado_renovacion`/`cod_tipo_ensenanza`/
  `id_establecimiento` en el SELECT y dict del historial.

## Verificación
- Frontend: `npm run build` OK (2465 módulos).
- Backend: importa `main` sin error; todos los routers cargan.
- Smoke test: endpoint de asistencia sigue devolviendo datos (14.109 alumnos, 82,3%).

## PENDIENTE (decisión / mejora futura)
- **Georreferenciación del APODERADO/suplente**: Diego tenía dirección estructurada
  del apoderado (`a.calle`, `asup.calle`...) en la ficha. NO se re-inyectó en el
  merge para evitar un bug de índices posicionales en el SELECT de la ficha. La
  dirección estructurada del **estudiante** SÍ está (la trae Bastián). Si se
  necesita la del apoderado para geocodificar, re-agregarla con cuidado (SELECT +
  dict + updates de `actualizar_datos_estudiante_db`), probando los índices.
- Revisar en uso real (no solo build) los flujos de: cambio de curso, traslado
  inter-escolar y encuesta de retiro, que son nuevos de Bastián.
