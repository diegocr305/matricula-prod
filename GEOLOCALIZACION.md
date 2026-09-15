# Geolocalización de estudiantes (direcciones → latitud/longitud)

Documento de proceso: qué se hizo para estructurar y geolocalizar las direcciones
de los estudiantes a partir del Excel RGM 2026, y qué falta por hacer.

Última actualización: 2026-09-06

---

## Objetivo

Convertir la dirección de cada estudiante en coordenadas (latitud/longitud) para
poder ubicarlos en un mapa. Para eso primero hubo que **estructurar** la dirección
(que venía como texto libre en un solo campo) y luego **geocodificarla**.

---

## Modelo de datos (tabla `matriculas.estudiante`)

Columnas relacionadas con dirección:

| Columna | Tipo | Descripción |
|---|---|---|
| `domicilio` | varchar | Dirección completa (campo legado/compuesto). Se recompone desde los campos estructurados. |
| `calle` | varchar | Calle/avenida (dato concreto para geocodificar). |
| `numero` | varchar | Número (puede ser "S/N", "123-B"). |
| `sector` | varchar | Cerro / población / villa (solo a veces). |
| `comuna` | varchar | Comuna. |
| `latitud` | varchar | Latitud (WGS84). |
| `longitud` | varchar | Longitud (WGS84). |
| `geo_precision` | varchar | Origen/confianza de la coordenada. Hoy: `'nominatim_calle'`. NULL = sin geocodificar. |

> La **fuente de verdad** de la dirección son los campos estructurados
> (`calle/numero/sector/comuna`). `domicilio` se arma concatenándolos:
> `"<calle> <numero>, <sector>, <comuna>"` (saltando los vacíos).

---

## Lo que ya se hizo

### 1. Carga de direcciones desde el Excel RGM 2026
- El Excel `registro_general_matricula_2026 (1).xlsx` trae la dirección **ya separada**
  en columnas: `calle`, `numeracion`, `cerro_barrio_sector_localidad`, `comuna`.
- Se cruzó por `run_ipe` (`rut_est` + `-` + `dv_est`) contra la tabla `estudiante`.
- Se poblaron `calle/numero/sector/comuna` en **11.599 estudiantes** que calzaban.
- Limpieza: números que venían como `119.0` → `119`.

### 2. Separación de las direcciones antiguas (parser)
- ~15.956 estudiantes tenían la dirección solo en el campo `domicilio` (texto en un cuadro).
- Se escribió un parser que separa `domicilio` → `calle/numero/sector/comuna`:
  - Detecta la **comuna** al final (lista de comunas de la Región de Valparaíso + principales de otras regiones).
  - Detecta el **número** (prioriza el que va tras CASA/DEPTO; respeta calles con número-nombre como "21 de Mayo", "1 Norte").
  - Detecta el **sector** por marcadores (`C/`, `Cº`, `CERRO`, `POBL`, `VILLA`, `PLAYA ANCHA`, etc.).
  - **Limpia la calle** cortando en el primer marcador de sector/micro (CASA, DEPTO, BLOCK, CONDOMINIO...),
    para que quede geocodificable (nombre + número), sin el detalle interno.
- Se aplicaron 3 pasadas iterativas mejorando la calidad. Resultado: la mayoría quedó
  bien separada; el residuo con ruido bajó de 3.835 a ~1.326 calles.
- Se normalizaron las comunas (unificar `VALPARAÍSO`/`Valparaíso`, `Viña Del Mar`/`Viña del Mar`).

### 3. Geocodificación con Nominatim (OpenStreetMap) — EN CURSO / PAUSADA
- Servicio: **Nominatim** (gratuito, ya usado en el alta de estudiantes). No se usa Google (sin API key).
- Configuración **confiable** (para no meter coordenadas erróneas):
  - **Bounding box** de la Región de Valparaíso (`viewbox=-72.0,-32.0,-70.0,-33.6` + `bounded=1`).
  - Query estructurada: `street` (número + calle limpia), `city` (comuna), `county` (Región de Valparaíso), `country` (Chile).
  - **Validación estricta de comuna**: solo se guarda la coordenada si el municipio del
    resultado (`address.city/town/municipality/village`) coincide con la comuna del alumno.
    Si cae en otra comuna (ej. Santiago, Los Andes, Quilpué), se descarta.
  - Rate limit: 1 request/segundo (política de uso de Nominatim).
- **Alcance actual: solo estudiantes con matrícula 2026** (los históricos/otros años no son relevantes por ahora).
- Estado al pausar:
  - Universo 2026 con dirección: ~12.676 estudiantes.
  - **Geocodificados confiables hasta ahora: ~410** (`geo_precision='nominatim_calle'`).
  - **Pendientes: ~12.266**.
- Tasa de acierto confiable observada: **~38-40%**. El resto no resuelve porque muchas
  calles de cerros/pasajes/poblaciones no están en OpenStreetMap, o por ruido residual en la calle.
- El proceso se detuvo (la conexión al pooler de Supabase se cierra en corridas largas).
  El script es **reanudable**: salta los que ya tienen `latitud`.

---

## Lo que falta por hacer

### A) Terminar el batch de geocodificación 2026 (pendiente: ~12.266)
- Volver a correr el script de batch (ver más abajo). Es reanudable: retoma donde quedó.
- A 1 req/seg tarda ~3.5 h el universo completo. Como la conexión se corta en corridas
  largas, conviene:
  - correrlo por tramos (el `LIMIT` del query o dejarlo reanudar tras cada corte), o
  - agregar reconexión automática al script si se corta el pooler.
- Solo guarda coordenadas confiables (comuna validada). Resultado esperado: ~5.000 alumnos
  2026 ubicados con certeza. El resto queda sin coordenada (nunca con dato falso).

### B) Mejorar cobertura (opcional, para el ~60% que no resuelve)
- **Fallback a nivel comuna/sector**: para los que no resuelven a nivel calle, usar el
  centro de la comuna o del cerro como coordenada aproximada, marcándola con
  `geo_precision='aproximada_comuna'` para distinguirla de la exacta.
- **Google Maps Geocoding**: más preciso, pero es de pago y requiere API key. Evaluar si
  hay presupuesto. El campo `geo_precision` permite mezclar orígenes sin confundirlos.

### C) Geocodificar al crear/editar (bajo demanda) — recomendado a futuro
- Que el alta y la edición de estudiante geocodifiquen `calle+numero+comuna` al guardar
  (o mediante el buscador visual de Nominatim que ya existe en el alta), para que los
  nuevos ingresos 2026 queden ubicados automáticamente y validados por un humano.

### D) Mapa en el frontend
- Una vez con coordenadas, mostrar a los estudiantes en un mapa (por establecimiento,
  por sector, etc.). Aún no implementado.

---

## Cómo correr / reanudar el batch de geocodificación

Script (temporal, en `csv pruebas/`, NO versionado): `_geocode_batch.py`.
Requiere el backend configurado (usa `backend/database.py` → `DATABASE_URL`).

```
# desde csv pruebas/
python _geocode_batch.py           # procesa todo el universo 2026 pendiente
python _geocode_batch.py 100       # procesa solo 100 (prueba)
```

Lógica del script:
- Selecciona estudiantes con `matricula.anio_escolar = 2026`, con `calle` y `comuna`,
  y sin `latitud` (por eso es reanudable).
- Geocodifica con Nominatim (bounding box Valparaíso + validación de comuna).
- Guarda `latitud`, `longitud`, `geo_precision='nominatim_calle'` solo si la comuna coincide.
- Commit cada 50 registros (el progreso se conserva aunque se corte).

Consultar avance en Supabase:
```sql
SET search_path TO matriculas, public;
-- geocodificados confiables
SELECT COUNT(*) FROM estudiante WHERE geo_precision = 'nominatim_calle';
-- pendientes de 2026
SELECT COUNT(DISTINCT e.id_estudiante)
FROM estudiante e JOIN matricula m ON m.id_estudiante = e.id_estudiante
WHERE m.anio_escolar = 2026 AND e.calle IS NOT NULL AND e.comuna IS NOT NULL
  AND (e.latitud IS NULL OR e.latitud = '');
```

---

## Respaldos (Supabase, schema `matriculas`)

Por si hay que revertir la estructuración de direcciones:
- `backup_direccion_estudiante_20260906` — antes de agregar columnas estructuradas.
- `backup_domicilio_estudiante_20260906` — antes de cargar direcciones del Excel.
- `backup_direccion_pre_parser_20260906` — antes de separar con el parser (id, run_ipe, calle, numero, sector, comuna, domicilio).

Ejemplo de reversión de la estructuración:
```sql
UPDATE matriculas.estudiante e
SET calle=b.calle, numero=b.numero, sector=b.sector, comuna=b.comuna, domicilio=b.domicilio
FROM matriculas.backup_direccion_pre_parser_20260906 b
WHERE e.id_estudiante = b.id_estudiante;
```
