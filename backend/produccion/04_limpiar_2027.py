# -*- coding: utf-8 -*-
"""
HERRAMIENTA 4 — LIMPIEZA de las pruebas del año 2027 (DRY-RUN por defecto).

Qué hace:
  Borra el dato de PRUEBA del piloto de renovación 2027, en el orden correcto de
  dependencias (las FK NO tienen ON DELETE CASCADE, salvo encuesta_retiro):
     1) firma_matricula   ligadas a matrículas 2027
     2) auditoria_matricula ligada a matrículas 2027
     3) encuesta_retiro   ligada a matrículas 2027 (si hubiera)
     4) matricula          del año 2027
  NO toca estudiantes ni apoderados (muchos tienen histórico <2026).
  NO toca el histórico ni 2026.

Seguridad:
  - DRY-RUN por defecto: solo muestra cuánto borraría. Requiere --apply para borrar.
  - Hace el borrado dentro de UNA transacción: si algo falla, se revierte todo.
  - Antes de borrar, exige que exista un respaldo reciente (--confirmo-respaldo),
    para no ejecutar sin red de seguridad.

Uso (desde backend/):
    python produccion/04_limpiar_2027.py                        # DRY-RUN
    python produccion/04_limpiar_2027.py --apply --confirmo-respaldo
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database import get_db_connection, close_db_pool  # noqa: E402

ANIO = 2027


def contar(cur, sql, params=None):
    cur.execute(sql, params or ())
    return cur.fetchone()[0]


def main():
    ap = argparse.ArgumentParser(description="Limpieza pruebas 2027 (DRY-RUN por defecto)")
    ap.add_argument("--apply", action="store_true", help="Ejecuta el borrado (si no, DRY-RUN)")
    ap.add_argument("--confirmo-respaldo", action="store_true",
                    help="Confirmas que ya hiciste el respaldo (obligatorio con --apply)")
    args = ap.parse_args()

    modo = "APLICAR (BORRA)" if args.apply else "DRY-RUN (no borra)"
    print("=" * 64)
    print(f"LIMPIEZA DE PRUEBAS 2027 — Modo: {modo}")
    print("=" * 64)

    if args.apply and not args.confirmo_respaldo:
        print("\nBLOQUEADO: para --apply debes pasar también --confirmo-respaldo.")
        print("Primero corre 01_respaldo.py y guarda el .sql/.csv en lugar seguro.")
        sys.exit(1)

    conn = get_db_connection()
    cur = conn.cursor()

    # Conteos previos (lo que se borraría)
    firmas = contar(cur, """
        SELECT count(*) FROM matriculas.firma_matricula f
        JOIN matriculas.matricula m ON f.id_matricula=m.id_matricula
        WHERE m.anio_escolar=%s""", (ANIO,))
    firmas_por_anio = contar(cur,
        "SELECT count(*) FROM matriculas.firma_matricula WHERE anio_escolar=%s", (ANIO,))
    audit = contar(cur, """
        SELECT count(*) FROM matriculas.auditoria_matricula a
        JOIN matriculas.matricula m ON a.id_matricula=m.id_matricula
        WHERE m.anio_escolar=%s""", (ANIO,))
    try:
        encuestas = contar(cur, """
            SELECT count(*) FROM matriculas.encuesta_retiro e
            JOIN matriculas.matricula m ON e.id_matricula=m.id_matricula
            WHERE m.anio_escolar=%s""", (ANIO,))
    except Exception:
        conn.rollback()
        encuestas = 0
    mats = contar(cur, "SELECT count(*) FROM matriculas.matricula WHERE anio_escolar=%s", (ANIO,))
    ests_afectados = contar(cur,
        "SELECT count(DISTINCT id_estudiante) FROM matriculas.matricula WHERE anio_escolar=%s", (ANIO,))

    print(f"\nSe borraría (año {ANIO}):")
    print(f"  firma_matricula (por FK a matrícula 2027): {firmas:,}")
    print(f"  firma_matricula (por columna anio=2027)  : {firmas_por_anio:,}")
    print(f"  auditoria_matricula (ligada a 2027)      : {audit:,}")
    print(f"  encuesta_retiro (ligada a 2027)          : {encuestas:,}")
    print(f"  matricula 2027                           : {mats:,}")
    print(f"\nEstudiantes referenciados por esas matrículas: {ests_afectados:,}")
    print("  (NO se borran estudiantes ni apoderados; solo se quitan sus matrículas 2027)")

    if not args.apply:
        conn.rollback()
        print("\n(DRY-RUN: no se borró nada. Usa --apply --confirmo-respaldo para ejecutar.)")
        cur.close(); conn.close(); close_db_pool(); sys.stdout.flush()
        return

    # --- Borrado real, en orden y en una sola transacción ---
    try:
        cur.execute("""
            DELETE FROM matriculas.firma_matricula
            WHERE id_matricula IN (SELECT id_matricula FROM matriculas.matricula WHERE anio_escolar=%s)
               OR anio_escolar=%s""", (ANIO, ANIO))
        n_firmas = cur.rowcount
        cur.execute("""
            DELETE FROM matriculas.auditoria_matricula
            WHERE id_matricula IN (SELECT id_matricula FROM matriculas.matricula WHERE anio_escolar=%s)""",
            (ANIO,))
        n_audit = cur.rowcount
        try:
            cur.execute("""
                DELETE FROM matriculas.encuesta_retiro
                WHERE id_matricula IN (SELECT id_matricula FROM matriculas.matricula WHERE anio_escolar=%s)""",
                (ANIO,))
            n_enc = cur.rowcount
        except Exception:
            n_enc = 0  # tabla puede no existir en todos los entornos
        cur.execute("DELETE FROM matriculas.matricula WHERE anio_escolar=%s", (ANIO,))
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
