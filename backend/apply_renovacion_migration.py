"""
apply_renovacion_migration.py
Agrega la columna 'estado_renovacion' a la tabla matricula para el proceso de
renovacion de matricula (piloto 2027).

Idempotente (chequea antes de alterar), mismo patron que apply_storage_migration.py.

Diseno:
- Columna NULLABLE y SIN default: las ~91k matriculas historicas quedan en NULL
  (no participan del flujo de renovacion). Solo las filas creadas por el script de
  pre-matricula 2027 reciben un estado.
- Es una dimension DISTINTA de 'estado_firma' (que refleja lo que ocurre en SIMPLE).
  'estado_renovacion' es lo que ve y gestiona el funcionario del colegio.
- Valores validos (CHECK):
    'Por renovar'      -> fila 2027 pre-creada, aun no enviada a firma
    'Pendiente firma'  -> el funcionario la envio a firma en SIMPLE
    'Firmada'          -> el apoderado firmo con Clave Unica (lo marca la Edge Function)
    'No renueva'       -> el apoderado decide no continuar / se cambia de colegio
    'Egresado'         -> termino el ultimo nivel del colegio (ej. 4 medio)
"""
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_db_connection

ESTADOS_VALIDOS = (
    "Por renovar",
    "Pendiente firma",
    "Firmada",
    "No renueva",
    "Egresado",
)


def migrate():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        print("Checking table 'matricula' for 'estado_renovacion'...")
        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'matricula' AND column_name = 'estado_renovacion';
        """)
        exists = cur.fetchone()
        if not exists:
            print("Adding column 'estado_renovacion' to 'matricula'...")
            cur.execute("""
                ALTER TABLE matricula
                ADD COLUMN estado_renovacion VARCHAR(20) NULL;
            """)
            conn.commit()
            print("Successfully added 'estado_renovacion' to 'matricula'.")
        else:
            print("Column 'estado_renovacion' already exists.")

        # CHECK constraint idempotente: solo se crea si no existe.
        print("Checking CHECK constraint 'chk_estado_renovacion'...")
        cur.execute("""
            SELECT conname
            FROM pg_constraint
            WHERE conname = 'chk_estado_renovacion';
        """)
        chk_exists = cur.fetchone()
        if not chk_exists:
            valores = ", ".join(f"'{v}'" for v in ESTADOS_VALIDOS)
            print("Adding CHECK constraint 'chk_estado_renovacion'...")
            cur.execute(f"""
                ALTER TABLE matricula
                ADD CONSTRAINT chk_estado_renovacion
                CHECK (estado_renovacion IS NULL OR estado_renovacion IN ({valores}));
            """)
            conn.commit()
            print("Successfully added CHECK constraint 'chk_estado_renovacion'.")
        else:
            print("CHECK constraint 'chk_estado_renovacion' already exists.")

        # Indice para el panel del funcionario (filtra por establecimiento + anio + estado).
        print("Checking index 'idx_matricula_renovacion'...")
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_matricula_renovacion
            ON matricula (id_establecimiento, anio_escolar, estado_renovacion);
        """)
        conn.commit()
        print("Index 'idx_matricula_renovacion' ready.")

    except Exception as e:
        conn.rollback()
        print(f"Error during migration: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    migrate()
