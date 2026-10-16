# -*- coding: utf-8 -*-
"""
WORKER MANUAL — Geocodificación de direcciones pendientes (DRY-RUN por defecto).

Qué hace
========
Procesa la "cola" de estudiantes que necesitan coordenadas: aquellos con una
dirección geocodificable (domicilio con número + comuna) pero SIN latitud/longitud.
Consulta Nominatim (OpenStreetMap) UNO POR UNO, respetando su límite de ~1 req/seg
(pausa configurable, por defecto 1.1 s), y guarda lat/lon en `estudiante`.

Por qué un worker aparte (y no al guardar la ficha)
===================================================
Nominatim público permite ~1 request/segundo y puede bloquear la IP si se abusa.
Si se geocodificara al guardar, dos funcionarios validando a la vez dispararían
llamadas simultáneas y podrían hacer que OSM bloquee. En su lugar:
  - Al editar/crear la ficha, el backend solo MARCA al alumno como pendiente
    (pone latitud/longitud en NULL). Instantáneo, sin llamar a OSM.
  - Este worker procesa la cola de a uno, en un solo proceso secuencial, por lo
    que NUNCA supera el límite, sin importar cuántos editen al mismo tiempo.
  - El Panel de Control luego solo LEE las coordenadas ya guardadas (instantáneo).

Qué es "pendiente de geocodificar"
==================================
estudiante con: domicilio que contiene un número (geocodificable), comuna no vacía,
latitud IS NULL, y con matrícula (para acotar a alumnos reales del/los colegio(s)).

Uso (desde backend/)
====================
    python produccion/geocodificar_pendientes.py                 # DRY-RUN (no escribe)
    python produccion/geocodificar_pendientes.py --apply         # geocodifica y guarda
    python produccion/geocodificar_pendientes.py --apply --limite 200
    python produccion/geocodificar_pendientes.py --apply --establecimiento 17
    python produccion/geocodificar_pendientes.py --apply --pausa 1.2

Recomendado: correrlo acotado a un colegio la primera vez (--establecimiento 17).
A ~1.1 s por alumno, 669 alumnos tardan ~12-13 min. Es seguro re-ejecutarlo:
solo toma los que siguen sin coordenadas.

Requiere: requests (ya en requirements).
"""
import argparse
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database import get_db_connection, close_db_pool  # noqa: E402
from services.dashboard_service import limpiar_direccion_geo  # noqa: E402

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Nominatim EXIGE un User-Agent identificable (su política de uso). Sin esto, bloquea.
USER_AGENT = "RGM-SLEP-Valparaiso/1.0 (geocodificacion matricula; contacto: tecnologia@slepvalparaiso.cl)"


def geocodificar(direccion: str, pausa: float):
    """Devuelve (lat, lon) como strings, o (None, None) si no hay match."""
    try:
        resp = requests.get(
            NOMINATIM_URL,
            params={"format": "json", "limit": 1, "countrycodes": "cl", "q": direccion},
            headers={"User-Agent": USER_AGENT, "Accept-Language": "es"},
            timeout=20,
        )
        if resp.status_code == 429:
            # Too Many Requests: esperar más y reintentar una vez.
            time.sleep(pausa * 3)
            resp = requests.get(
                NOMINATIM_URL,
                params={"format": "json", "limit": 1, "countrycodes": "cl", "q": direccion},
                headers={"User-Agent": USER_AGENT, "Accept-Language": "es"},
                timeout=20,
            )
        data = resp.json()
        if isinstance(data, list) and data:
            return (str(data[0]["lat"]), str(data[0]["lon"]))
    except Exception as e:
        print(f"    (error geocodificando: {type(e).__name__}: {e})", flush=True)
    return (None, None)


def main():
    ap = argparse.ArgumentParser(description="Geocodifica estudiantes pendientes (DRY-RUN por defecto)")
    ap.add_argument("--apply", action="store_true", help="Escribe lat/lon en la base (si no, DRY-RUN)")
    ap.add_argument("--limite", type=int, default=100, help="Máx. de alumnos a procesar en esta corrida")
    ap.add_argument("--establecimiento", type=int, default=None, help="Acotar a un id_establecimiento")
    ap.add_argument("--pausa", type=float, default=1.1, help="Segundos entre consultas a OSM (>=1.0)")
    args = ap.parse_args()

    pausa = max(1.0, args.pausa)
    modo = "APLICAR (escribe lat/lon)" if args.apply else "DRY-RUN (no escribe)"
    print("=" * 64)
    print(f"GEOCODIFICACIÓN DE PENDIENTES — Modo: {modo}")
    print(f"Límite: {args.limite} | Pausa: {pausa}s | Establecimiento: {args.establecimiento or 'todos'}")
    print("=" * 64)

    conn = get_db_connection()
    cur = conn.cursor()

    # Cola: alumnos con dirección geocodificable y SIN coordenadas, con matrícula.
    filtro_estab = ""
    params = []
    if args.establecimiento is not None:
        filtro_estab = "AND m.id_establecimiento = %s"
        params.append(args.establecimiento)

    cur.execute(f"""
        SELECT DISTINCT e.id_estudiante, e.calle, e.numero, e.sector, e.comuna, e.domicilio
        FROM estudiante e
        JOIN matricula m ON m.id_estudiante = e.id_estudiante
        WHERE e.latitud IS NULL
          AND e.domicilio IS NOT NULL AND e.domicilio ~ '[0-9]'
          AND e.comuna IS NOT NULL AND trim(e.comuna) <> ''
          {filtro_estab}
        LIMIT %s
    """, tuple(params + [args.limite]))
    filas = cur.fetchall()

    print(f"\nPendientes a procesar en esta corrida: {len(filas)}", flush=True)
    if not filas:
        print("No hay direcciones pendientes de geocodificar con los filtros dados.")
        cur.close(); conn.close(); close_db_pool()
        return

    exitos = 0
    sin_match = 0
    for i, (id_est, calle, numero, sector, comuna, domicilio) in enumerate(filas, 1):
        dir_geo = limpiar_direccion_geo(calle or domicilio, numero, sector, comuna)
        if not args.apply:
            print(f"  [{i}/{len(filas)}] id {id_est}: '{dir_geo}'", flush=True)
            continue

        lat, lon = geocodificar(dir_geo, pausa)
        if lat and lon:
            cur.execute(
                "UPDATE estudiante SET latitud = %s, longitud = %s, geo_precision = 'osm' "
                "WHERE id_estudiante = %s",
                (lat, lon, id_est),
            )
            conn.commit()
            exitos += 1
            print(f"  [{i}/{len(filas)}] id {id_est} OK -> {lat},{lon}  ('{dir_geo}')", flush=True)
        else:
            sin_match += 1
            print(f"  [{i}/{len(filas)}] id {id_est} SIN MATCH  ('{dir_geo}')", flush=True)

        # Respetar el límite de Nominatim (salvo en la última).
        if i < len(filas):
            time.sleep(pausa)

    print(f"\n=== RESUMEN ===", flush=True)
    print(f"  Procesados : {len(filas)}")
    if args.apply:
        print(f"  Geocodificados OK : {exitos}")
        print(f"  Sin match en OSM  : {sin_match}")
        print("  (Re-ejecuta para intentar nuevamente los sin-match o los que falten.)")
    else:
        print("  (DRY-RUN: no se escribió nada. Usa --apply para geocodificar.)")

    cur.close(); conn.close(); close_db_pool(); sys.stdout.flush()


if __name__ == "__main__":
    main()
    sys.exit(0)
