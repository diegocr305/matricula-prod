# Plan de puesta en PRODUCCIÓN — RGM Digital SLEP Valparaíso

> Documento MAESTRO. Reúne la estrategia, las decisiones del dueño y el paso a paso
> recomendado para dejar la base lista para producción **sin perder dato real**.
> Estado: PREPARACIÓN (herramientas listas, ejecución pendiente del "ya" del dueño).
> Todas las herramientas destructivas corren en **DRY-RUN por defecto** y solo
> actúan con `--apply`.

---

## 1. Situación (medida en la base real, octubre 2026)

Conteos actuales del schema `matriculas`:

| Tabla | Filas |
|---|---|
| estudiante | 34.163 |
| matricula | 92.192 |
| apoderado | 13.557 |
| ficha_salud | 2 |
| firma_matricula | 5 |
| auditoria_matricula | 18 |

Matrículas por año: 2022=20.693 · 2023=19.454 · 2024=18.359 · 2025=18.397 ·
**2026=14.836** · **2027=453**.

### De dónde viene cada dato (aclarado por el dueño)
- **Histórico 2022–2025 (76.903 matrículas)**: bajado de **SIGE**. Dato real,
  NUNCA se tocó en pruebas. **SE CONSERVA INTACTO.**
- **2026**: la fuente de verdad es el Excel del **formulario de las escuelas**
  (`csv pruebas/registro_general_matricula_2026 (1).xlsx`, 14.613 filas, 14.332 RUN
  únicos). NO es de SIGE: lo reportaron los colegios. Las pruebas de demo se
  hicieron sobre 2026.
- **2027 (453 matrículas)**: pruebas de confirmación de renovación del piloto.
  Se tratan como dato de prueba (se limpian), pero se deja lista la re-ejecución
  del piloto Bicentenario Marítimo para producción (ver sección 6).

---

## 2. Estrategia elegida: RECONCILIACIÓN de 2026 (no borrado masivo)

El reset total era peligroso porque las FK **no tienen ON DELETE CASCADE** y porque
hay dato real de 2026 que NO se puede perder. La estrategia correcta es un
**UPSERT / reconciliación acotado al año 2026**, tomando el Excel del formulario
como fuente de verdad:

- **Estudiante ya existe en base (match por RUN): 13.472** → se ACTUALIZA con los
  datos del Excel (domicilio, salud, apoderados). NUNCA se borra el estudiante
  (lo referencian las matrículas históricas de 11.665 de ellos).
- **Estudiante nuevo (en Excel, no en base): 860** → se INSERTA. Dato real del
  formulario de las escuelas. Ver sección 4 (gestión con SIGE).
- **Matrícula 2026**: se reemplaza (borrar la actual del año + recrear desde Excel),
  tocando primero sus pocos dependientes (1 firma, 2 auditorías ligadas a 2026).
  El histórico <2026 NO se toca.
- **Matrículas 2026 en base que NO están en el Excel** → NO se borran a ciegas: se
  LISTAN para revisión del dueño. Pueden ser prueba real o alumnos no reportados
  en esta planilla.

### Por qué NO borramos estudiantes
De los 13.472 que matchean, **11.665 tienen matrícula histórica (<2026)**. Borrar su
fila `estudiante` violaría la FK `matricula.id_estudiante`. Por eso el estudiante
siempre se hace UPSERT, nunca DELETE.

### Los 2.325 "solo 2026"
Son estudiantes cuya única matrícula es 2026. **NO son prueba**: vienen del mismo
formulario de las escuelas. Al reconciliar con el Excel, los que estén en el Excel
mantienen su matrícula 2026 (reemplazada por el dato bueno). Si alguno NO está en el
Excel, queda en la lista de revisión; su dato NO se pierde (el estudiante permanece).

---

## 3. Herramientas (carpeta `backend/produccion/`)

Todas leen la conexión de `backend/.env` (`DATABASE_URL`, Supabase). Las que
modifican datos: **DRY-RUN por defecto**, requieren `--apply` para ejecutar.

| # | Script | Qué hace | Riesgo |
|---|---|---|---|
| 1 | `01_respaldo.py` | pg_dump del schema `matriculas` a un .sql | Ninguno (solo lectura) |
| 2 | `02_diagnostico.py` | Reporta estado 2026/2027 y genera listas (860, 2325, no-en-Excel) | Ninguno (solo lectura) |
| 3 | `03_reconciliar_2026.py` | UPSERT 2026 desde el Excel (DRY-RUN) | Alto (con --apply) |
| 4 | `04_limpiar_2027.py` | Borra pruebas 2027 en orden FK (DRY-RUN) | Alto (con --apply) |
| 5 | `05_piloto_bicentenario.md` | Paso a paso para re-generar el piloto RBD 1520 | — |

---

## 4. Los 860 nuevos — gestión con SIGE (pendiente del dueño)

Cifras exactas del diagnóstico (script 2):
- **861 nuevos** (en Excel, no en base) → `salida/860_nuevos_para_sige.csv`.
- Estudiantes cuya única matrícula es 2026: **2.325** (1.729 están en el Excel;
  **596 no** → `salida/2325_solo_2026.csv`, columna `esta_en_excel`).
- Matrículas 2026 en base cuyo RUN **no** está en el Excel: **2.239** →
  `salida/matriculas_2026_no_en_excel.csv` (revisar caso a caso, NO borrar a ciegas).
- 2027: 453 matrículas, 1 establecimiento (Bicentenario), 4 firmadas + 4 pendientes
  + 445 por renovar, 4 firmas. Todo prueba del piloto.

El script 2 exporta `salida/860_nuevos_para_sige.csv` con RUN, nombre, RBD, curso.
Estos alumnos llegaron por el **formulario de las escuelas** pero NO estaban en el
histórico de SIGE que se bajó. Acción del dueño:
1. Ingresarlos al RGM (lo hace la reconciliación, script 3).
2. Avisar a cada establecimiento para que los ingrese también en **SIGE** y así
   quede trazado por qué no estaban (posible matrícula no registrada en SIGE a
   tiempo). Investigar qué pasó en cada caso.

---

## 5. PASOS RECOMENDADOS (orden seguro)

> Nada de esto se ejecuta hasta tu "ya". Los pasos 1–3 son sin riesgo.

1. **RESPALDO** (sin riesgo). Correr `01_respaldo.py` y **guardar el .sql en el
   servidor**. Es la red de seguridad; sin esto no se avanza.
2. **DIAGNÓSTICO** (sin riesgo). Correr `02_diagnostico.py`. Revisar las listas
   generadas: 860 nuevos, 2.325 solo-2026, y matrículas 2026 que no están en el
   Excel. Decidir caso a caso las de la lista "no en Excel".
3. **NORMALIZACIÓN** (sin riesgo). El script 3 en DRY-RUN genera un reporte de
   cursos/enseñanzas que no logró mapear al catálogo. Revisar y ajustar el mapeo
   o pedir al analista un Excel con códigos de catálogo.
4. **RECONCILIAR 2026** (riesgo alto). Correr `03_reconciliar_2026.py --apply`
   SOLO después de validar el DRY-RUN. Actualiza/crea estudiantes y reemplaza
   matrículas 2026 desde el Excel.
5. **LIMPIAR 2027** (riesgo alto). Correr `04_limpiar_2027.py --apply` para quitar
   las pruebas de renovación.
6. **PILOTO BICENTENARIO**. Seguir `05_piloto_bicentenario.md` para re-generar la
   pre-matrícula/renovación del Liceo Marítimo (RBD 1520) en producción.
7. **VERIFICAR**. Re-correr `02_diagnostico.py` y confirmar conteos esperados.
8. **SUBIR VERSIÓN** a estable (`1.0.0`) según steering 09, build y deploy.

### Regla de oro
Entre el paso 1 (respaldo) y el paso 5, **no debe haber actividad de usuarios en el
sistema** (ventana de mantención), para que el estado no cambie bajo los pies.

---

## 5bis. Dominio Asistencia — autorizado por el dueño
El dueño AUTORIZÓ (oct 2026) crear la tabla `matriculas.asistencia_mensual` y
cargar la asistencia real 2026 enlazada por RUN (los 88.787 registros que ya
matchean; los que faltan corresponden a los 861 nuevos y a jardines VTF, que
entran después). Es seguro: tabla nueva, no afecta tablas existentes; la carga
solo inserta en esa tabla. Scripts: `apply_asistencia_migration.py` y
`cargar_asistencia.py` (ver steering 10). Esto NO interfiere con el plan de
limpieza/reconciliación de 2026/2027: la tabla de asistencia es independiente.
Al cargar los 861 alumnos nuevos, re-ejecutar `cargar_asistencia.py --apply`
(es idempotente) para completar la cobertura a ~100%.

## 6. Decisiones del dueño registradas

- Conservar histórico 2022–2025 (SIGE). No tocar.
- 2026: fuente de verdad = Excel del formulario de las escuelas.
- 860 nuevos: ingresar al sistema + gestionar su alta en SIGE con los colegios.
- 2.325 "solo 2026": NO son prueba, conservar.
- Matrículas 2026 que no estén en el Excel: LISTAR, no borrar a ciegas.
- 2027: tratar como prueba (limpiar) y dejar lista la re-ejecución del piloto.
- Estudiantes nunca se borran (solo UPSERT), por integridad referencial.

---

## 7. Pendientes / preguntas abiertas

- Normalización de `curso`/`tipo_enseñanza` del Excel a los catálogos
  (`cod_grado`, `cod_tipo_ensenanza`): 2.271 enseñanzas y 733 cursos nulos en el
  Excel. ¿Mapear best-effort + reporte, o pedir Excel con códigos? (ver paso 3).
- Confirmar ventana de mantención para la ejecución.
- Confirmar dónde se guarda el pg_dump (servidor del dueño).
