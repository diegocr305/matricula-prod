"""
apply_normalizar_ruts_apoderado.py
Normaliza rut_pasaporte de la tabla apoderado al formato canonico del sistema
('12345678-9': sin puntos, con guion, DV en mayuscula), usando el mismo helper
services.utils.normalizar_rut que ahora usa el backend al guardar.

Es idempotente: correrlo de nuevo no cambia filas ya normalizadas.

Uso:
    python apply_normalizar_ruts_apoderado.py            # DRY-RUN: solo muestra que cambiaria
    python apply_normalizar_ruts_apoderado.py --apply    # aplica los cambios

Antes de escribir detecta COLISIONES: si dos apoderados distintos quedarian con
el mismo RUT tras normalizar (p.ej. '12.345.678-9' y '123456789'), NO toca esas
filas y las reporta, porque fusionarlas implica reasignar estudiantes y es una
decision manual. El resto se normaliza igual.
"""
import sys
import os

backend_path = os.path.dirname(os.path.abspath(__file__))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from database import get_db_connection
from services.utils import normalizar_rut


def normalizar_ruts(aplicar: bool = False):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id_apoderado, rut_pasaporte FROM apoderado ORDER BY id_apoderado")
        filas = cur.fetchall()

        # Calcular el RUT normalizado de cada apoderado y detectar colisiones.
        propuestas = []          # (id, rut_actual, rut_norm) solo los que cambian
        norm_a_ids = {}          # rut_norm -> [ids] para detectar colisiones
        for id_apod, rut_actual in filas:
            rut_norm = normalizar_rut(rut_actual)
            norm_a_ids.setdefault(rut_norm, []).append(id_apod)
            if rut_norm != (rut_actual or ""):
                propuestas.append((id_apod, rut_actual, rut_norm))

        colisiones = {k: v for k, v in norm_a_ids.items() if k and len(v) > 1}

        print(f"Apoderados totales: {len(filas)}")
        print(f"Requieren normalizacion: {len(propuestas)}")

        if colisiones:
            print("\n[!] COLISIONES detectadas (mismo RUT tras normalizar). NO se tocaran:")
            for rut_norm, ids in colisiones.items():
                print(f"    {rut_norm}: ids {ids}")
        ids_en_colision = {i for ids in colisiones.values() for i in ids}

        cambios = [p for p in propuestas if p[0] not in ids_en_colision]

        if not cambios:
            print("\nNada que actualizar (ya normalizado o todo en colision).")
            return

        print("\nCambios a aplicar:" if aplicar else "\nCambios (DRY-RUN, no se escribe):")
        for id_apod, rut_actual, rut_norm in cambios:
            print(f"    id {id_apod}: '{rut_actual}' -> '{rut_norm}'")

        if not aplicar:
            print("\nDRY-RUN. Ejecuta con --apply para escribir los cambios.")
            return

        for id_apod, _rut_actual, rut_norm in cambios:
            cur.execute(
                "UPDATE apoderado SET rut_pasaporte = %s WHERE id_apoderado = %s",
                (rut_norm, id_apod),
            )
        conn.commit()
        print(f"\nOK: {len(cambios)} apoderado(s) normalizado(s).")
    except Exception as e:
        conn.rollback()
        print(f"Error normalizando RUTs: {e}")
        raise e
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    aplicar = "--apply" in sys.argv
    normalizar_ruts(aplicar=aplicar)
