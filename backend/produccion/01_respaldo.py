# -*- coding: utf-8 -*-
"""
HERRAMIENTA 1 — RESPALDO del schema `matriculas`.

Qué hace:
  Respalda SOLO el schema `matriculas`, usando la conexión DATABASE_URL del
  backend/.env. NO toca el schema `public` (de otros sistemas del SLEP).
  Es de SOLO LECTURA sobre la base: no modifica nada.

Dos modos (elige automáticamente el mejor disponible):
  A) pg_dump  -> genera un .sql estándar restaurable con psql. Es el preferido.
     Requiere el cliente de PostgreSQL (pg_dump en el PATH). El SERVIDOR de
     producción lo tiene; esta máquina de desarrollo puede no tenerlo.
  B) Python puro (fallback) -> si no hay pg_dump, exporta cada tabla a CSV
     (carpeta con todos los .csv + un resumen de conteos). Suficiente como red
     de seguridad de los DATOS. No incluye DDL/constraints.

Uso (desde backend/):
    python produccion/01_respaldo.py                      # auto: pg_dump o CSV
    python produccion/01_respaldo.py --salida "D:/backups"
    python produccion/01_respaldo.py --modo csv           # fuerza CSV
    python produccion/01_respaldo.py --modo pgdump        # fuerza pg_dump
    python produccion/01_respaldo.py --solo-estructura    # solo DDL (pg_dump)
"""
import argparse
import csv
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402

SCHEMA = "matriculas"
TABLAS = [
    "establecimiento", "catalogo_grado", "catalogo_tipo_ensenanza",
    "usuario", "acceso_establecimiento",
    "apoderado", "estudiante", "ficha_salud",
    "matricula", "firma_matricula", "auditoria_matricula",
]


def respaldo_pgdump(url, destino, solo_estructura):
    sello = datetime.now().strftime("%Y%m%d_%H%M%S")
    sufijo = "estructura" if solo_estructura else "completo"
    archivo = destino / f"matriculas_backup_{sufijo}_{sello}.sql"
    cmd = ["pg_dump", url, "--schema", SCHEMA,
           "--no-owner", "--no-privileges", "--file", str(archivo)]
    if solo_estructura:
        cmd.append("--schema-only")
    print(f"Modo    : pg_dump ({'solo estructura' if solo_estructura else 'estructura + datos'})")
    print(f"Destino : {archivo}\nVolcando...\n")
    subprocess.run(cmd, check=True)
    tam = archivo.stat().st_size / (1024 * 1024)
    print(f"\nOK. Respaldo: {archivo}  ({tam:.2f} MB)")
    print("Restaurar en base vacía:  psql \"<DATABASE_URL>\" -f \"%s\"" % archivo.name)


def respaldo_csv(destino):
    """Fallback sin pg_dump: exporta cada tabla a CSV usando psycopg2."""
    from database import get_db_connection
    sello = datetime.now().strftime("%Y%m%d_%H%M%S")
    carpeta = destino / f"matriculas_backup_csv_{sello}"
    carpeta.mkdir(parents=True, exist_ok=True)
    print(f"Modo    : CSV (Python puro, sin pg_dump)")
    print(f"Destino : {carpeta}\n")

    conn = get_db_connection()
    cur = conn.cursor()
    resumen = []
    for t in TABLAS:
        try:
            cur.execute(f"SELECT * FROM {SCHEMA}.{t}")
        except Exception as e:
            conn.rollback()
            print(f"  {t:<24}: ERROR {e}")
            resumen.append((t, -1))
            continue
        cols = [d[0] for d in cur.description]
        ruta = carpeta / f"{t}.csv"
        n = 0
        with open(ruta, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(cols)
            while True:
                filas = cur.fetchmany(5000)
                if not filas:
                    break
                w.writerows(filas)
                n += len(filas)
        print(f"  {t:<24}: {n:,} filas -> {ruta.name}")
        resumen.append((t, n))
    cur.close()
    conn.close()
    # Cerrar el pool de forma ordenada (evita ruido al terminar el proceso)
    try:
        from database import close_db_pool
        close_db_pool()
    except Exception:
        pass

    # Resumen de conteos (para verificar integridad del respaldo)
    with open(carpeta / "_RESUMEN.txt", "w", encoding="utf-8") as f:
        f.write(f"Respaldo CSV del schema {SCHEMA} - {sello}\n")
        f.write("=" * 50 + "\n")
        for t, n in resumen:
            f.write(f"{t:<24}: {n:,}\n" if n >= 0 else f"{t:<24}: ERROR\n")
    print(f"\nOK. Respaldo CSV en: {carpeta}")
    print("NOTA: el CSV respalda DATOS, no la estructura (DDL/constraints).")
    print("Para un respaldo restaurable 1:1 usa pg_dump en el servidor.")


def main():
    ap = argparse.ArgumentParser(description="Respaldo del schema matriculas")
    ap.add_argument("--salida", default=".", help="Carpeta destino (default: actual)")
    ap.add_argument("--modo", choices=["auto", "pgdump", "csv"], default="auto")
    ap.add_argument("--solo-estructura", action="store_true", help="Solo DDL (requiere pg_dump)")
    args = ap.parse_args()

    url = getattr(config, "DATABASE_URL", None)
    if not url:
        print("ERROR: DATABASE_URL no está definida en backend/.env.")
        sys.exit(1)

    destino = Path(args.salida).resolve()
    destino.mkdir(parents=True, exist_ok=True)
    tiene_pgdump = shutil.which("pg_dump") is not None

    print("=" * 64)
    print("RESPALDO DEL SCHEMA matriculas")
    print("=" * 64)
    print(f"pg_dump disponible: {'sí' if tiene_pgdump else 'NO'}")

    usar = args.modo
    if usar == "auto":
        usar = "pgdump" if tiene_pgdump else "csv"

    if usar == "pgdump":
        if not tiene_pgdump:
            print("\nERROR: pediste pg_dump pero no está en el PATH.")
            print("Instálalo (cliente PostgreSQL) o usa --modo csv.")
            sys.exit(1)
        try:
            respaldo_pgdump(url, destino, args.solo_estructura)
        except subprocess.CalledProcessError as e:
            print(f"ERROR pg_dump (código {e.returncode}). Revisa DATABASE_URL/red.")
            sys.exit(1)
    else:
        respaldo_csv(destino)

    print("\n>>> GUÁRDALO EN TU SERVIDOR / LUGAR SEGURO antes de cualquier limpieza. <<<")


if __name__ == "__main__":
    main()
