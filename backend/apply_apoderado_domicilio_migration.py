"""
apply_apoderado_domicilio_migration.py
Desglosa el domicilio del apoderado en columnas estructuradas
(calle / numero / sector / comuna), igual que ya existe en estudiante,
para poder georreferenciar y mostrar la direccion en campos separados
(hoy solo existe 'domicilio' en una sola linea).

Idempotente (chequea antes de alterar), mismo patron que apply_storage_migration.py.
La columna 'domicilio' (texto compuesto) se mantiene: el backend la sigue
poblando componiendo calle+numero+sector+comuna, para no romper lecturas
existentes (PDF, grillas, comprobantes).
"""
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_db_connection

COLUMNAS = [
    ("calle", "VARCHAR(150)"),
    ("numero", "VARCHAR(30)"),
    ("sector", "VARCHAR(100)"),
    ("comuna", "VARCHAR(100)"),
]


def migrate():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for nombre, tipo in COLUMNAS:
            print(f"Checking table 'apoderado' for '{nombre}'...")
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'apoderado' AND column_name = %s;
            """, (nombre,))
            if not cur.fetchone():
                print(f"Adding column '{nombre}' to 'apoderado'...")
                cur.execute(f"ALTER TABLE apoderado ADD COLUMN {nombre} {tipo} NULL;")
                conn.commit()
                print(f"Successfully added '{nombre}' to 'apoderado'.")
            else:
                print(f"Column '{nombre}' already exists.")
    except Exception as e:
        conn.rollback()
        print(f"Error during migration: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    migrate()
