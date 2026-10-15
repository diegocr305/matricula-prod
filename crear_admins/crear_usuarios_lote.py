"""
Alta en LOTE de usuarios del RGM contra la base de PRODUCCIÓN (Supabase).

A diferencia de los otros scripts de crear_admins/ (que apuntan a una BD local
Postgres de desarrollo), este lee el DATABASE_URL de backend/.env y fija el
search_path al schema `matriculas`, igual que el backend real.

Es IDEMPOTENTE (ON CONFLICT): se puede re-ejecutar sin duplicar.

Reparto (correo del jefe, oct 2026): los 11 correos son del RBD 1520. CERO admin_slep.
  - Colegio (admin del colegio, ve todo lo de su establecimiento) -> `acceso_establecimiento`
  - Matriculador (solo Matrículas + Estudiantes del RBD 1520)      -> `acceso_establecimiento`

Los que entran por Google NO llevan password_hash (lo gestiona el login Google,
que hace UPSERT de acceso_establecimiento -> usuario en el primer ingreso).

Uso (desde la carpeta backend/, para que cargue su .env):
    python ../crear_admins/crear_usuarios_lote.py
"""
import os
import sys
import psycopg2
from dotenv import load_dotenv

# Carga backend/.env sin importar desde dónde se ejecute
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, "..", "backend", ".env")
load_dotenv(ENV_PATH)

DATABASE_URL = os.getenv("DATABASE_URL")
DB_SCHEMA = os.getenv("DB_SCHEMA", "matriculas")

if not DATABASE_URL:
    print(f"ERROR: no se encontro DATABASE_URL en {ENV_PATH}")
    sys.exit(1)

RBD_1520_ID = 17  # Liceo Bicentenario Marítimo de Valparaíso (verificado en BD)

# Reparto correcto (correo del jefe, oct 2026): los 11 son del RBD 1520. CERO admin_slep.
#   Admin del colegio (rol 'Colegio'): ven todo lo de su establecimiento (incl. Panel/Asistencia).
#   Matriculador: solo Matrículas y Estudiantes del establecimiento.
ADMIN_COLEGIO_1520 = [
    "tamar.rubina@slepvalparaiso.cl",
    "analia.torres@slepvalparaiso.cl",
    "yasna.diaz@slepvalparaiso.cl",
    "carolina.conchap@slepvalparaiso.cl",  # Directora del 1520
]

MATRICULADORES_1520 = [
    "araceli.contreras@slepvalparaiso.cl",
    "daniela.aguilera@slepvalparaiso.cl",
    "marta.villegas@slepvalparaiso.cl",
    "angelica.zamora@slepvalparaiso.cl",
    "mauricio.montero@slepvalparaiso.cl",
    "maria.guerra@slepvalparaiso.cl",
    "daniel.gajardo@slepvalparaiso.cl",
]


def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    try:
        cur.execute(f"SET search_path TO {DB_SCHEMA}, public;")

        # 1) Administradores del colegio -> acceso_establecimiento (RBD 1520). Entran por Google.
        for correo in ADMIN_COLEGIO_1520:
            cur.execute(
                """
                INSERT INTO acceso_establecimiento (correo, id_establecimiento, rol, es_principal, activo)
                VALUES (%s, %s, 'Colegio', false, true)
                ON CONFLICT (correo, id_establecimiento) DO UPDATE
                  SET rol = EXCLUDED.rol,
                      activo = true;
                """,
                (correo, RBD_1520_ID),
            )
            print(f"  [Colegio (admin) @1520] {correo}")

        # 2) Matriculadores -> acceso_establecimiento (RBD 1520). Entran por Google.
        for correo in MATRICULADORES_1520:
            cur.execute(
                """
                INSERT INTO acceso_establecimiento (correo, id_establecimiento, rol, es_principal, activo)
                VALUES (%s, %s, 'Matriculador', false, true)
                ON CONFLICT (correo, id_establecimiento) DO UPDATE
                  SET rol = EXCLUDED.rol,
                      activo = true;
                """,
                (correo, RBD_1520_ID),
            )
            print(f"  [Matriculador @1520] {correo}")

        conn.commit()
        print("OK: usuarios dados de alta (idempotente).")
    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}")
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
