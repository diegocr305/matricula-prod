"""
apply_correo_estudiante_migration.py
Agrega a 'estudiante' las columnas de correo electrónico del alumno, distinguiendo:
  - correo_personal       : correo del propio estudiante (trazabilidad de egresados).
  - correo_institucional  : correo entregado por el establecimiento/SLEP.

Ambas NULL (no se rellena ningún dato existente). Idempotente: chequea antes de alterar.
DRY-RUN por defecto; exige --apply para escribir.

Uso (desde backend/):
    python apply_correo_estudiante_migration.py           # DRY-RUN: solo informa
    python apply_correo_estudiante_migration.py --apply   # agrega las columnas faltantes

IMPORTANTE: correr este script ANTES de desplegar el backend que lee/escribe estas
columnas (GET y PUT /estudiante/{rut}); si no existen, la ficha devolverá error.
"""
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_db_connection

COLUMNAS = [
    ("correo_personal", "VARCHAR(150)"),
    ("correo_institucional", "VARCHAR(150)"),
]


def migrate(aplicar: bool):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        faltantes = []
        for nombre, tipo in COLUMNAS:
            cur.execute("""
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'estudiante' AND column_name = %s;
            """, (nombre,))
            if cur.fetchone():
                print(f"[OK] estudiante.{nombre} ya existe.")
            else:
                print(f"[FALTA] estudiante.{nombre} ({tipo} NULL).")
                faltantes.append((nombre, tipo))

        if not faltantes:
            print("Nada que hacer.")
            return
        if not aplicar:
            print("DRY-RUN: no se escribió nada. Ejecute con --apply para agregar las columnas.")
            return

        for nombre, tipo in faltantes:
            cur.execute(f"ALTER TABLE estudiante ADD COLUMN {nombre} {tipo} NULL;")
            print(f"Agregada estudiante.{nombre}.")
        conn.commit()
        print("Migración aplicada.")
    except Exception as e:
        conn.rollback()
        print(f"Error durante la migración: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    migrate(aplicar="--apply" in sys.argv)
