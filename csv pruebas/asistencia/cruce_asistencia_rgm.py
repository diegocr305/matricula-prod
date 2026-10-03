# -*- coding: utf-8 -*-
"""
Cruce de la ASISTENCIA 2026 (archivo de SIGE) contra la base real del RGM.

SOLO LECTURA: no modifica nada. Mide cuántos alumnos del archivo de asistencia
enlazan por RUN con la tabla `estudiante`, y clasifica los que NO enlazan para
entender el porqué (jardines VTF que no están en la BD, adultos, o datos a revisar).

Es la prueba de integración previa a diseñar la tabla `asistencia_mensual`.

Uso (desde backend/ para que tome el .env):
    python ../"csv pruebas"/asistencia/cruce_asistencia_rgm.py
O desde la carpeta de asistencia pasando el path del backend al sys.path (lo hace solo).
"""
import io
import re
import sys
from pathlib import Path

import pandas as pd

# Forzar UTF-8 en la salida (la consola Windows por defecto usa cp1252 y falla
# con caracteres como flechas o acentos en algunos entornos).
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

# Localizar el backend para importar database/config (lee el .env de producción)
AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent               # c:\github\matricula
BACKEND = RAIZ / "backend"
sys.path.insert(0, str(BACKEND))

from database import get_db_connection, close_db_pool  # noqa: E402

EXCEL = AQUI / "matricula_slepv_2026 (1).xlsx"
SALIDA = AQUI / "salida"
SALIDA.mkdir(exist_ok=True)

TIPO_VTF = "Jardines VTF"
PATRONES_EXCLUIR = ["ADULTO", "EDUCACION INTEGRADA DE ADULTOS", "ESPECIAL"]


def norm(rut, dv=None):
    if rut is None:
        return ""
    base = str(rut)
    if dv is not None:
        base = base + str(dv)
    return re.sub(r"[.\-\s]", "", base).upper().replace(".0", "")


def segmentar(df):
    glosa = df["glosa_ensenanza"].fillna("").str.upper()
    nombre = df["nombre_establecimiento"].fillna("").str.upper()
    es_excl = False
    for p in PATRONES_EXCLUIR:
        es_excl = es_excl | glosa.str.contains(p) | nombre.str.contains(p)
    import numpy as np
    df["segmento"] = np.where(es_excl, "excluido",
                              np.where(df["tipo_establecimiento"] == TIPO_VTF, "vtf", "escolar"))
    return df


def main():
    print("=" * 64)
    print("CRUCE ASISTENCIA 2026 vs BASE RGM (solo lectura)")
    print("=" * 64)

    df = pd.read_excel(EXCEL)
    df["run_norm"] = [norm(r, d) for r, d in zip(df["rut_est"], df["dv_est"])]
    df = segmentar(df)

    # 1 fila por alumno (dedup), con su segmento
    alumnos = df.drop_duplicates(subset="run_norm")[
        ["run_norm", "rut_est", "dv_est", "nombres", "a_paterno", "a_materno",
         "segmento", "rbd", "nombre_establecimiento", "curso"]].copy()
    print(f"\nAlumnos únicos en asistencia: {len(alumnos):,}")
    print("Por segmento:")
    print(alumnos["segmento"].value_counts().to_string())

    # Base: RUN normalizados
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT upper(replace(replace(replace(run_ipe,'.',''),'-',''),' ','')) "
                "FROM matriculas.estudiante")
    ruts_base = {r[0] for r in cur.fetchall()}
    print(f"\nRUN en tabla estudiante (base): {len(ruts_base):,}")

    # Match
    alumnos["match"] = alumnos["run_norm"].isin(ruts_base)

    print("\n--- MATCH por segmento ---")
    resumen = (alumnos.groupby("segmento")["match"]
               .agg(total="count", enlazan="sum"))
    resumen["no_enlazan"] = resumen["total"] - resumen["enlazan"]
    resumen["pct_match"] = (resumen["enlazan"] / resumen["total"] * 100).round(1)
    print(resumen.to_string())

    glob = alumnos["match"].mean() * 100
    print(f"\nMatch GLOBAL: {alumnos['match'].sum():,}/{len(alumnos):,} ({glob:.1f}%)")
    esc = alumnos[alumnos["segmento"] == "escolar"]
    if len(esc):
        print(f"Match ESCOLAR (lo que importa): "
              f"{esc['match'].sum():,}/{len(esc):,} ({esc['match'].mean()*100:.1f}%)")

    # Exportar los que NO enlazan, por segmento, para revisión
    no = alumnos[~alumnos["match"]].copy()
    no["rut"] = no["rut_est"].astype(str) + "-" + no["dv_est"].astype(str)
    cols = ["rut", "run_norm", "nombres", "a_paterno", "a_materno",
            "segmento", "rbd", "nombre_establecimiento", "curso"]
    ruta = SALIDA / "08_asistencia_sin_match_en_rgm.csv"
    no[cols].to_csv(ruta, index=False, encoding="utf-8-sig")
    print(f"\nSin match (todos los segmentos): {len(no):,} -> {ruta.name}")

    # Foco: escolares sin match (son los que SÍ deberían estar en la base)
    esc_no = no[no["segmento"] == "escolar"]
    ruta2 = SALIDA / "09_escolares_sin_match_REVISAR.csv"
    esc_no[cols].to_csv(ruta2, index=False, encoding="utf-8-sig")
    print(f"Escolares SIN match (revisar): {len(esc_no):,} -> {ruta2.name}")
    if len(esc_no):
        print("\nTop establecimientos con escolares sin match:")
        print(esc_no["nombre_establecimiento"].value_counts().head(10).to_string())

    cur.close()
    conn.close()
    close_db_pool()
    print("\nTodo fue SOLO LECTURA. No se modificó la base.")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
    sys.exit(0)
