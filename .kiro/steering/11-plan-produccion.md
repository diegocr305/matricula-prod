# Plan y herramientas de puesta en PRODUCCIÓN (limpieza + recarga)

Estado: **PREPARADO** (herramientas listas y probadas en DRY-RUN; ejecución
pendiente del "ya" del dueño). Documenta cómo dejar la base lista para producción
sin perder dato real. Doc maestro con el detalle: `backend/produccion/PLAN_PRODUCCION.md`.

## Contexto / problema
Durante demos y pruebas se ensuciaron datos. El dueño quiere, cuando dé la orden,
arrancar producción con data limpia. Clave aprendida: las pruebas SOLO tocaron 2026
y 2027; el histórico 2022–2025 (bajado de SIGE) es real e intocable.

## Estrategia (decidida con el dueño)
- **Histórico 2022–2025 (76.903 matrículas): se CONSERVA.** No se toca.
- **2026**: fuente de verdad = Excel del **formulario de las escuelas**
  (`csv pruebas/registro_general_matricula_2026 (1).xlsx`). Reconciliación por
  UPSERT, NO borrado masivo (las FK no tienen cascada y hay dato real que conservar).
- **2027 (453 matrículas, solo RBD 1520): prueba** → se limpia y se re-ejecuta el
  piloto Bicentenario desde cero.
- **Estudiantes nunca se borran** (UPSERT), por integridad referencial.

## Hechos medidos en la base (oct 2026)
estudiante 34.163 · matricula 92.192 · apoderado 13.557. Por año: 2022=20.693,
2023=19.454, 2024=18.359, 2025=18.397, 2026=14.836, 2027=453.
Cruce Excel↔base: 13.472 match (actualizar), **861 nuevos** (crear + avisar SIGE).
2.325 estudiantes "solo 2026" (1.729 en Excel, 596 no). 2.239 matrículas 2026 cuyo
RUN no está en el Excel (revisar, no borrar).

## Hallazgos importantes (bloqueos conocidos)
- El Excel del formulario **NO trae fecha_nacimiento** (NOT NULL en `estudiante`):
  por eso los 861 nuevos NO se pueden crear automáticamente. Pedir fecha de nac. al
  colegio/analista, o cargarlos por la UI.
- El `catalogo_grado` de la base está **incoherente** (ej. cod 6='6° básico' sin
  1°–5°, códigos mezclados) y el Excel trae curso/enseñanza en texto sucio. Por eso
  la reconciliación NO reescribe cod_grado/cod_tipo_ensenanza/correlativos; ese
  mapeo se hará aparte, revisado.
- Hay usuarios de PRUEBA en `usuario` (ids 1–6: director@colegioprueba.cl,
  admin@slep.cl, etc.) a limpiar aparte (ojo FK id_usuario_ejecutor).

## Herramientas (carpeta `backend/produccion/`)
Todas leen `backend/.env` (DATABASE_URL). Las destructivas: DRY-RUN por defecto,
exigen `--apply` (y `--confirmo-respaldo` la de borrado).

| Script | Qué hace | Estado |
|---|---|---|
| `01_respaldo.py` | pg_dump del schema `matriculas`; fallback CSV si no hay pg_dump | Probado (CSV) |
| `02_diagnostico.py` | Solo lectura; genera CSVs (860 nuevos, 2325 solo-2026, 2026 no en Excel) | Probado |
| `03_reconciliar_2026.py` | UPSERT 2026 desde Excel (fase A: dirección); reporta nuevos | Probado DRY-RUN |
| `04_limpiar_2027.py` | Borra pruebas 2027 en orden FK, en transacción | Probado DRY-RUN |
| `05_piloto_bicentenario.md` | Paso a paso para re-generar el piloto RBD 1520 | Doc |
| `PLAN_PRODUCCION.md` | Documento maestro con la estrategia y pasos | Doc |

## Pasos recomendados (resumen; detalle en PLAN_PRODUCCION.md)
1. Respaldo (`01`) y guardarlo en el servidor. 2. Diagnóstico (`02`) y revisar
listas. 3. Reconciliar 2026 (`03 --apply`). 4. Limpiar 2027 (`04 --apply
--confirmo-respaldo`). 5. Re-ejecutar piloto (`05` → `apply_prematricula_2027.py
--apply`). 6. Verificar con `02`. 7. Subir versión estable (steering 09) y deploy.
Regla de oro: ventana de mantención entre respaldo y limpieza.

## Pendientes del dueño
- Conseguir fecha_nacimiento de los 861 nuevos.
- Revisar `matriculas_2026_no_en_excel.csv` (2.239) y los 596 solo-2026 sin Excel.
- Decidir limpieza de usuarios de prueba.
- Confirmar dónde se guarda el pg_dump y la ventana de mantención.
