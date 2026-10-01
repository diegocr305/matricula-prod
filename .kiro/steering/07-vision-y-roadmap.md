# Visión, fundamento normativo y roadmap — Sistema RGM SLEP Valparaíso

Estado: documento de VISIÓN para presentación a dirección ejecutiva. No es implementación.
Resumen del "por qué" del proyecto, su base legal, y hacia dónde puede crecer.

## 1. Fundamento normativo (el "por qué" legal)
El sistema materializa el **Registro General de Matrícula (RGM)** exigido por:
- **Art. 28 N°15, Decreto 315/2010 (Mineduc)**: obligación de mantener un registro de
  matrícula actualizado para conservar el Reconocimiento Oficial del Estado.
- **Resolución Exenta 0030/2021 (Superintendencia de Educación)**: autoriza y regula el
  **Registro de Matrícula DIGITAL**. Requisitos que el sistema ya cumple o apunta a cumplir:
  - Correlativo por nivel/modalidad; cronológico; trazabilidad de toda creación/modificación/
    eliminación identificando al usuario (auditoría). [sección 5.1]
  - Contenido mínimo (5.2): correlativo, RUN/IPE, identificación, sexo (Ley 21.120 identidad
    de género), fecha nac., nivel, curso, local, fecha matrícula, **domicilio del alumno**,
    **identificación y contacto de apoderados (domicilio, teléfono, correo)**, retiro con
    fecha y motivo, observaciones (cambio de apoderado/curso).
  - Altas (5.3): exigen **certificado de promoción** y **certificado de traslado/baja**.
  - Conformidad con el **Estándar de Datos para la Educación** del Mineduc.
  - Firma/validación: admite **declaración jurada simple escaneada y cargada** cuando no hay
    firma presencial (respalda el caso borde "firma manual en papel", ver steering 06).
- **Ley 21.180 de Transformación Digital del Estado**: digitalizar un trámite de alto volumen
  usando **SIMPLE + Clave Única** (plataformas de la Secretaría de Gobierno Digital) es
  exactamente su espíritu. Argumento central de posicionamiento.

## 2. El problema que resuelve (tesis central)
Hoy el dato de matrícula nace en **SIGE**, pero no hay control efectivo de que los directores
lo mantengan actualizado ni de su calidad. El sistema:
- Entrega al **funcionario** la herramienta y la responsabilidad de capturar el dato en el
  acto de matrícula, **validado con el apoderado presente**.
- Deja el dato **trazable, firmado (Clave Única) y georreferenciable**.
=> **Mejora la calidad del dato en el origen.** No duplica SIGE: mejora la fuente.

## 3. Estado actual (lo construido y probado)
- Pre-matrícula/renovación 2027 (piloto Liceo Marítimo, RBD 1520).
- Flujo "Confirmar Renovación": actualización obligatoria de domicilio (estudiante y
  apoderado, desglosado para georreferenciar), ficha médica opcional, apoderado titular y
  suplente, botón copiar domicilio.
- Firma del apoderado en SIMPLE con Clave Única -> estado "Firmada" automático (Edge Function).
- Badge de estado de renovación en grilla; bloqueo de emisión de documento si no está firmada.
- Normalización de RUT; promoción de curso correcta (incl. 8° básico -> 1° medio).
- Dashboard (Panel de Control): activos, retiros netos, desglose por nivel/curso, histórico
  desde 2022. **Es descriptivo.**

## 4. Oportunidades de alto valor (roadmap propuesto)
Priorización sugerida: (P1) impacto normativo/financiero directo, (P2) analítica, (P3) predicción.

### P1 — Continuidad del servicio y alerta SAE
Un alumno que postula en el **Sistema de Admisión Escolar (SAE)** puede quedar asignado a
otro establecimiento y **perder continuidad** en el SLEP. Detectar/alertar ese quiebre a
tiempo permite actuar (reasignar, anular, comunicar a la Superintendencia). Diferenciador real.
Requiere: definir fuente de datos SAE (¿integración? ¿carga? ¿consulta manual?).

### P1 — Protección de la subvención (estabilidad financiera)
La subvención se calcula por asistencia en cursos **con Reconocimiento Oficial**. El sistema
debería **alertar** si se intenta matricular en un curso sin reconocimiento, y reportar por
colegio los cursos con/sin reconocimiento. Protege ingresos del SLEP.

### P2 — Georreferenciación y analítica territorial
Con el domicilio desglosado (ya se captura) se puede geolocalizar y analizar distancia
casa-escuela, concentración por comuna/sector, y demanda territorial.
Recomendación técnica de geocodificación:
- **NO usar Google Maps API**: cobra por geocodificación sobre un cupo mínimo (caro a ~14k
  alumnos) y expone datos de menores a un tercero comercial.
- **Usar Nominatim (OpenStreetMap)**, open source y gratuito. Ideal: **auto-hospedado** en el
  servidor con datos de Chile -> geocodifica sin costo por request y sin enviar datos de
  menores a externos. Alternativa inicial: servicio público de Nominatim en lotes nocturnos
  (límite 1 req/seg).
- Validación/autocompletado de direcciones con catálogo de calles/comunas de Valparaíso
  para mejorar calidad del dato en el origen.

### P2/P3 — Analítica avanzada y predicción
Con datos limpios y geolocalizados: tendencias de matrícula, patrones de deserción, y
proyecciones de demanda por comuna. A futuro, modelos predictivos (riesgo de deserción,
proyección de cupos). Referencia conceptual: asignación territorial por domicilio
(modelo tipo "school district" de EE.UU.) para planificación de cupos por área.

## 5. Qué le falta al Dashboard para "subir de nivel" (de descriptivo a accionable)
- **KPIs de proceso de renovación** (del piloto): % renovado, pendientes de firma, por
  renovar, egresados, no renueva — por colegio y curso. Convierte el panel en herramienta
  de gestión del proceso, no solo conteo histórico.
- **Tasa de deserción/retiro** como porcentaje y tendencia, no solo número absoluto.
- **Alertas accionables**: cursos sin reconocimiento oficial, quiebres SAE, apoderados sin
  datos de contacto, direcciones no georreferenciadas.
- **Mapa**: distribución geográfica de alumnos por comuna/sector (cuando exista geocodif.).
- **Comparación entre establecimientos** (vista SLEP): ranking de completitud/calidad del dato.
- **Calidad del dato**: % de fichas completas vs incompletas por colegio (mide la tesis central).

## 6. Mensajes clave para la presentación
1. "No es una idea tecnológica: es **cumplimiento legal digitalizado**" (Res. 0030/2021 + D.315).
2. "Alineado con la **Ley de Transformación Digital** usando SIMPLE + Clave Única."
3. "Mejoramos la **calidad del dato en el origen**, donde SIGE hoy falla."
4. "Probado **end-to-end** con un apoderado real firmando con Clave Única (piloto RBD 1520)."
5. "Habilita **continuidad del servicio, protección de subvención y planificación territorial**."
6. "Geolocalización con **tecnología open source**, sin costo de licencias ni exposición de
   datos de menores a terceros."
