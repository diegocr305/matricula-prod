# Estado actual del proyecto — "dónde quedamos"

Fecha: octubre 2026. Documento de PUNTO DE CONTROL para retomar sin perder el hilo.
Resume los dos frentes activos: (1) el PILOTO del RBD 1520, que es el foco
operativo real, y (2) la ANALÍTICA DE ASISTENCIA, mejora a futuro para el director.

Contexto: la reunión con Dirección Ejecutiva ya ocurrió y fue un éxito. El sistema
RGM está en producción (`matricula.slepvalparaiso.gob.cl`).

---

## FRENTE 1 — Piloto RBD 1520 (Liceo Bicentenario Marítimo) · FOCO ACTUAL

Estado: herramientas y pasos LISTOS; ejecución pendiente del "ya" del dueño y de
conseguir las fechas de nacimiento de los 861 alumnos nuevos.

### Hecho
- Plan de puesta en producción documentado: `backend/produccion/PLAN_PRODUCCION.md`.
- Herramientas (todas DRY-RUN por defecto, en `backend/produccion/`):
  - `01_respaldo.py` (pg_dump; fallback CSV) — PROBADO.
  - `02_diagnostico.py` (solo lectura; genera listas) — PROBADO.
  - `03_reconciliar_2026.py` (UPSERT 2026 desde el Excel del formulario) — PROBADO DRY-RUN.
  - `04_limpiar_2027.py` (borra pruebas 2027 en orden FK) — PROBADO DRY-RUN.
  - `05_piloto_bicentenario.md` (paso a paso de re-ejecución del piloto).
- `apply_prematricula_2027.py` idempotente para pre-crear la renovación 2027 del colegio 17.
- `ESCUELAS_A_CONTACTAR.md` (NO versionado por privacidad): 861 alumnos nuevos en
  52 escuelas, para pedirles fecha de nacimiento + verificar SIGE.

### Pendiente (para arrancar producción del piloto)
1. Conseguir **fecha de nacimiento** de los 861 nuevos (bloquea su creación; el Excel
   no la trae). Vía `ESCUELAS_A_CONTACTAR.md`.
2. Revisar listas de `02_diagnostico.py`: `matriculas_2026_no_en_excel.csv` (2.239)
   y los 596 "solo-2026" sin Excel.
3. Cuando el dueño dé el "ya": respaldo → reconciliar 2026 → limpiar 2027 →
   re-ejecutar piloto (`apply_prematricula_2027.py --apply`) → verificar.
4. Decidir limpieza de usuarios de prueba (ids 1–6 en `usuario`).
5. Confirmar ventana de mantención y dónde se guarda el pg_dump.

### Datos clave de la base (medidos oct 2026)
estudiante 34.163 · matricula 92.192 (2022=20.693, 2023=19.454, 2024=18.359,
2025=18.397, 2026=14.836, 2027=453) · apoderado 13.557. Histórico 2022–2025 (SIGE)
se CONSERVA. 2027 es prueba del piloto (1 establecimiento, RBD 1520).

---

## FRENTE 2 — Analítica de Asistencia · MEJORA A FUTURO (ya entregada en base)

Estado: pestaña FUNCIONAL en producción con datos reales 2026. Es una base para
seguir construyendo cuando el director lo pida. Detalle técnico en steering 10.

### Hecho (desplegado)
- Tabla `matriculas.asistencia_mensual` creada + 88.787 filas 2026 cargadas
  (escolar 80.115 / 14.109 alumnos; vtf y adultos aparte).
- Backend: `routers/asistencia.py` + `services/asistencia_service.py`
  (`/asistencia/resumen`, `/asistencia/anios`). Solo agregados, sin datos personales.
- Frontend: pestaña **Asistencia** (`features/asistencia/PanelAsistencia.tsx`):
  KPIs con flecha de tendencia (último mes vs anterior), semáforo de riesgo por reglas,
  evolución mensual, y ranking de establecimientos MEJORES y PEORES con flecha de
  tendencia por colegio.
- Valores reales 2026: asistencia prom ~82%; semáforo rojo ~2.616 / amarillo ~3.848 /
  verde ~7.625.

### Pendiente (siguiente nivel, cuando se pida)
- **Drill-down macro → micro**: click en colegio → cursos → (con control de acceso)
  lista nominal de alumnos en riesgo. REQUIERE definir antes la política de privacidad
  de menores (quién ve la lista nominal) y validación legal. Marcado *Extremo* en EVALTIC.
- **Asistencia histórica (2022–2025)**: para comparar año contra año (hoy solo 2026).
- **Modelo predictivo de deserción**: cuando haya historia multi-año etiquetada.
- Incorporar **jardines VTF** a la BD y mostrarlos como vista separada.
- Flecha de tendencia por colegio ya está; evaluar comparación año/año cuando haya datos.

### Cómo cargar más asistencia (recurrente)
`backend/cargar_asistencia.py --apply` (idempotente, reemplaza por año; conexión
dedicada + lotes). Re-ejecutar tras cargar los 861 para subir cobertura a ~100%.

---

## Mapa de documentos (para orientarse)
- `.kiro/steering/01`–`09`: arquitectura, auth, operación, servidor, firma, caso borde,
  visión/roadmap, post-reunión DEE, versionado/UI.
- `.kiro/steering/10-analitica-asistencia.md`: dominio asistencia (fuente, reglas, tabla, panel).
- `.kiro/steering/11-plan-produccion.md`: plan de limpieza/reconciliación.
- `.kiro/steering/12-estado-actual.md`: ESTE documento (punto de control).
- `backend/produccion/`: herramientas + PLAN_PRODUCCION.md + pasos piloto.
- `csv pruebas/asistencia/`: análisis exploratorio y cruce (scripts; datos NO versionados).

## Repos / deploy (recordatorio)
- Publicar: `git push prod main`. Servidor: `git pull origin main`.
- Deploy backend: `sudo systemctl restart matriculas-backend`.
- Deploy frontend: `cd frontend-matriculas && npm run build`.
- Ctrl+F5 por caché de Cloudflare. Detalle en steering 03/04.

---

## Último estado desplegado (asistencia)
Commit `8895351` en `prod/main`. Para que el servidor lo refleje, falta que el dueño
corra el `git pull` + restart backend + build frontend (ver steering 04).
