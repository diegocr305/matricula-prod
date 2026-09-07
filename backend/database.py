import os
import psycopg2
from dotenv import load_dotenv

# Carga variables desde backend/.env (y .env.local si existe)
load_dotenv()
load_dotenv(".env.local")

# --- Configuración de conexión ---
# Opción 1 (recomendada): una sola cadena de conexión completa.
#   DATABASE_URL=postgresql://usuario:password@host:puerto/dbname
# Opción 2: variables sueltas (fallback para desarrollo local).
DATABASE_URL = os.getenv("DATABASE_URL")

DB_CONFIG = {
    "dbname": os.getenv("DB_NAME", "postgres"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
    "host": os.getenv("DB_HOST", "localhost"),
    "port": os.getenv("DB_PORT", "5432"),
}

# Esquema donde viven las tablas del sistema de matrículas.
# Se antepone a "public" para que el resto del proyecto conviva con
# las tablas de otros sistemas (reservas, oirs, etc.).
DB_SCHEMA = os.getenv("DB_SCHEMA", "matriculas")


def get_db_connection():
    """Abre una conexión a PostgreSQL y fija el search_path al esquema de matrículas."""
    try:
        if DATABASE_URL:
            conn = psycopg2.connect(DATABASE_URL)
        else:
            conn = psycopg2.connect(**DB_CONFIG)

        conn.set_client_encoding("UTF8")

        # Fijamos el search_path para que las consultas en singular
        # (estudiante, matricula, ...) resuelvan al esquema correcto.
        with conn.cursor() as cur:
            cur.execute(f'SET search_path TO {DB_SCHEMA}, public;')
        conn.commit()

        return conn
    except Exception as e:
        print("¡ALERTA!: PostgreSQL rechazó la conexión. Revisa tus credenciales / variables de entorno.")
        raise e
