"""
corregir_nombres_apoderado.py
Corrige los nombres/apellidos de apoderados importados que quedaron mal separados
porque en el Excel los TITULARES venían en formato 'APELLIDO APELLIDO, NOMBRES'
(con coma) y la primera versión del importador asumía 'NOMBRES APELLIDO APELLIDO'.

Reutiliza separar_nombre() ya corregida de importar_registro_2026.py y re-aplica
la separación a los apoderados que coincidan por RUT con el Excel.

Uso:
    python corregir_nombres_apoderado.py            # DRY-RUN (muestra qué cambiaría)
    python corregir_nombres_apoderado.py --apply    # aplica
"""
import sys, os, argparse
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_db_connection
from psycopg2.extras import execute_values
from importar_registro_2026 import (
    separar_nombre, rut_apoderado, limpiar, nombre_valido, RUTA_EXCEL_DEFAULT,
)


def procesar(ruta_excel, aplicar=False):
    import pandas as pd
    df = pd.read_excel(ruta_excel, dtype=str)
    print(f"Filas Excel: {len(df)}")

    # Construir mapa rut_apod -> (nombres, pat, mat) CORRECTO desde el Excel.
    correcto = {}
    for _, row in df.iterrows():
        for pref in ("titular", "suplente"):
            rut = rut_apoderado(row.get(f"rut_apoderado_{pref}"), row.get(f"dv_apoderado_{pref}"))
            nom = limpiar(row.get(f"nombre_completo_apoderado_{pref}"))
            if rut and nombre_valido(nom) and rut not in correcto:
                correcto[rut] = separar_nombre(nom)

    conn = get_db_connection(); cur = conn.cursor()
    try:
        cur.execute("SELECT statement_timeout"); 
    except Exception:
        pass
    try:
        cur.execute("SET statement_timeout = 0;"); conn.commit()
    except Exception:
        conn.rollback()

    cur.execute("SELECT id_apoderado, rut_pasaporte, nombres, apellido_paterno, apellido_materno FROM apoderado")
    actuales = cur.fetchall()

    cambios = []  # (nombres, pat, mat, id_apoderado)
    for id_ap, rut, nom, pat, mat in actuales:
        if rut in correcto:
            n, p, m = correcto[rut]
            if (nom or "") != (n or "") or (pat or "") != (p or "") or (mat or "") != (m or ""):
                cambios.append((n, p, m, id_ap))

    print(f"Apoderados a corregir: {len(cambios)}")
    for c in cambios[:8]:
        print(f"  id {c[3]}: nombres='{c[0]}' pat='{c[1]}' mat='{c[2]}'")

    if not aplicar:
        conn.rollback(); print("DRY-RUN: nada escrito."); conn.close(); return

    CHUNK = 1000
    for i in range(0, len(cambios), CHUNK):
        ch = cambios[i:i+CHUNK]
        execute_values(cur, """
            UPDATE apoderado AS a SET
                nombres = v.nombres, apellido_paterno = v.pat, apellido_materno = v.mat
            FROM (VALUES %s) AS v(nombres, pat, mat, id_apoderado)
            WHERE a.id_apoderado = v.id_apoderado
        """, ch, page_size=CHUNK)
        conn.commit()
        print(f"  corregidos {min(i+CHUNK, len(cambios))}/{len(cambios)}")
    print("OK aplicado.")
    conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--excel", default=RUTA_EXCEL_DEFAULT)
    args = ap.parse_args()
    procesar(args.excel, aplicar=args.apply)
