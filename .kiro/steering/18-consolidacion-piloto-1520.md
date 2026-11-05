---
inclusion: manual
---

# Consolidación del piloto RBD 1520 (SIGE ↔ Excel ↔ RGM) — nov 2026

Estado: APLICADO en producción (Supabase) con respaldo previo. Documenta el contraste de
las tres fuentes del Liceo Bicentenario Marítimo de Valparaíso (RBD 1520,
id_establecimiento=17, año 2026), las correcciones aplicadas y lo que queda pendiente.
Es el primer caso real del flujo de consolidación que después se generaliza a otros RBD
(ver steering 16 y spec `.kiro/specs/integracion-sige/`).

## 1. Contexto y hallazgo base

El RGM del 1520 se pobló originalmente desde la exportación de SIGE. Nunca se había
contrastado contra el Excel del formulario del colegio. Se cruzaron las TRES fuentes por
**cuerpo de RUT** (sin dígito verificador, porque los extranjeros traen IPE/RUN distinto
entre fuentes y el DV no es confiable):

- SIGE (`csv pruebas/matricula_2026/1520/nomina_excel (4).xls`, HTML disfrazado de .xls): 669 alumnos.
- Formulario (`.xlsx` "Nomina de estudiantes", fila 2 = encabezados reales): 671 alumnos.
- RGM (matrículas 2026 del establecimiento 17, estado ≠ Anulada): 673.

Resultado: **668 alumnos cuadran en las tres fuentes**. El trabajo real fue sobre ~20 casos.

## 2. Bug de cursos duplicados (RESUELTO)

El campo `matricula.curso` es texto libre. La carga SIGE escribía `8° Básico A` y la
matrícula manual `8° básico A` (minúscula) → `SELECT DISTINCT curso` los mostraba como dos
cursos (uno real, uno casi vacío). Afectaba el selector de cursos del front.

Fix (commit `813efb0`):
- Nueva función `normalizar_texto_curso` en `services/utils.py` (canónico "N° Básico/Medio A").
- Aplicada en los 4 puntos que escriben `curso`: `crear_nueva_matricula_db`,
  `procesar_carga_masiva_db` y los dos flujos de cambio de curso.
- Datos ya duplicados corregidos en la BD (2 filas del 1520: `8° básico A`→`8° Básico A`,
  `4° medio B`→`4° Medio B`), reasignando correlativo libre.
- **Pendiente de DEPLOY**: el fix de código requiere `git pull` + restart backend en el
  servidor (ver §6). El arreglo de datos ya está vivo.

## 3. Correcciones de datos aplicadas (script `produccion/09_corregir_consolidacion_1520.py`)

Herramienta idempotente, DRY-RUN por defecto, `--apply` + `--confirmo-respaldo`, por bloques.
Respaldo previo: `01_respaldo.py` (CSV de las 11 tablas) guardado en `backend/` (no versionado).

- **Bloque A — prueba eliminada**: matrícula de prueba "Diego Cabrera" (mat#92881, 8° Básico A,
  ejecutor admin) y su estudiante. APLICADO.
- **Bloque B — identidad IPE→RUN (Jared Ortega)**: una alumna extranjera se matriculó primero
  con IPE provisorio (est 95439, con apoderado+ficha) y luego con su RUN definitivo (est 31556,
  con historial 2025). Eran DOS estudiantes para la misma persona. Se consolidó en el registro
  con RUN: se migró apoderado + ficha de salud al ancla, se eliminó la matrícula 2026 duplicada
  (mat#92308) y el estudiante IPE. APLICADO.
  **REGLA DE NEGOCIO (del dueño):** cuando un alumno regulariza su identificador (IPE→RUN) NO se
  crea matrícula nueva; se ACTUALIZA el número de identificación / se consolida el registro.
- **Bloque C — cursos**: vacío. Las 3 alumnas con curso de letra "A" errónea en el RGM resultaron
  estar retiradas (bloque D), así que corregir su curso era innecesario.
- **Bloque D — retiros**: 7 alumnos marcados `Retirada` con su fecha real. APLICADO.

Resultado post-consolidación: 0 cursos duplicados, Jared con un solo registro (RUN + historial),
prueba eliminada, 7 retiros aplicados.

## 4. Regla de retiros (DECISIÓN FINAL: Opción 2)

Un alumno aparecía retirado en SIGE pero activo en el RGM en 13 casos. Se cruzó contra el Excel:
- **7 retirados en SIGE + Excel** → retiro real, no se capturó al importar. **APLICADOS**
  (estado Retirada, fecha real de la fuente, motivo "Retiro registrado en SIGE y Excel").
  Matrículas: 92567, 92232, 92775, 92463, 92388, 92218, 92873.
- **6 retirados SOLO en SIGE** (el Excel no lo refleja) → **PENDIENTES**. Se aplicaron y luego se
  REVIRTIERON a Activa por decisión del dueño (Opción 2: esperar confirmación del colegio; lo más
  probable es que el colegio no actualizó su planilla Excel). Matrículas: 92520, 92871, 92372,
  92249, 92545, 92734. Alumnos: Martina Valdivia, Javiera Torres, Isaías Peña, Mayra Sepúlveda,
  Joaquín Marchant, Felipe Perez.

Criterio vigente: un retiro se aplica cuando consta en SIGE **y** Excel. Para los solo-SIGE se
espera la confirmación del colegio; cuando confirme, se mueven a `RETIROS_CONFIRMADOS` en el
script 09 y se re-corre el bloque D (idempotente).

Estado final BD: 607 matrículas activas 2026 en el 1520; 7 retiros vigentes; 6 reactivados.

## 5. PENDIENTES (esperando al colegio)

1. **6 retiros solo-SIGE** (arriba): confirmar con el colegio si se actualizó/no el Excel.
2. **2 cursos en disputa** (SIGE y Excel difieren, el colegio decide cuál es el real):
   - Bianca Casatte: SIGE `2° medio D` vs Excel `2° Medio C` (RGM tiene C).
   - Anahiz Miranda: SIGE `3° medio C` vs Excel `3° Medio A` (RGM tiene A). (Además fue retirada,
     así que puede quedar sin efecto.)
3. **Altas que el colegio debe subir a SIGE** (están en RGM/Excel, no en SIGE): Emilia Ollino y
   Antonella Ibacache (el usuario ya avisó a la escuela; NO son error).

## 6. Deploy del fix de cursos (comandos servidor Lightsail)

Solo backend; no hay build de frontend ni migración de BD.
```
cd /opt/bitnami/nginx/apps/matriculas
git pull origin main
sudo systemctl restart matriculas-backend
sudo journalctl -u matriculas-backend -n 30     # verificar arranque sin ImportError
```
Las correcciones de datos NO requieren deploy (ya están en Supabase).

## 7. Cómo se generaliza a otros establecimientos

Este flujo es el patrón para cada RBD. Insumos por colegio (carpeta separada
`csv pruebas/matricula_<anio>/<rbd>/`): exportación SIGE (`.xls`-HTML) y Excel del formulario.

### Herramienta: `produccion/10_diagnostico_consolidacion.py` (SOLO LECTURA)
Generaliza el diagnóstico para cualquier RBD. Uso: `python produccion/10_diagnostico_consolidacion.py --rbd 1502 [--anio 2026] [--csv]`.
- Cruza SIGE ↔ Formulario ↔ RGM por **cuerpo de RUT**.
- Clasifica: SOLO_EN_RGM, SOLO_EN_SIGE, SOLO_EN_FORMULARIO, RETIRO_SIGE_NO_EN_RGM
  (indica si el Excel también lo marca), CURSO_DISTINTO_SIGE_RGM.
- **Mapeo tolerante por nombre de encabezado** (no por posición): resiste que los colegios
  muevan/renombren columnas. Contrato de campos en
  `.kiro/specs/integracion-sige/contrato-campos-rgm.md`.
- No modifica la base; es el paso previo a una corrección (script tipo 09, por colegio).

### Observación de formatos (nov 2026, RBD 1520/1502/14678)
- **SIGE** (`.xls`-HTML): 24 columnas IDÉNTICAS en los 3 colegios. Formato estable del Ministerio.
- **Formulario** (`.xlsx`): plantilla oficial casi idéntica (~59-60 col). El 1502 trae los valores
  en MAYÚSCULAS (`1° MEDIO G`); el normalizador lo resuelve. Mapear por nombre, no por posición.

### Hallazgos del diagnóstico de los 3 colegios
- **14678 (Juan de Saavedra, 108 alumnos)**: muy limpio. 5 en SIGE no en RGM, 3 retiros SIGE
  (2 confirmados en Excel), 0 cursos distintos.
- **1502 (Inst. Comercio, 861 alumnos)**: muchos descuadres. Lecciones clave:
  1. **El RGM tiene alumnos en cursos de EDUCACIÓN DE ADULTOS** (`1er nivel (1° y 2° medio) A`)
     cuando SIGE y el formulario dicen media regular -> error de carga (catálogo sucio,
     `determinar_nivel`/`obtener_rango_curso`). Revisar.
  2. **39 cursos distintos** donde las TRES fuentes discrepan entre sí (SIGE una letra, Excel
     otra, RGM otra) -> NO corregible automáticamente; el colegio debe decir la sección real.
  3. **Duplicado IPE↔RUN** (Erignis Gabazut: IPE 100636364 solo en RGM, RUN 29210864 solo en
     SIGE) -> aplicar regla IPE→RUN.
  4. 34 retiros SIGE no reflejados (solo ~9 confirmados también en Excel).
- **Conclusión**: la consolidación NO puede ser automática para todos. En colegios donde las
  tres fuentes discrepan (1502) se requiere validación del colegio. El diagnóstico (solo lectura)
  es seguro y sistemático; la corrección es por colegio y con decisiones humanas (script tipo 09).

La versión con UI y staging de este flujo es el módulo Integración SIGE
(`.kiro/specs/integracion-sige/`), y el contrato de campos capturados por el RGM está en
`.kiro/specs/integracion-sige/contrato-campos-rgm.md`.

## 8. Nota de privacidad
Todo el cruce se hizo con lectura local de los Excel (no versionados; `.gitignore` excluye
`*.xlsx` y `csv pruebas/**/*.csv`) y consultas de solo lectura a la BD. No se subieron RUN ni
nombres de menores al repositorio. Los scripts temporales de diagnóstico se borraron.
