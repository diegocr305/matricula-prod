# services/estudiante_service.py
from fastapi import HTTPException
from database import get_db_connection
import json


def componer_domicilio(calle, numero, sector, comuna):
    """Arma el string de domicilio a partir de los campos estructurados.
    Es la representación canónica/legada de la dirección; los campos
    estructurados (calle/numero/sector/comuna) son la fuente de verdad.
    Formato: "<calle> <numero>, <sector>, <comuna>" saltando los vacíos."""
    calle = (calle or "").strip()
    numero = (numero or "").strip()
    sector = (sector or "").strip()
    comuna = (comuna or "").strip()

    linea1 = " ".join(p for p in (calle, numero) if p).strip()
    partes = [p for p in (linea1, sector, comuna) if p]
    return ", ".join(partes)

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
                   a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno, a.telefono, a.correo_electronico,
                   e.calle, e.numero, e.sector, e.comuna
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
                # Dirección estructurada (fuente de verdad para la edición y la geocodificación futura)
                "calle": estudiante_db[13] or "",
                "numero": estudiante_db[14] or "",
                "sector": estudiante_db[15] or "",
                "comuna": estudiante_db[16] or "",
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
                INSERT INTO apoderado (
                    rut_pasaporte, nombres, apellido_paterno, apellido_materno, 
                    domicilio, telefono, correo_electronico, pais_origen, 
                    documento_extranjero, relacion_estudiante, ruta_documento_tutor
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_apoderado
            """, (run_apod, payload.get("nombres_apoderado"), payload.get("apellido_paterno_apoderado"), 
                  payload.get("apellido_materno_apoderado"), payload.get("domicilio_apoderado"), 
                  payload.get("telefono_apoderado"), payload.get("correo_apoderado"),
                  payload.get("pais_origen_apoderado", "Chile"), payload.get("doc_extranjero_apoderado", None),
                  payload.get("relacion_estudiante", "No Informado"), payload.get("ruta_documento_tutor", None)))
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


def _registrar_auditoria_estudiante(cur, rut, id_usuario, dir_anterior, dir_nueva):
    """Registra en auditoria_matricula el cambio de datos de la ficha del estudiante,
    guardando los valores reales anteriores y nuevos (jsonb). Se vincula a la
    matrícula más reciente del alumno. Si no hay matrícula, no registra (la FK lo exige)."""
    cur.execute(
        """
        SELECT id_matricula FROM matricula
        WHERE id_estudiante = (SELECT id_estudiante FROM estudiante WHERE run_ipe = %s)
        ORDER BY id_matricula DESC LIMIT 1
        """,
        (rut,),
    )
    mat_result = cur.fetchone()
    if not mat_result:
        return

    id_matricula = mat_result[0]
    datos_ant = json.dumps({"direccion": dir_anterior}, ensure_ascii=False, default=str)
    datos_nuev = json.dumps({"direccion": dir_nueva}, ensure_ascii=False, default=str)
    # 'accion' es varchar(10); usamos 'UPDATE' (consistente con el resto del sistema).
    # El detalle (edición de ficha/dirección) queda en los jsonb datos_anteriores/nuevos.
    cur.execute(
        """
        INSERT INTO auditoria_matricula (id_matricula, accion, id_usuario, datos_anteriores, datos_nuevos)
        VALUES (%s, 'UPDATE', %s, %s, %s)
        """,
        (id_matricula, id_usuario, datos_ant, datos_nuev),
    )


def actualizar_datos_estudiante_db(rut: str, req, id_usuario: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # 0. Leemos los valores ANTERIORES de la dirección (para la auditoría real).
        cur.execute(
            "SELECT id_apoderado_principal, calle, numero, sector, comuna, domicilio "
            "FROM estudiante WHERE run_ipe = %s",
            (rut,),
        )
        prev = cur.fetchone()
        if not prev:
            raise HTTPException(status_code=404, detail="Estudiante no encontrado")
        id_apoderado_actual = prev[0]
        dir_anterior = {
            "calle": prev[1], "numero": prev[2], "sector": prev[3],
            "comuna": prev[4], "domicilio": prev[5],
        }

        # 1. Dirección del estudiante.
        # Si vienen los campos estructurados, son la fuente de verdad y recomponemos
        # el domicilio a partir de ellos. Si no (compatibilidad), usamos domicilio_estudiante.
        usa_estructurado = any(
            getattr(req, campo, None) is not None
            for campo in ("calle", "numero", "sector", "comuna")
        )

        if usa_estructurado:
            calle = (req.calle or "").strip() or None
            numero = (req.numero or "").strip() or None
            sector = (req.sector or "").strip() or None
            comuna = (req.comuna or "").strip() or None
            domicilio_final = componer_domicilio(calle, numero, sector, comuna)
            cur.execute(
                "UPDATE estudiante SET calle = %s, numero = %s, sector = %s, comuna = %s, "
                "domicilio = %s WHERE run_ipe = %s",
                (calle, numero, sector, comuna, domicilio_final, rut),
            )
        else:
            domicilio_final = req.domicilio_estudiante
            cur.execute(
                "UPDATE estudiante SET domicilio = %s WHERE run_ipe = %s",
                (domicilio_final, rut),
            )

        dir_nueva = {
            "calle": req.calle if usa_estructurado else dir_anterior["calle"],
            "numero": req.numero if usa_estructurado else dir_anterior["numero"],
            "sector": req.sector if usa_estructurado else dir_anterior["sector"],
            "comuna": req.comuna if usa_estructurado else dir_anterior["comuna"],
            "domicilio": domicilio_final,
        }

        rut_nuevo = (req.rut_apoderado or "").strip()

        # Si no se envió RUT de apoderado, no tocamos el apoderado.
        if not rut_nuevo:
            _registrar_auditoria_estudiante(cur, rut, id_usuario, dir_anterior, dir_nueva)
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

        # --- Trazabilidad: registrar el cambio real en la bitácora ---
        _registrar_auditoria_estudiante(cur, rut, id_usuario, dir_anterior, dir_nueva)

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