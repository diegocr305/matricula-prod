# Analítica de Asistencia — dominio de datos (exploración)

Estado: **EN EXPLORACIÓN** (fuera de producción). Documenta el trabajo sobre el
dato de **asistencia** escolar, su origen, las decisiones del dueño y las reglas
del semáforo de riesgo. Es el segundo dominio del proyecto de datos (matrícula ya
está; asistencia es el que se está incorporando; resultados pedagógicos vendrá).

Conecta con: steering 07 (visión/roadmap — dashboard "accionable", alerta temprana),
steering 08 (excluir adultos/especial) y el proyecto EVALTIC 2027 (3 dominios
priorizados: matrícula, asistencia, resultados pedagógicos).

## 1. Fuente del dato
- Archivo de prueba: `csv pruebas/asistencia/matricula_slepv_2026 (1).xlsx`.
- Grano: **1 fila por alumno / mes / establecimiento**. Período marzo–agosto 2026.
- 93.067 filas, 16.824 estudiantes, 66 establecimientos. Extracto probablemente
  derivado de **SIGE**.
- Columna clave: `pct_asist` (0–1), ya calculada. Más `rangos_asistencia` y la
  glosa `asistencia`. Trae nivel, curso, enseñanza, sexo, nacionalidad, PIE, etnia.
- El filtro `filter(presencia_codigo %in% c(1,2))` es de R y se aplica al archivo
  **diario crudo** de SIGE (1=presente, 2=ausente; otros códigos se descartan del
  denominador), NO a este archivo que ya viene agregado. Pendiente: diccionario
  oficial de `presencia_codigo`.

## 2. Decisiones del dueño (tomadas)
- **Umbral 85%** (Mineduc). <85% insuficiente, <70% grave.
- **"0% + 1 solo mes" = "Revisar - posible retiro"**, NO riesgo de asistencia
  (probable alumno no vigente). Evita inflar los rojos.
- **Jardines VTF POR SEPARADO**: parvularia no comparable con básica/media. Hoy
  los jardines NO están en la BD del RGM (se importarán de otra base). El dato VTF
  se usará después; objetivo: el director los ve separados del resto.
- **Adultos/especial EXCLUIDOS** del análisis comparable (steering 08). No se
  borran, solo no entran a semáforo/ranking. Validar con Inspector General.

## 3. Segmentación (implementada en el script)
`segmento` por fila: `escolar` (análisis principal) · `vtf` (aparte) · `excluido`
(adultos/especial). El semáforo y el ranking se calculan SOLO sobre `escolar`.

## 4. Semáforo de riesgo por REGLAS (explicable, no es modelo de caja negra)
Por alumno, sobre su trayectoria mar→ago:
- **Revisar - posible retiro**: 1 mes y 0%.
- **Rojo**: promedio <70%, o ≥3 meses bajo 70%, o (promedio <85% y cayendo ≤ -3 pp/mes).
- **Amarillo**: promedio <85%, o cayendo ≤ -2 pp/mes.
- **Verde**: el resto. "Sin dato" si no hay registros.
Métrica de **tendencia**: pendiente de regresión lineal de `pct_asist` vs mes,
en puntos porcentuales por mes (negativa = cayendo).

Resultado 2026 (segmento escolar, 14.563 alumnos): asistencia prom 83,1%;
18,6% rojo, 27,4% amarillo, 53,8% verde.

## 5. Script y salidas
- `csv pruebas/asistencia/analisis_asistencia.py`: SOLO lee el Excel, **no toca la
  BD**. Genera CSVs en `csv pruebas/asistencia/salida/` (trayectoria por alumno,
  ranking por colegio, riesgo por colegio, lista de prioridad, VTF aparte, posibles
  retiros, informe de calidad).
- Bitácora de decisiones y preguntas abiertas: `csv pruebas/asistencia/DECISIONES_ASISTENCIA.md`.

## 5bis. Integración con la base (cruce + tabla + carga)
- **Cruce por RUN (prueba de integración, hecho)**: `csv pruebas/asistencia/
  cruce_asistencia_rgm.py` (solo lectura). Resultado: match ESCOLAR 96,9%
  (14.081/14.535), global 94,2%. Los jardines VTF matchean 43,6% (esperado: no
  están en la BD aún). Los ~454 escolares sin match se SOLAPAN con los 861 alumnos
  "nuevos" del formulario (plan producción, steering 11): dos fuentes confirman el
  mismo grupo faltante. Al cargar los 861, el match escolar sube a ~100%.
  Salidas: `salida/08_asistencia_sin_match_en_rgm.csv`, `salida/09_escolares_sin_match_REVISAR.csv`.
- **Tabla `matriculas.asistencia_mensual`** (DISEÑADA, no creada aún):
  migración `backend/apply_asistencia_migration.py` (idempotente, DRY-RUN por
  defecto, `--apply` para crear). Grano alumno/mes/establecimiento; llave única
  (id_estudiante, anio, mes, id_establecimiento) para UPSERT; FK a estudiante
  ON DELETE CASCADE; columna `segmento` (escolar/vtf/excluido).
- **Carga**: `backend/cargar_asistencia.py` (DRY-RUN por defecto, `--apply` hace
  UPSERT). Enlaza por RUN; omite y reporta lo que no matchea. En DRY-RUN enlaza
  88.787/93.067 filas (resto = VTF + 861 no cargados).
- **ORDEN recomendado**: cargar la asistencia DESPUÉS de incorporar los 861 nuevos
  (ver steering 11), para que entre completa. Hoy ambos scripts están listos y
  probados en DRY-RUN; falta aplicar.

## 5ter. Pestaña de Asistencia (IMPLEMENTADA, en producción de datos)
- **Tabla cargada**: `matriculas.asistencia_mensual` creada y con 88.787 filas 2026
  (escolar 80.115 / 14.109 alumnos; excluido 6.522; vtf 2.150). Autorizado por el dueño.
- **Backend**: `routers/asistencia.py` (`/asistencia/resumen`, `/asistencia/anios`) +
  `services/asistencia_service.py`. Entrega SOLO agregados (KPIs, semáforo por reglas,
  tendencia mensual, ranking por establecimiento), sin datos personales. Filtra
  segmento='escolar'; rol Colegio ve solo su establecimiento. Registrado en main.py.
- **Frontend**: `features/asistencia/PanelAsistencia.tsx` + `hooks/usePanelAsistencia.ts`.
  Ruta `/asistencia`, enlace "Asistencia" (icono CalendarCheck) en el menú del Layout.
  Build verificado OK. Diseño macro; preparado para drill-down a micro en el futuro.
- **Valores reales 2026**: asistencia prom 82,3%; rojo 2.616, amarillo 3.848,
  verde 7.625, revisar 20; tendencia mar 85% -> jul 75% -> ago 86%.
- Pendiente de **deploy** (git push prod main + build en servidor, ver steering 04).
- NOTA privacidad: la vista es agregada (sin nombres). El drill-down a lista nominal
  de alumnos en riesgo (dato sensible de menores) queda para una fase posterior con
  control de acceso definido.

## 6. Pendientes antes de producción (resumen)
- Privacidad: la lista de prioridad identifica ~6.700 menores en riesgo. Definir
  quién la ve (alinear con perfiles del steering 02) y validar uso con el área
  legal. Preferir seudonimización en análisis agregados. EVALTIC lo marca *Extremo*.
- ¿Habrá asistencia histórica (2022–2025)? Se necesita para predicción de deserción.
- Cómo/cada cuánto se cargará la asistencia (ETL vs manual).
- Prueba de cruce por RUN contra `estudiante` del RGM (match real).
- Diseño de tabla `asistencia_mensual` en el schema `matriculas` + ingesta.
- Llevar el semáforo al dashboard (vista SLEP y vista colegio).
- Incorporar VTF a la BD y mostrarlo como vista separada.
