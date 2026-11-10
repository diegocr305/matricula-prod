# services/auditoria_exportacion_service.py
"""Registro de exportaciones de datos (tabla auditoria_exportacion).

Requiere haber corrido apply_auditoria_exportacion_migration.py --apply.
Si la tabla aún no existe, la exportación NO se bloquea, pero el fallo queda en el
log del servidor (journalctl) para que se detecte y se aplique la migración.
"""
import json

from database import get_db_connection


def registrar_exportacion(usuario_actual: dict, tipo: str, formato: str,
                          id_establecimiento, filtros: dict, cantidad: int) -> None:
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO auditoria_exportacion
                (id_usuario, correo_usuario, rol_usuario, id_establecimiento,
                 tipo_exportacion, formato, filtros, cantidad_registros)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                (usuario_actual or {}).get("id_usuario"),
                (usuario_actual or {}).get("sub"),
                (usuario_actual or {}).get("rol"),
                id_establecimiento,
                tipo,
                formato,
                json.dumps({k: v for k, v in (filtros or {}).items() if v not in (None, "")},
                           ensure_ascii=False, default=str),
                int(cantidad or 0),
            ),
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"[AUDITORIA] ERROR al registrar exportación ({tipo}/{formato}): {e}. "
              f"¿Se aplicó apply_auditoria_exportacion_migration.py --apply?")
    finally:
        cur.close()
        conn.close()
