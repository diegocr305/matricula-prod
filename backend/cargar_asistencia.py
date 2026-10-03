# -*- coding: utf-8 -*-
"""
cargar_asistencia.py
Carga el extracto mensual de asistencia (matricula_slepv_2026) a la tabla
matriculas.asistencia_mensual, enlazando por RUN con la tabla estudiante.

DRY-RUN por defecto: no escribe nada; solo reporta qué cargaría y qué no enlaza.
Con --apply hace UPSERT (idempotente por la llave única alumno/mes/establecimiento).

Requisito: correr antes apply_asistencia_migration.py --apply.
Recomendado: cargar DESPUÉS de incorporar los 861 alumnos nuevos, para que el
match sea ~100% (hoy escolar enlaza 96,9%; los que faltan son esos 861).

Uso (desde backend/):
    python cargar_asistencia.py                 # DRY-RUN
    python cargar_asistencia.py --apply          # carga (UPSERT)
    python cargar_asistencia.py --excel "ruta.xlsx"
"""
import argparse
import io
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from psycopg2.extras import execute_values

sys.path.insert(0, str(Path(__file__).resolve().parent))
from database import get_db_connection, close_db_pool

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

EXCEL_DEFAULT = (Path(__file__).resolve().parent.parent / "csv pruebas" /
                 "asistencia" / "matricula_slepv_2026 (1).xlsx")

TIPO_VTF = "Jardines VTF"
PATRONES_EXCLUIR = ["ADULTO", "EDUCACION INTEGRADA DE ADULTOS", "ESPECIAL"]


def norm(rut, dv=None):
    if rut is None:
        return ""
    base = str(rut) + ("" if dv is None else str(dv))
    return re.sub(r"[.\-\s]", "", base).upper().replace(".0", "")


def val(x):
    if x is None:
        return None
    s = str(x).strip()
    return None if s in ("", "nan", "NaN", "<NA>", "None") else s


def segmentar(df):
    glosa = df["glosa_ensenanza"].fillna("").str.upper()
    nombre = df["nombre_establecimiento"].fillna("").str.upper()
    es_excl = False
    for p in PATRONES_EXCLUIR:
        es_excl = es_excl | glosa.str.contains(p) | nombre.str.contains(p)
    df["segmento"] = np.where(es_excl, "excluido",
                              np.where(df["tipo_establecimiento"] == TIPO_VTF, "vtf", "escolar"))
    return df


def main():
    ap = argparse.ArgumentParser(description="Carga asistencia (DRY-RUN por defecto)")
    ap.add_argument("--excel", default=str(EXCEL_DEFAULT))
    ap.add_argument("--apply", action="store_true", help="Ejecuta el UPSERT (si no, DRY-RUN)")
    args = ap.parse_args()

    print("=" * 60)
    print("CARGA DE ASISTENCIA ->", "APLICAR" if args.apply else "DRY-RUN (no escribe)")
    print("=" * 60)

    df = pd.read_excel(Path(args.excel))
    df = segmentar(df)
    df["run_norm"] = [norm(r, d) for r, d in zip(df["rut_est"], df["dv_est"])]
    print(f"Filas en el Excel: {len(df):,}")

    conn = get_db_connection()
    cur = conn.cursor()

    # Mapas de la base: RUN -> id_estudiante ; rbd -> id_establecimiento
    cur.execute("SELECT id_estudiante, upper(replace(replace(replace(run_ipe,'.',''),'-',''),' ','')) "
                "FROM matriculas.estudiante")
    run_to_id = {r[1]: r[0] for r in cur.fetchall()}
    cur.execute("SELECT id_establecimiento, rbd FROM matriculas.establecimiento")
    rbd_to_id = {str(r[1]).strip(): r[0] for r in cur.fetchall()}

    a_cargar, sin_estudiante = [], 0
    for _, r in df.iterrows():
        id_est = run_to_id.get(r["run_norm"])
        if id_est is None:
            sin_estudiante += 1
            continue
        rbd = str(r.get("rbd")).strip().replace(".0", "")
        a_cargar.append((
            id_est, r["run_norm"], rbd_to_id.get(rbd), rbd,
            int(r["año_academico"]), int(r["mes_codigo"]), val(r.get("mes_glosa")),
            float(r["pct_asist"]), val(r.get("rangos_asistencia")), val(r.get("asistencia")),
            r["segmento"], val(r.get("nivel")), val(r.get("curso")),
            int(r["cod_ens"]) if pd.notna(r.get("cod_ens")) else None, val(r.get("PIE")),
        ))

    print(f"\nFilas que ENLAZAN con un estudiante : {len(a_cargar):,}")
    print(f"Filas SIN estudiante en la base      : {sin_estudiante:,} (se omiten; son de los 861 no cargados / jardines VTF)")

    if not args.apply:
        conn.rollback(); cur.close(); conn.close(); close_db_pool()
        print("\nDRY-RUN: no se escribió nada. Usa --apply para cargar.")
        print("(Recordatorio: carga después de incorporar los 861 nuevos.)")
        sys.stdout.flush()
        return

    # Para una carga limpia e idempotente: vaciar el año que se recarga y re-insertar
    # por lotes con execute_values (mucho más rápido que executemany sobre el pooler).
    anios = sorted({f[4] for f in a_cargar})
    sql = """
        INSERT INTO matriculas.asistencia_mensual
          (id_estudiante, run_ipe, id_establecimiento, rbd, anio_academico, mes_codigo,
           mes_glosa, pct_asist, rango_asistencia, glosa_asistencia, segmento, nivel,
           curso, cod_ensenanza, pie)
        VALUES %s
    """
    # Cerramos la conexión del pool (ya no la usamos) y abrimos una DEDICADA
    # para la carga masiva, con autocommit controlado por lote.
    cur.close(); conn.close(); close_db_pool()

    import psycopg2
    import config as _cfg
    wconn = psycopg2.connect(_cfg.DATABASE_URL)
    wconn.cursor().execute("SET search_path TO matriculas, public")
    wcur = wconn.cursor()
    try:
        wcur.execute("DELETE FROM matriculas.asistencia_mensual WHERE anio_academico = ANY(%s)",
                     (anios,))
        wconn.commit()
        print(f"  (limpieza previa del/los año(s) {anios}: {wcur.rowcount:,} filas)")
        sys.stdout.flush()
        total = 0
        LOTE = 5000
        for i in range(0, len(a_cargar), LOTE):
            chunk = a_cargar[i:i + LOTE]
            execute_values(wcur, sql, chunk, page_size=LOTE)
            wconn.commit()
            total += len(chunk)
            print(f"  cargadas {total:,}/{len(a_cargar):,}...")
            sys.stdout.flush()
        print(f"\n>>> CARGA APLICADA: {total:,} filas. <<<")
    except Exception as e:
        wconn.rollback()
        print(f"\nERROR durante la carga. Detalle: {e}")
        sys.exit(1)
    finally:
        wcur.close(); wconn.close()
    sys.stdout.flush()


if __name__ == "__main__":
    main()
    sys.exit(0)
