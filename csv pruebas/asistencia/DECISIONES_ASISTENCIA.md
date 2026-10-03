# Analítica de Asistencia — Decisiones tomadas y preguntas abiertas

> Bitácora de trabajo sobre el dato de **asistencia** del SLEP Valparaíso, para
> cruzarlo con el RGM Digital y avanzar hacia analítica / alerta temprana.
> Es un documento VIVO: aquí se anotan las decisiones del dueño y lo que falta
> consultar antes de llevar esto a producción. No es código.

Fecha de inicio: octubre 2026. Fuente: `matricula_slepv_2026 (1).xlsx` (extracto
mensual, probablemente desde SIGE), entregado por el analista de datos.

---

## 1. Qué es el archivo de asistencia

- **Grano**: 1 fila por **alumno / mes / establecimiento**.
- **Período**: marzo a agosto 2026 (6 meses, 1er semestre + inicio del 2°).
- **Volumen**: 93.067 filas, 16.824 estudiantes únicos, 66 establecimientos.
- **Columna clave**: `pct_asist` (0–1, ej. 0.941 = 94,1%). Ya viene **calculada**.
  También `rangos_asistencia` ("90 a 99 %") y `asistencia` (glosa: "Asistencia
  normal", "Inasistencia grave", etc.).
- Trae: nivel, curso, enseñanza, sexo, nacionalidad, PIE, etnia, rbd, id_est.

### Sobre el filtro `filter(presencia_codigo %in% c(1,2))`
- Ese filtro es **código R que se aplica al archivo DIARIO crudo de SIGE**, NO a
  este archivo. En el extracto diario, cada día trae un `presencia_codigo`
  (típicamente 1 = presente, 2 = ausente; otros códigos = retirado / no
  corresponde / día no hábil / matrícula no vigente). El filtro deja solo los días
  que cuentan para el denominador del %, evitando que se cuente mal.
- **Este archivo YA viene agregado a % mensual**, así que ese filtro ya está
  aplicado aguas arriba. Sobre este archivo NO hay que volver a filtrar.
- PENDIENTE: pedir al analista el **diccionario oficial de `presencia_codigo`**
  (qué significa cada valor) para dejarlo documentado, por si en el futuro
  trabajamos con el diario.

---

## 2. Decisiones del dueño (TOMADAS)

| # | Decisión | Detalle |
|---|---|---|
| D1 | **Umbral de asistencia = 85%** | Criterio Mineduc. Bajo 85% = asistencia insuficiente; bajo 70% = inasistencia grave. |
| D2 | **"0% con un solo mes" NO es riesgo** | Se separa en categoría "Revisar - posible retiro" (probable alumno no vigente). No infla el semáforo. El colegio debe revisar vigencia de matrícula. Son 21 casos en el segmento escolar. |
| D3 | **Jardines VTF se analizan POR SEPARADO** | Parvularia no es comparable con básica/media. Hoy los jardines NO están en la BD del RGM (hay que importarlos de otra base). El dato VTF se usará MÁS ADELANTE. Objetivo: que el director pueda ver los jardines separados del resto de establecimientos. |
| D4 | **Adultos / especial se EXCLUYEN** del análisis comparable | Alineado con steering 08 (instrucción de la Dirección Ejecutiva). No se borran, solo no entran a semáforo/ranking. Requiere validación con Inspector General antes de producción. |

---

## 3. Hallazgos del análisis exploratorio (2026, segmento escolar)

- Asistencia promedio escolar: **83,1%** (bajo el umbral de 85%).
- Semáforo por alumno: **18,6% rojo, 27,4% amarillo, 53,8% verde**.
- VTF (aparte): 62,1% promedio — esperable en parvularia, por eso va separado.
- 2.639 alumnos tienen menos de 6 meses de registro (ingresos/retiros en el año).
- 9 alumnos aparecen el mismo mes en 2 establecimientos (cambio de colegio).
- Calidad buena: `pct_asist` sin nulos ni valores fuera de rango.

---

## 4. Preguntas ABIERTAS (consultar antes de producción)

### Sobre el dato
1. **Diccionario de `presencia_codigo`**: pedir al analista los valores oficiales
   y qué días cuentan para el %.
2. **¿Tendremos asistencia histórica (2022–2025)?** Hoy solo hay 2026. Para
   predecir deserción se necesita historia con resultado conocido.
3. **¿La asistencia llegará mensual de forma recurrente?** ¿Cómo y cada cuánto se
   va a cargar/actualizar? (define si es un proceso ETL o carga manual).
4. **Jardines VTF**: ¿de qué base se importan a la BD del RGM? ¿Qué llave los
   enlaza (RBD)? Definir antes de incorporar su asistencia.

### Sobre las reglas del semáforo
5. **¿El umbral 85% aplica igual a básica y media?** Decidido que sí por ahora.
   ¿Se querrá un umbral distinto para parvularia cuando entre VTF?
6. **Alumnos con pocos meses (2–3)**: hoy entran al semáforo con lo que tengan.
   ¿Está bien, o se exige un mínimo de meses para clasificar?
7. **Tendencia**: hoy una caída ≤ -2 pp/mes pesa en el riesgo. ¿Validar ese corte
   con Apoyo Técnico Pedagógico?

### Sobre privacidad / gobernanza (CRÍTICO)
8. **Datos de menores**: la lista de prioridad tiene nombre + RUN + colegio de
   ~6.700 niños en riesgo. Definir quién puede verla (¿solo el colegio su propia
   lista? ¿SLEP agregado?). Alinear con los perfiles del steering 02.
9. **Validación jurídica**: confirmar con el área legal el uso de asistencia para
   scoring de riesgo (es dato sensible de menores). El propio EVALTIC marca este
   riesgo como *Extremo*.
10. **Anonimización** para los análisis agregados/exploratorios: trabajar con RUN
    seudonimizado cuando no se necesite identificar al alumno.

### Sobre el cruce con el RGM
11. **Match por RUN**: ¿cuántos de los 14.563 RUN escolares existen en la tabla
    `estudiante` del RGM? (prueba de integración, pendiente — se hará con la BD).
12. **Modelo de datos**: cómo guardar esto en el schema `matriculas` (propuesta:
    tabla `asistencia_mensual` ligada a estudiante/establecimiento/periodo).

---

## 5. Próximos pasos sugeridos (orden)

1. [HECHO] Análisis exploratorio + semáforo por reglas sobre el Excel (seguro, sin BD).
2. Resolver preguntas 1–4 (dato) y 8–10 (privacidad) con el dueño / analista / legal.
3. Prueba de cruce por RUN contra la BD real (pregunta 11).
4. Diseñar tabla `asistencia_mensual` e ingesta (pregunta 12).
5. Llevar el semáforo escolar al dashboard (vista SLEP + vista colegio).
6. Cuando haya historia multi-año: evaluar modelo predictivo de deserción.
7. Incorporar jardines VTF (vista separada) cuando estén en la BD.

---

## 6. Archivos del análisis (carpeta `salida/`)

| Archivo | Contenido |
|---|---|
| `00_informe_calidad.txt` | Diagnóstico del dato + segmentación |
| `01_duplicados_alumno_mes.csv` | 9 alumnos en 2 colegios el mismo mes |
| `02_trayectoria_por_alumno.csv` | 1 fila por alumno escolar: pct mar→ago, promedio, tendencia, riesgo |
| `03_resumen_por_establecimiento.csv` | Ranking de asistencia por colegio (escolar) |
| `04_riesgo_por_establecimiento.csv` | Conteo rojo/amarillo/verde por colegio |
| `05_lista_prioridad_riesgo.csv` | Alumnos rojo+amarillo (lista accionable) |
| `06_resumen_jardines_vtf.csv` | Jardines VTF, descriptivo, aparte |
| `07_revisar_posible_retiro.csv` | Casos 0%/1 mes a revisar vigencia |

El script que los genera: `analisis_asistencia.py` (solo lee el Excel, no toca la BD).
