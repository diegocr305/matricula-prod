# services/estudiante_service.py
from fastapi import HTTPException
from database import get_db_connection

def obtener_estudiantes_db(establecimiento_id: int = None, rol: str = None):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        query = """
            SELECT DISTINCT e.id_estudiante, e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno
            FROM estudiante e
            LEFT JOIN matricula m ON e.id_estudiante = m.id_estudiante
            WHERE 1=1
        """
        parametros = []
        
        if establecimiento_id is not None:
            query += " AND m.id_establecimiento = %s"
            parametros.append(establecimiento_id)
            
        query += " ORDER BY e.apellido_paterno ASC"

        cur.execute(query, tuple(parametros))
        filas = cur.fetchall()
        
        estudiantes = [{"id": f[0], "run": f[1], "nombre_completo": f"{f[2]} {f[3]} {f[4] or ''}".strip()} for f in filas]
        return estudiantes

    except Exception as e:
        print(f"Error BD: {e}")
        raise HTTPException(status_code=500, detail="Error interno de la base de datos")
    finally:
        cur.close()
        conn.close()

def obtener_ficha_estudiante_db(rut: str):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT e.id_estudiante, e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno, e.fecha_nacimiento, e.domicilio,
                   a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno, a.telefono, a.correo_electronico
            FROM estudiante e
            LEFT JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado
            WHERE e.run_ipe = %s
        """, (rut,))
        estudiante_db = cur.fetchone()
        
        if not estudiante_db:
            raise HTTPException(status_code=404, detail="Estudiante no encontrado en el sistema RGM.")
            
        cur.execute("""
            SELECT m.id_matricula, m.anio_escolar, m.nivel_ensenanza, m.curso, m.estado, m.fecha_matricula, m.observaciones,
                   est.rbd, est.nombre
            FROM matricula m
            INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            WHERE m.id_estudiante = %s 
            ORDER BY m.anio_escolar DESC, m.fecha_matricula DESC, m.id_matricula DESC
        """, (estudiante_db[0],))
        
        historial_db = cur.fetchall()
        
        ultimo_rbd = historial_db[0][7] if historial_db else "Sin Registro"
        ultimo_colegio = historial_db[0][8] if historial_db else "Sin Registro"

        respuesta = {
            "personal": {
                "id": estudiante_db[0], "run": estudiante_db[1], "nombres": estudiante_db[2],
                "apellidos": f"{estudiante_db[3]} {estudiante_db[4]}",
                "fecha_nacimiento": str(estudiante_db[5]) if estudiante_db[5] else "No registrada",
                "domicilio": estudiante_db[6] if estudiante_db[6] else "Sin registrar",
                "rbd_actual": ultimo_rbd,
                "colegio_actual": ultimo_colegio
            },
            "apoderado": {
                "rut": estudiante_db[7] if estudiante_db[7] else "Sin registrar",
                "nombre": f"{estudiante_db[8]} {estudiante_db[9]} {estudiante_db[10]}" if estudiante_db[8] else "Pendiente",
                "telefono": estudiante_db[11] if estudiante_db[11] else "-",
                "correo": estudiante_db[12] if estudiante_db[12] else "-",
                # Campos individuales para edición (pueden venir None si el apoderado está pendiente)
                "rut_raw": estudiante_db[7] or "",
                "nombres": estudiante_db[8] or "",
                "apellido_paterno": estudiante_db[9] or "",
                "apellido_materno": estudiante_db[10] or "",
                "telefono_raw": estudiante_db[11] or "",
                "correo_raw": estudiante_db[12] or ""
            },
            "historial": [
                {
                    "id": f[0], "anio": f[1], 
                    "establecimiento": f[8], "rbd": f[7], 
                    "curso": f[3], "estado": f[4], 
                    "tipo_movimiento": "Matrícula", "observaciones": f[6] or "Sin observaciones."
                } 
                for f in historial_db
            ]
        }
        return respuesta
    finally:
        cur.close()
        conn.close()

# 🌟 NUEVA FUNCIÓN: Insertamos con la data para alumnos extranjeros
def crear_estudiante_db(payload: dict):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        run_apod = payload.get("run_apoderado")
        cur.execute("SELECT id_apoderado FROM apoderado WHERE rut_pasaporte = %s", (run_apod,))
        apod_db = cur.fetchone()
        
        if apod_db:
            id_apoderado = apod_db[0]
        else:
            cur.execute("""
                INSERT INTO apoderado (rut_pasaporte, nombres, apellido_paterno, apellido_materno, domicilio, telefono, correo_electronico, pais_origen, documento_extranjero)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_apoderado
            """, (run_apod, payload.get("nombres_apoderado"), payload.get("apellido_paterno_apoderado"), 
                  payload.get("apellido_materno_apoderado"), payload.get("domicilio_apoderado"), 
                  payload.get("telefono_apoderado"), payload.get("correo_apoderado"),
                  payload.get("pais_origen_apoderado", "Chile"), payload.get("doc_extranjero_apoderado", None)))
            id_apoderado = cur.fetchone()[0]

        cur.execute("""
            INSERT INTO estudiante (run_ipe, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, domicilio, latitud, longitud, id_apoderado_principal, pais_origen, documento_extranjero)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_estudiante
        """, (payload.get("run"), payload.get("nombres"), payload.get("apellido_paterno"), payload.get("apellido_materno"), 
              payload.get("fecha_nacimiento"), payload.get("sexo"), payload.get("domicilio"), 
              payload.get("latitud"), payload.get("longitud"), id_apoderado,
              payload.get("pais_origen_estudiante", "Chile"), payload.get("doc_extranjero_estudiante", None)))
        
        nuevo_id_est = cur.fetchone()[0]
        conn.commit()
        return {"mensaje": "Estudiante guardado exitosamente", "id_estudiante": nuevo_id_est}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar: {e}")
    finally:
        cur.close()
        conn.close()

def buscar_apoderado_por_rut_db(rut_apoderado: str):
    """Busca un apoderado por RUT/pasaporte. Devuelve sus datos y cuántos estudiantes tiene asociados."""
    rut_apoderado = (rut_apoderado or "").strip()
    if not rut_apoderado:
        raise HTTPException(status_code=400, detail="Debe indicar un RUT para buscar.")

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT a.id_apoderado, a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno,
                   a.domicilio, a.telefono, a.correo_electronico,
                   (SELECT count(*) FROM estudiante e WHERE e.id_apoderado_principal = a.id_apoderado) AS n_estudiantes
            FROM apoderado a
            WHERE a.rut_pasaporte = %s
            """,
            (rut_apoderado,),
        )
        fila = cur.fetchone()
        if not fila:
            return {"existe": False}
        return {
            "existe": True,
            "id_apoderado": fila[0],
            "rut_apoderado": fila[1],
            "nombres_apoderado": fila[2] or "",
            "apellido_paterno_apoderado": fila[3] or "",
            "apellido_materno_apoderado": fila[4] or "",
            "domicilio_apoderado": fila[5] or "",
            "telefono_apoderado": fila[6] or "",
            "correo_apoderado": fila[7] or "",
            "n_estudiantes": fila[8],
        }
    finally:
        cur.close()
        conn.close()


def actualizar_datos_estudiante_db(rut: str, req):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # 1. Domicilio del estudiante
        cur.execute(
            "UPDATE estudiante SET domicilio = %s WHERE run_ipe = %s RETURNING id_apoderado_principal",
            (req.domicilio_estudiante, rut),
        )
        resultado = cur.fetchone()
        if not resultado:
            raise HTTPException(status_code=404, detail="Estudiante no encontrado")
        id_apoderado_actual = resultado[0]

        rut_nuevo = (req.rut_apoderado or "").strip()

        # Si no se envió RUT de apoderado, no tocamos el apoderado.
        if not rut_nuevo:
            conn.commit()
            return {"mensaje": "Datos actualizados exitosamente"}

        # 2. ¿Existe ya un apoderado con ese RUT?
        cur.execute("SELECT id_apoderado FROM apoderado WHERE rut_pasaporte = %s", (rut_nuevo,))
        apod_existente = cur.fetchone()

        if apod_existente:
            id_apod_existente = apod_existente[0]
            if id_apoderado_actual == id_apod_existente:
                # Es el mismo apoderado ya vinculado -> edición normal (actualizamos sus datos).
                cur.execute(
                    """
                    UPDATE apoderado
                    SET nombres = %s, apellido_paterno = %s, apellido_materno = %s,
                        domicilio = %s, telefono = %s, correo_electronico = %s
                    WHERE id_apoderado = %s
                    """,
                    (req.nombres_apoderado, req.apellido_paterno_apoderado, req.apellido_materno_apoderado,
                     req.domicilio_apoderado, req.telefono_apoderado, req.correo_apoderado, id_apod_existente),
                )
                mensaje = "Datos del apoderado actualizados."
            else:
                # OPCIÓN 1: el RUT existe y pertenece a OTRO apoderado -> solo vinculamos,
                # NO sobreescribimos sus datos (son compartidos con otros estudiantes).
                cur.execute(
                    "UPDATE estudiante SET id_apoderado_principal = %s WHERE run_ipe = %s",
                    (id_apod_existente, rut),
                )
                mensaje = "Estudiante vinculado al apoderado existente."
        else:
            # No existe ese RUT.
            if id_apoderado_actual:
                # El estudiante tenía un apoderado (con otro RUT): actualizamos ese registro
                # (equivale a corregirle el RUT y datos al apoderado actual).
                cur.execute(
                    """
                    UPDATE apoderado
                    SET rut_pasaporte = %s, nombres = %s, apellido_paterno = %s, apellido_materno = %s,
                        domicilio = %s, telefono = %s, correo_electronico = %s
                    WHERE id_apoderado = %s
                    """,
                    (rut_nuevo, req.nombres_apoderado, req.apellido_paterno_apoderado, req.apellido_materno_apoderado,
                     req.domicilio_apoderado, req.telefono_apoderado, req.correo_apoderado, id_apoderado_actual),
                )
                mensaje = "Datos del apoderado actualizados."
            else:
                # El estudiante no tenía apoderado: creamos uno y vinculamos.
                cur.execute(
                    """
                    INSERT INTO apoderado (rut_pasaporte, nombres, apellido_paterno, apellido_materno, domicilio, telefono, correo_electronico)
                    VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id_apoderado
                    """,
                    (rut_nuevo, req.nombres_apoderado, req.apellido_paterno_apoderado, req.apellido_materno_apoderado,
                     req.domicilio_apoderado, req.telefono_apoderado, req.correo_apoderado),
                )
                nuevo_id = cur.fetchone()[0]
                cur.execute(
                    "UPDATE estudiante SET id_apoderado_principal = %s WHERE run_ipe = %s",
                    (nuevo_id, rut),
                )
                mensaje = "Apoderado creado y vinculado."

        conn.commit()
        return {"mensaje": mensaje}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        print(f"Error BD: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()