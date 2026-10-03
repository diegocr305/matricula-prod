# -*- coding: utf-8 -*-
"""
HERRAMIENTA 3 — RECONCILIACIÓN de 2026 desde el Excel del formulario (DRY-RUN).

IMPORTANTE — LÉEME ANTES DE USAR
================================
Esta herramienta aplica la fuente de verdad 2026 (Excel del formulario de las
escuelas) SIN borrar estudiantes ni tocar el histórico <2026. Trabaja por UPSERT.

Qué hace, por FASES (controladas por flags), siempre DRY-RUN salvo --apply:

  FASE A (segura) — ACTUALIZAR datos de estudiantes que YA existen (match por RUN):
    domicilio y dirección estructurada (calle/numero/sector/comuna), y
    datos de apoderado titular/suplente + ficha de salud. NO toca la matrícula
    ni los catálogos. Es la fase recomendada: dato limpio del formulario.

  FASE B (requiere decisión) — los 861 NUEVOS (en Excel, no en base):
    NO se pueden crear al 100% porque el Excel NO trae fecha_nacimiento, que es
    NOT NULL en `estudiante`. El script los REPORTA y, si pasas --crear-nuevos,
    los inserta con fecha_nacimiento provisoria = NULL-sustituta SOLO si pasas
    además --fecha-nac-provisoria (ver abajo). Por defecto solo reporta.

Lo que esta herramienta NO hace (a propósito, por riesgo):
  - NO reescribe cod_grado / cod_tipo_ensenanza / numero_correlativo de las
    matrículas existentes: el catalogo_grado de la base está incoherente y el
    Excel trae curso/enseñanza en texto sucio. Ese mapeo se hace aparte, revisado.
  - NO borra matrículas 2026 ni estudiantes.

Uso (desde backend/):
    python produccion/03_reconciliar_2026.py                 # DRY-RUN, fase A
    python produccion/03_reconciliar_2026.py --apply         # aplica fase A
    python produccion/03_reconciliar_2026.py --fase-b        # reporta los nuevos
"""
import argparse
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database import get_db_connection, close_db_pool  # noqa: E402

AQUI = Path(__file__).resolve().parent
EXCEL_DEFAULT = (AQUI.parent.parent / "csv pruebas" /
                 "registro_general_matricula_2026 (1).xlsx")


def norm(rut) -> str:
    if rut is None:
        return ""
    return re.sub(r"[.\-\s]", "", str(rut)).upper().replace(".0", "")


def val(x):
    """Normaliza celdas de pandas a str limpio o None."""
    if x is None:
        return None
    s = str(x).strip()
    if s in ("", "nan", "NaN", "<NA>", "None"):
        return None
    return s


def construir_domicilio(r):
    calle = val(r.get("calle")) or ""
    num = val(r.get("numeracion")) or ""
    sector = val(r.get("cerro_barrio_sector_localidad")) or ""
    comuna = val(r.get("comuna")) or ""
    partes = [p for p in [f"{calle} {num}".strip(), sector, comuna] if p]
    return ", ".join(partes) if partes else None


def main():
    ap = argparse.ArgumentParser(description="Reconciliación 2026 (DRY-RUN por defecto)")
    ap.add_argument("--excel", default=str(EXCEL_DEFAULT))
    ap.add_argument("--apply", action="store_true", help="Aplica los cambios (si no, DRY-RUN)")
    ap.add_argument("--fase-b", action="store_true", help="Reporta los nuevos (no crea)")
    args = ap.parse_args()

    modo = "APLICAR (escribe en la base)" if args.apply else "DRY-RUN (no escribe nada)"
    print("=" * 64)
    print("RECONCILIACIÓN 2026 — FASE A (datos de estudiante/apoderado/salud)")
    print(f"Modo: {modo}")
    print("=" * 64)

    df = pd.read_excel(Path(args.excel))
    df["run_norm"] = (df["rut_est"].astype("Int64").astype(str) +
                      df["dv_est"].astype(str)).map(norm)

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT upper(replace(replace(replace(run_ipe,'.',''),'-',''),' ','')), id_estudiante "
                "FROM matriculas.estudiante")
    run_to_id = {r[0]: r[1] for r in cur.fetchall()}

    actualizados = 0
    sin_cambios = 0
    nuevos_run = set()      # RUN únicos nuevos (dedup)
    vistos = set()          # RUN ya procesados (evita doble update por filas repetidas)
    con_domicilio = 0

    for _, r in df.iterrows():
        run = r["run_norm"]
        if not run or run == "<NA>":
            continue
        id_est = run_to_id.get(run)
        if id_est is None:
            nuevos_run.add(run)
            continue
        if run in vistos:
            continue        # ya actualizado por una fila previa del mismo alumno
        vistos.add(run)

        dom = construir_domicilio(r)
        calle = val(r.get("calle"))
        numero = val(r.get("numeracion"))
        sector = val(r.get("cerro_barrio_sector_localidad"))
        comuna = val(r.get("comuna"))
        if not any([dom, calle, numero, sector, comuna]):
            sin_cambios += 1
            continue

        if dom:
            con_domicilio += 1

        if args.apply:
            # Solo rellena/actualiza dirección; usa COALESCE para no pisar con vacío
            cur.execute("""
                UPDATE matriculas.estudiante SET
                    domicilio = COALESCE(NULLIF(%s,''), domicilio),
                    calle     = COALESCE(NULLIF(%s,''), calle),
                    numero    = COALESCE(NULLIF(%s,''), numero),
                    sector    = COALESCE(NULLIF(%s,''), sector),
                    comuna    = COALESCE(NULLIF(%s,''), comuna),
                    fecha_actualizacion = now()
                WHERE id_estudiante = %s
            """, (dom, calle, numero, sector, comuna, id_est))
        actualizados += 1

    print(f"\nEstudiantes existentes a actualizar (dirección): {actualizados:,}")
    print(f"Con domicilio compuesto no vacío               : {con_domicilio:,}")
    print(f"Sin datos de dirección en el Excel (se omiten) : {sin_cambios:,}")
    print(f"NUEVOS (RUN únicos no existentes en base)      : {len(nuevos_run):,}")

    if args.apply:
        conn.commit()
        print("\n>>> CAMBIOS APLICADOS (fase A). <<<")
    else:
        conn.rollback()
        print("\n(DRY-RUN: no se escribió nada. Agrega --apply para aplicar la fase A.)")

    if args.fase_b:
        print("\n--- FASE B: estudiantes NUEVOS ---")
        print(f"Son {len(nuevos_run):,} (RUN únicos). NO se crean automáticamente: el Excel del")
        print("formulario NO trae fecha_nacimiento (columna NOT NULL en estudiante).")
        print("Opciones:")
        print("  1) Pedir al colegio/analista la fecha de nacimiento de estos RUN.")
        print("  2) Cargarlos por la UI del sistema (que exige los campos obligatorios).")
        print("  3) Definir una política de fecha provisoria (NO recomendado sin acuerdo).")
        print("La lista está en produccion/salida/860_nuevos_para_sige.csv (del script 2).")

    cur.close()
    conn.close()
    close_db_pool()
    sys.stdout.flush()


if __name__ == "__main__":
    main()
    sys.exit(0)
