# -*- coding: utf-8 -*-
"""
HERRAMIENTA 5b — LIMPIEZA de las matrículas 2026 del RBD 1520 (DRY-RUN por defecto).

Qué hace
========
Borra SOLO las matrículas del año 2026 del Liceo Bicentenario Marítimo
(id_establecimiento=17), con sus dependencias, en el orden correcto de FK
(que NO tienen ON DELETE CASCADE, salvo encuesta_retiro):
   1) firma_matricula      ligadas a matrículas 2026 del 1520
   2) auditoria_matricula  ligada a matrículas 2026 del 1520
   3) encuesta_retiro      ligada a matrículas 2026 del 1520 (si existe)
   4) matricula            año 2026, establecimiento 17

Lo que NO toca (a propósito):
  - El histórico 2022–2025 (real de SIGE, intocable).
  - Las matrículas 2026/2027 de OTROS establecimientos.
  - Estudiantes ni apoderados (se reutilizan por UPSERT en la carga; muchos
    tienen histórico <2026 y borrarlos rompería FK).

Es el PASO PREVIO a 06_cargar_nomina_2026_1520.py: deja el 2026 del 1520 vacío
para cargar la nómina real limpia desde el Excel del formulario.

Seguridad
=========
  - DRY-RUN por defecto: solo cuenta cuánto borraría. Requiere --apply para borrar.
  - Borra dentro de UNA transacción: si algo falla, se revierte todo.
  - Con --apply exige --confirmo-respaldo (corre antes 01_respaldo.py).
  - Filtra SIEMPRE por anio_escolar=2026 AND id_establecimiento=17. No hay forma
    de que toque otro año u otro colegio.

Uso (desde backend/)
====================
    python produccion/05b_limpiar_2026_1520.py                         # DRY-RUN
    python produccion/05b_limpiar_2026_1520.py --apply --confirmo-respaldo
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database import get_db_connection, close_db_pool  # noqa: E402

ANIO = 2026
ID_ESTABLECIMIENTO = 17  # RBD 1520 — Liceo Bicentenario Marítimo de Valparaíso

# Subconsulta reutilizable: ids de matrícula objetivo (2026 + establecimiento 17).
SUB_MAT = ("SELECT id_matricula FROM matriculas.matricula "
           "WHERE anio_escolar=%s AND id_establecimiento=%s")


def contar(cur, sql, params=None):
    cur.execute(sql, params or ())
    return cur.fetchone()[0]


def main():
    ap = argparse.ArgumentParser(
        description="Limpieza matrículas 2026 del RBD 1520 (DRY-RUN por defecto)")
    ap.add_argument("--apply", action="store_true", help="Ejecuta el borrado (si no, DRY-RUN)")
    ap.add_argument("--confirmo-respaldo", action="store_true",
                    help="Confirmas que ya hiciste el respaldo (obligatorio con --apply)")
    args = ap.parse_args()

    modo = "APLICAR (BORRA)" if args.apply else "DRY-RUN (no borra)"
    print("=" * 64)
    print(f"LIMPIEZA MATRÍCULAS 2026 — RBD 1520 — Modo: {modo}")
    print("=" * 64)

    if args.apply and not args.confirmo_respaldo:
        print("\nBLOQUEADO: para --apply debes pasar también --confirmo-respaldo.")
        print("Primero corre 01_respaldo.py y guarda el .sql/.csv en lugar seguro.")
        sys.exit(1)

    conn = get_db_connection()
    cur = conn.cursor()
    P = (ANIO, ID_ESTABLECIMIENTO)

    # --- Conteos previos (lo que se borraría) ---
    firmas = contar(cur, f"""
        SELECT count(*) FROM matriculas.firma_matricula f
        JOIN matriculas.matricula m ON f.id_matricula=m.id_matricula
        WHERE m.anio_escolar=%s AND m.id_establecimiento=%s""", P)
    audit = contar(cur, f"""
        SELECT count(*) FROM matriculas.auditoria_matricula a
        JOIN matriculas.matricula m ON a.id_matricula=m.id_matricula
        WHERE m.anio_escolar=%s AND m.id_establecimiento=%s""", P)
    try:
        encuestas = contar(cur, f"""
            SELECT count(*) FROM matriculas.encuesta_retiro e
            JOIN matriculas.matricula m ON e.id_matricula=m.id_matricula
            WHERE m.anio_escolar=%s AND m.id_establecimiento=%s""", P)
    except Exception:
        conn.rollback()
        encuestas = 0
    mats = contar(cur,
        "SELECT count(*) FROM matriculas.matricula WHERE anio_escolar=%s AND id_establecimiento=%s", P)
    ests_afectados = contar(cur,
        "SELECT count(DISTINCT id_estudiante) FROM matriculas.matricula "
        "WHERE anio_escolar=%s AND id_establecimiento=%s", P)

    # Chequeo de seguridad: cuántas matrículas de OTROS años/colegios hay (NO se tocan).
    otras = contar(cur,
        "SELECT count(*) FROM matriculas.matricula "
        "WHERE NOT (anio_escolar=%s AND id_establecimiento=%s)", P)

    print(f"\nSe borraría (año {ANIO}, establecimiento {ID_ESTABLECIMIENTO}):")
    print(f"  firma_matricula      : {firmas:,}")
    print(f"  auditoria_matricula  : {audit:,}")
    print(f"  encuesta_retiro      : {encuestas:,}")
    print(f"  matricula 2026/1520  : {mats:,}")
    print(f"\nEstudiantes referenciados por esas matrículas: {ests_afectados:,}")
    print("  (NO se borran estudiantes ni apoderados; solo sus matrículas 2026 del 1520)")
    print(f"\nMatrículas de OTROS años/colegios que NO se tocan: {otras:,}")

    if not args.apply:
        conn.rollback()
        print("\n(DRY-RUN: no se borró nada. Usa --apply --confirmo-respaldo para ejecutar.)")
        cur.close(); conn.close(); close_db_pool(); sys.stdout.flush()
        return

    # --- Borrado real, en orden FK y en una sola transacción ---
    try:
        cur.execute(f"""
            DELETE FROM matriculas.firma_matricula
            WHERE id_matricula IN ({SUB_MAT})""", P)
        n_firmas = cur.rowcount
        cur.execute(f"""
            DELETE FROM matriculas.auditoria_matricula
            WHERE id_matricula IN ({SUB_MAT})""", P)
        n_audit = cur.rowcount
        try:
            cur.execute(f"""
                DELETE FROM matriculas.encuesta_retiro
                WHERE id_matricula IN ({SUB_MAT})""", P)
            n_enc = cur.rowcount
        except Exception:
            n_enc = 0
        cur.execute(
            "DELETE FROM matriculas.matricula WHERE anio_escolar=%s AND id_establecimiento=%s", P)
        n_mats = cur.rowcount

        conn.commit()
        print("\n>>> BORRADO APLICADO (transacción confirmada). <<<")
        print(f"  firmas borradas     : {n_firmas:,}")
        print(f"  auditoría borrada   : {n_audit:,}")
        print(f"  encuestas borradas  : {n_enc:,}")
        print(f"  matrículas borradas : {n_mats:,}")
    except Exception as e:
        conn.rollback()
        print(f"\nERROR: se revirtió TODO (nada se borró). Detalle: {e}")
        sys.exit(1)
    finally:
        cur.close(); conn.close(); close_db_pool(); sys.stdout.flush()


if __name__ == "__main__":
    main()
    sys.exit(0)
