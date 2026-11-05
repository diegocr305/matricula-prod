# Pruebas y QA — Sistema RGM

Estado: INICIAL. Primer set de tests automáticos + guion de QA manual. El objetivo
es detectar regresiones en la lógica crítica (sobre todo tras merges como el del
practicante, steering 13) sin depender solo de que "compile".

## 1. Tests automáticos (pytest) — lógica pura, sin base de datos

Ubicación: `backend/tests/`. Cubren funciones deterministas de alto riesgo que NO
tocan Supabase (100% seguras de correr siempre).

Correr (desde `backend/`):
```
python -m pytest -v
```

### `tests/test_logica_cursos.py` (19 casos)
- **Jerarquía de cursos** (`obtener_rango_curso`): básica=100+grado, media=200+grado,
  parvularia 10-50; valida promoción (+1), repitencia (=), regresión (<) y que la
  transición 8° básico → 1° medio SUBE de rango. Es la lógica que define si un
  alumno promueve/repite (integrada de Bastián) → la de mayor riesgo.
- **Normalización** de texto de curso y formato de nivel.
- **Nombre de apoderado** resumido (vacío → "Pendiente").
- **Parseo de motivos** de retiro (`parsear_texto_motivo`: separa [Motivos]/[Detalles]).
- **Parseo de traslado** (`parsear_traslado_info`: curso origen + folio).

Regla: al tocar `matricula_service.py` (jerarquía/parsers) o la lógica de cursos,
correr pytest antes de commitear. Si un test falla, es una regresión real.

### Qué NO cubren (y por qué)
Los flujos que escriben en la base (crear matrícula, traslado, retiro, cambio de
curso) NO se testean automáticamente porque el `.env` apunta a Supabase de
PRODUCCIÓN y un test no debe crear/borrar datos reales. Para automatizarlos haría
falta una base de pruebas separada (pendiente, ver sección 3). Mientras tanto, se
validan con el QA manual de la sección 2.

## 2. Guion de QA manual (flujos que tocan la base)

Hacer en LOCAL (backend `uvicorn` + `npm run dev`) o en un ambiente de prueba,
NUNCA ensayando sobre datos reales de producción. Flujos nuevos del merge (steering 13):

### A. Jerarquía de cursos (al crear/renovar matrícula)
1. Matricular un alumno en un curso **inferior** al que ya cursó → debe **bloquear**
   con alerta roja (regresión).
2. Mismo curso que el año anterior → alerta de **repitencia** (no bloquea).
3. Curso siguiente → **promoción** (info). Verificar 8° básico → 1° medio = promoción.

### B. Traslado inter-escolar
1. Matricular en Colegio B a un alumno con matrícula activa en Colegio A.
2. Verificar: en A queda **Trasladado** (no infla matrícula activa); en B queda activa.
3. Verificar nota cruzada en auditoría y que se puede adjuntar certificado de traslado.

### C. Encuesta de retiro (confidencialidad)
1. Iniciar retiro → apoderado responde cuestionario.
2. Verificar: respuestas confidenciales quedan en `encuesta_retiro`, NO en
   `observaciones` públicas ni en el snapshot de auditoría.
3. Verificar botón "Motivo Retiro" y el `ModalDetalleMotivo`.

### D. Multi-tenant (aislamiento por colegio)
1. Entrar como usuario rol Colegio → debe ver SOLO su establecimiento en
   Matrículas, Estudiantes y Panel.
2. Intentar consultar una ficha de otro colegio → debe bloquear (403).

### E. No-regresión de lo de Diego
1. Firma SIMPLE / badge `estado_renovacion` en la grilla sigue visible.
2. Pestaña **Asistencia** carga KPIs/semáforo/ranking.
3. Apoderado suplente y normalización de RUT siguen funcionando.

## 3. Pendientes de testing (mejora futura)
- Base de datos de pruebas separada (Supabase branch o Postgres local) para
  testear los flujos con BD sin tocar producción.
- Tests de integración de endpoints con `TestClient` de FastAPI contra esa base.
- CI que corra `pytest` + `npm run build` en cada push (hook o GitHub Actions).

## 4. Factibilidad de un agente/hook
- **Hook `pytest` en Stop/PostToolUse**: factible — correr `python -m pytest` al
  terminar cambios en backend. Rápido (lógica pura, ~2s). Buen candidato.
- **Agente de QA**: puede ejecutar este guion a pedido, pero los flujos con BD
  requieren el ambiente de pruebas de la sección 3 para ser seguros.
