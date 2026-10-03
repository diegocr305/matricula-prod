# -*- coding: utf-8 -*-
"""
HERRAMIENTA 2 — DIAGNÓSTICO de solo lectura (estado para producción).

Qué hace (NO modifica nada):
  - Reporta conteos por año y por tabla.
  - Cruza el Excel del formulario 2026 contra la base por RUN y clasifica:
      * en_excel_y_base      -> estudiante existe (se actualizará)
      * solo_excel (NUEVOS)  -> hay que crearlos (los ~860)
      * en_base_no_en_excel  -> matrículas 2026 que no vienen en el Excel (revisar)
  - Identifica estudiantes cuya ÚNICA matrícula es 2026 (los ~2.325).
  - Reporta el dato de prueba de 2027 (piloto renovación).
  - Exporta CSVs a produccion/salida/ para revisión y gestión.

Uso (desde backend/):
    python produccion/02_diagnostico.py
    python produccion/02_diagnostico.py --excel "ruta/al.xlsx"
"""
import argparse
import csv
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database import get_db_connection, close_db_pool  # noqa: E402

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI / "salida"
SALIDA.mkdir(exist_ok=True)
EXCEL_DEFAULT = (AQUI.parent.parent / "csv pruebas" /
                 "registro_general_matricula_2026 (1).xlsx")


def norm(rut) -> str:
    """Normaliza RUN quitando separadores y a mayúscula (para comparar)."""
    if rut is None:
        return ""
    return re.sub(r"[.\-\s]", "", str(rut)).upper().replace(".0", "")


def exportar(nombre, cols, filas):
    ruta = SALIDA / nombre
    with open(ruta, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(cols)
        w.writerows(filas)
    return ruta, len(filas)


def main():
    ap = argparse.ArgumentParser(description="Diagnóstico de solo lectura para producción")
    ap.add_argument("--excel", default=str(EXCEL_DEFAULT))
    args = ap.parse_args()

    excel_path = Path(args.excel)
    if not excel_path.exists():
        print(f"ERROR: no existe el Excel: {excel_path}")
        sys.exit(1)

    print("=" * 64)
    print("DIAGNÓSTICO (SOLO LECTURA) — estado para producción")
    print("=" * 64)

    # ---- Excel ----
    df = pd.read_excel(excel_path)
    df["run_norm"] = (df["rut_est"].astype("Int64").astype(str) +
                      df["dv_est"].astype(str)).map(norm)
    df = df[df["run_norm"] != "<NA>"]
    excel_idx = {}
    for _, r in df.iterrows():
        if r["run_norm"] and r["run_norm"] not in excel_idx:
            excel_idx[r["run_norm"]] = r
    ruts_excel = set(excel_idx.keys())
    print(f"\nExcel 2026 (formulario escuelas): {len(df):,} filas, "
          f"{len(ruts_excel):,} RUN únicos")

    conn = get_db_connection()
    cur = conn.cursor()

    # ---- Conteos por año ----
    print("\n--- Matrículas por año (base real) ---")
    cur.execute("SELECT anio_escolar, count(*) FROM matriculas.matricula "
                "GROUP BY anio_escolar ORDER BY anio_escolar")
    for a, c in cur.fetchall():
        print(f"   {a}: {c:,}")

    # ---- Estudiantes base ----
    cur.execute("SELECT id_estudiante, run_ipe, nombres, apellido_paterno, "
                "apellido_materno FROM matriculas.estudiante")
    run_to_est = {}
    for id_est, run, nom, ap, am in cur.fetchall():
        run_to_est[norm(run)] = (id_est, run, nom, ap, am)
    ruts_base = set(run_to_est.keys())

    # ---- Clasificación del cruce ----
    en_ambos = ruts_excel & ruts_base
    solo_excel = ruts_excel - ruts_base       # NUEVOS (los ~860)
    print("\n--- Cruce Excel vs base (por RUN) ---")
    print(f"   en Excel y en base : {len(en_ambos):,}  (se actualizan)")
    print(f"   solo en Excel      : {len(solo_excel):,}  (NUEVOS -> crear + avisar SIGE)")

    # 860 nuevos -> CSV para gestión con SIGE
    filas_nuevos = []
    for run in sorted(solo_excel):
        r = excel_idx[run]
        filas_nuevos.append([
            run, f"{r.get('rut_est')}-{r.get('dv_est')}",
            r.get("nombres"), r.get("apellido_paterno"), r.get("apellido_materno"),
            r.get("rbd"), r.get("curso"), r.get("tipo_enseñanza"),
        ])
    ruta, n = exportar("860_nuevos_para_sige.csv",
                       ["run_norm", "rut", "nombres", "apellido_paterno",
                        "apellido_materno", "rbd", "curso", "tipo_ensenanza"],
                       filas_nuevos)
    print(f"   -> {ruta.name} ({n:,} filas)")

    # ---- Estudiantes cuya única matrícula es 2026 (los ~2.325) ----
    cur.execute("""
        SELECT e.id_estudiante, e.run_ipe, e.nombres, e.apellido_paterno
        FROM matriculas.estudiante e
        WHERE EXISTS (SELECT 1 FROM matriculas.matricula m
                      WHERE m.id_estudiante=e.id_estudiante AND m.anio_escolar=2026)
          AND NOT EXISTS (SELECT 1 FROM matriculas.matricula m
                          WHERE m.id_estudiante=e.id_estudiante AND m.anio_escolar<>2026)
    """)
    solo26 = cur.fetchall()
    filas_solo26 = []
    for id_est, run, nom, ap in solo26:
        en_excel = "SI" if norm(run) in ruts_excel else "NO"
        filas_solo26.append([id_est, run, nom, ap, en_excel])
    ruta, n = exportar("2325_solo_2026.csv",
                       ["id_estudiante", "run_ipe", "nombres", "apellido_paterno",
                        "esta_en_excel"], filas_solo26)
    sin_excel = sum(1 for f in filas_solo26 if f[4] == "NO")
    print(f"\n--- Estudiantes cuya ÚNICA matrícula es 2026: {len(solo26):,} ---")
    print(f"   de ellos, NO están en el Excel: {sin_excel:,} (revisar: ¿prueba o no reportado?)")
    print(f"   -> {ruta.name}")

    # ---- Matrículas 2026 en base cuyo estudiante NO está en el Excel ----
    cur.execute("""
        SELECT m.id_matricula, e.run_ipe, e.nombres, e.apellido_paterno,
               m.id_establecimiento, m.curso, m.estado
        FROM matriculas.matricula m
        JOIN matriculas.estudiante e ON e.id_estudiante=m.id_estudiante
        WHERE m.anio_escolar=2026
    """)
    base_no_excel = []
    for idm, run, nom, ap, idest, curso, estado in cur.fetchall():
        if norm(run) not in ruts_excel:
            base_no_excel.append([idm, run, nom, ap, idest, curso, estado])
    ruta, n = exportar("matriculas_2026_no_en_excel.csv",
                       ["id_matricula", "run_ipe", "nombres", "apellido_paterno",
                        "id_establecimiento", "curso", "estado"], base_no_excel)
    print(f"\n--- Matrículas 2026 en base cuyo RUN NO está en el Excel: {n:,} ---")
    print(f"   (revisar caso a caso; NO se borran a ciegas)  -> {ruta.name}")

    # ---- Dato de prueba 2027 ----
    print("\n--- Año 2027 (piloto renovación, se tratará como prueba) ---")
    cur.execute("SELECT count(*), count(DISTINCT id_estudiante), "
                "count(DISTINCT id_establecimiento) FROM matriculas.matricula "
                "WHERE anio_escolar=2027")
    t, est, col = cur.fetchone()
    print(f"   matrículas 2027: {t:,} | estudiantes: {est:,} | establecimientos: {col}")
    cur.execute("SELECT estado_renovacion, count(*) FROM matriculas.matricula "
                "WHERE anio_escolar=2027 GROUP BY estado_renovacion")
    for er, c in cur.fetchall():
        print(f"      estado_renovacion={er}: {c:,}")
    cur.execute("SELECT count(*) FROM matriculas.firma_matricula WHERE anio_escolar=2027")
    print(f"   firmas 2027: {cur.fetchone()[0]:,}")

    cur.close()
    conn.close()
    close_db_pool()

    print("\nArchivos de diagnóstico en:", SALIDA)
    for f in sorted(SALIDA.glob("*.csv")):
        print("  -", f.name)
    print("\nTodo fue SOLO LECTURA. No se modificó la base.")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
    sys.exit(0)
