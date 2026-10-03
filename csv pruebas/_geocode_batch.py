# -*- coding: utf-8 -*-
"""BATCH de geocodificacion confiable (Nominatim) para estudiantes con MATRICULA 2026.
- Bounding box Region de Valparaiso + validacion estricta de comuna.
- Guarda lat/long + geo_precision='nominatim_calle' SOLO si la comuna coincide.
- Reanudable: salta los que ya tienen latitud. Guarda por cada resultado (commit por lote).
- Rate limit 1 req/seg (respetando la politica de uso de Nominatim).

Uso:
  python _geocode_batch.py           -> procesa TODO el universo 2026 pendiente
  python _geocode_batch.py 100       -> procesa solo 100 (para prueba de escritura)
"""
import os
import sys
import re
import time
import json
import unicodedata
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from database import get_db_connection  # noqa: E402

LIMITE = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else None

NOMINATIM = "https://nominatim.openstreetmap.org/search"
UA = "SLEP-Valparaiso-Matriculas/1.0 (geocodificacion RGM; contacto: SLEP Valparaiso)"
VIEWBOX = "-72.0,-32.0,-70.0,-33.6"  # Region de Valparaiso (continental)

RUIDO_RE = re.compile(
    r"\b(CASA|DEPTO|DPTO|DEPARTAMENTO|BLOCK|BLOQUE|MANZANA|MZ|SITIO|PARCELA|PISO|"
    r"COND|CONDOMINIO|PBLA|POBL|BARRIO|SECTOR|PASAJE INTERIOR|ESQ)\b\.?\s*[\dA-Z\-\.]*",
    re.IGNORECASE,
)
CERRO_RE = re.compile(r"\bC(?:ERRO|[º°])\s+[A-ZÁÉÍÓÚÑa-z]+.*$", re.IGNORECASE)


def sin_tildes(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").upper()


def limpiar_calle(calle):
    c = calle or ""
    c = RUIDO_RE.sub(" ", c)
    c = CERRO_RE.sub(" ", c)
    c = c.replace(",", " ")
    c = re.sub(r"N[º°]\s*", " ", c)
    return " ".join(c.split()).strip(" .,-")


def limpiar_numero(numero):
    if not numero:
        return ""
    m = re.search(r"\d{1,5}", numero)
    return m.group(0) if m else ""


def geocode(street, comuna):
    params = urllib.parse.urlencode({
        "format": "json", "street": street, "city": comuna,
        "county": "Region de Valparaiso", "country": "Chile", "countrycodes": "cl",
        "viewbox": VIEWBOX, "bounded": "1", "addressdetails": "1", "limit": 1,
    })
    req = urllib.request.Request(f"{NOMINATIM}?{params}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as resp:
        data = json.loads(resp.read().decode())
    if data:
        d = data[0]
        return d["lat"], d["lon"], d.get("display_name", ""), d.get("address", {})
    return None, None, None, None


def comuna_coincide(comuna_esperada, addr):
    comuna_norm = sin_tildes(comuna_esperada)
    campos = [sin_tildes(addr.get(k, "")) for k in ("city", "town", "municipality", "village")]
    return any(
        comuna_norm == m or (m and comuna_norm in m) or (m and m in comuna_norm and len(m) > 4)
        for m in campos if m
    )


conn = get_db_connection()
cur = conn.cursor()
sql = """
    SELECT DISTINCT e.id_estudiante, e.run_ipe, e.calle, e.numero, e.comuna
    FROM estudiante e
    JOIN matricula m ON m.id_estudiante = e.id_estudiante
    WHERE m.anio_escolar = 2026
      AND e.calle IS NOT NULL AND e.comuna IS NOT NULL
      AND (e.latitud IS NULL OR e.latitud = '')
    ORDER BY e.id_estudiante
"""
if LIMITE:
    sql += f" LIMIT {LIMITE}"
cur.execute(sql)
filas = cur.fetchall()
cur.close()

total = len(filas)
print(f"Universo a procesar (matricula 2026, sin geo): {total}")
print(f"Estimado: ~{total // 60} min a 1 req/seg\n")

guardados = 0
descartados = 0
sin_res = 0
errores = 0

wcur = conn.cursor()
for i, (id_est, run_ipe, calle, numero, comuna) in enumerate(filas, 1):
    street = f"{limpiar_numero(numero)} {limpiar_calle(calle)}".strip()
    try:
        lat, lon, disp, addr = geocode(street, comuna)
    except Exception as e:
        errores += 1
        if errores <= 5:
            print(f"  [ERROR] {run_ipe}: {e}")
        time.sleep(2)
        continue

    if lat and addr and comuna_coincide(comuna, addr):
        wcur.execute(
            "UPDATE estudiante SET latitud=%s, longitud=%s, geo_precision='nominatim_calle' WHERE id_estudiante=%s",
            (str(lat), str(lon), id_est),
        )
        guardados += 1
    elif lat:
        descartados += 1  # resultado en otra comuna -> no guardamos
    else:
        sin_res += 1

    if i % 50 == 0:
        conn.commit()
        print(f"  [{i}/{total}] guardados={guardados} descartados={descartados} sin_res={sin_res} err={errores}")

    time.sleep(1.1)

conn.commit()
wcur.close()
conn.close()

print("\n" + "=" * 60)
print(f"FIN. Procesados={total}")
print(f"  guardados (confiables): {guardados}")
print(f"  descartados (otra comuna): {descartados}")
print(f"  sin resultado: {sin_res}")
print(f"  errores: {errores}")
