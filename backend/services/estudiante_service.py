# services/estudiante_service.py
import os
import uuid
from fastapi import HTTPException
from database import get_db_connection
import json
from services import storage_service
from services.utils import normalizar_rut

def componer_domicilio(calle, numero, sector, comuna):
    """Compone una dirección en un solo texto a partir de sus componentes."""
    partes = []
    if calle:
        via = str(calle).strip()
        if numero and str(numero).strip():
            via = f"{via} {str(numero).strip()}"
        partes.append(via)
    if sector and str(sector).strip():
        partes.append(str(sector).strip())
    if comuna and str(comuna).strip():
        partes.append(str(comuna).strip())
    return ", ".join(partes) if partes else None

def obtener_estudiantes_db(establecimiento_id: int = None, rol: str = None):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        query = """
            SELECT e.id_estudiante, e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno,
                   m.estado, m.anio_escolar, m.cod_tipo_ensenanza, m.curso
            FROM estudiante e
            LEFT JOIN matricula m ON e.id_estudiante = m.id_estudiante
            WHERE 1=1
        """
        parametros = []
        if establecimiento_id is not None:
            query += " AND m.id_establecimiento = %s"
            parametros.append(establecimiento_id)
            
        query += " ORDER BY e.apellido_paterno ASC, m.anio_escolar DESC"

        cur.execute(query, tuple(parametros))
        filas = cur.fetchall()
        
        estudiantes = [{
            "id": f[0], 
            "run": f[1], 
            "nombres": f[2],
            "apellido_paterno": f[3],
            "apellido_materno": f[4] or "",
            "nombre_completo": f"{f[2]} {f[3]} {f[4] or ''}".strip(),
            "estado": f[5] or "Sin Matrícula",
            "anio_escolar": f[6],
            "cod_tipo_ensenanza": f[7],
            "curso": f[8] or "Sin Curso"
        } for f in filas]
        
        return estudiantes
    except Exception as e:
        print(f"Error BD: {e}")
        raise HTTPException(status_code=500, detail="Error interno de la base de datos")
    finally:
        cur.close()
        conn.close()

def buscar_estudiantes_db(termino: str, establecimiento_id: int = None, limite: int = 20):
    if not termino or len(termino.strip()) < 2:
        return []

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        t_limpio = termino.replace('.', '').replace('-', '').strip()
        t_clean_pattern = f"%{t_limpio}%" if len(t_limpio) >= 2 else "%___NO_RUT___%"
        t_pattern = f"%{termino.strip()}%"

        palabras = [p.strip() for p in termino.strip().split() if p.strip()]

        # 1. Búsqueda por palabras (tokenized search) con unaccent
        params_unaccent = [t_clean_pattern, t_pattern]
        name_conds_unaccent = []
        for p in palabras:
            name_conds_unaccent.append("unaccent(LOWER(CONCAT(e.nombres, ' ', e.apellido_paterno, ' ', coalesce(e.apellido_materno, '')))) LIKE unaccent(LOWER(%s))")
            params_unaccent.append(f"%{p}%")

        name_clause_unaccent = " AND ".join(name_conds_unaccent) if name_conds_unaccent else "1=0"

        est_filter = ""
        if establecimiento_id is not None:
            est_filter = " AND m.id_establecimiento = %s"
            params_unaccent.append(establecimiento_id)

        # Priorizar coincidencias directas en el nombre
        primera_palabra = palabras[0] if palabras else termino.strip()
        params_unaccent.append(f"%{primera_palabra}%")
        params_unaccent.append(limite)

        try:
            query = f"""
                SELECT * FROM (
                    SELECT DISTINCT ON (e.id_estudiante)
                        e.id_estudiante, e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno,
                        m.estado, m.anio_escolar, m.curso, est.nombre as colegio_actual
                    FROM estudiante e
                    LEFT JOIN matricula m ON e.id_estudiante = m.id_estudiante
                    LEFT JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
                    WHERE (
                        REPLACE(REPLACE(REPLACE(UPPER(e.run_ipe), '.', ''), '-', ''), ' ', '') LIKE %s
                        OR e.run_ipe ILIKE %s
                        OR ({name_clause_unaccent})
                    ){est_filter}
                    ORDER BY e.id_estudiante, m.anio_escolar DESC NULLS LAST
                ) sub
                ORDER BY 
                    CASE 
                        WHEN unaccent(LOWER(sub.nombres)) LIKE unaccent(LOWER(%s)) THEN 0 
                        ELSE 1 
                    END,
                    sub.apellido_paterno ASC, sub.nombres ASC
                LIMIT %s
            """
            cur.execute(query, tuple(params_unaccent))
            filas = cur.fetchall()
        except Exception:
            conn.rollback()
            params_fallback = [t_clean_pattern, t_pattern]
            name_conds_fb = []
            for p in palabras:
                name_conds_fb.append("UPPER(CONCAT(e.nombres, ' ', e.apellido_paterno, ' ', coalesce(e.apellido_materno, ''))) LIKE UPPER(%s)")
                params_fallback.append(f"%{p}%")

            name_clause_fb = " AND ".join(name_conds_fb) if name_conds_fb else "1=0"

            if establecimiento_id is not None:
                est_filter_fb = " AND m.id_establecimiento = %s"
                params_fallback.append(establecimiento_id)
            else:
                est_filter_fb = ""

            params_fallback.append(f"%{primera_palabra}%")
            params_fallback.append(limite)

            query_fallback = f"""
                SELECT * FROM (
                    SELECT DISTINCT ON (e.id_estudiante)
                        e.id_estudiante, e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno,
                        m.estado, m.anio_escolar, m.curso, est.nombre as colegio_actual
                    FROM estudiante e
                    LEFT JOIN matricula m ON e.id_estudiante = m.id_estudiante
                    LEFT JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
                    WHERE (
                        REPLACE(REPLACE(REPLACE(UPPER(e.run_ipe), '.', ''), '-', ''), ' ', '') LIKE %s
                        OR e.run_ipe ILIKE %s
                        OR ({name_clause_fb})
                    ){est_filter_fb}
                    ORDER BY e.id_estudiante, m.anio_escolar DESC NULLS LAST
                ) sub
                ORDER BY 
                    CASE 
                        WHEN UPPER(sub.nombres) LIKE UPPER(%s) THEN 0 
                        ELSE 1 
                    END,
                    sub.apellido_paterno ASC, sub.nombres ASC
                LIMIT %s
            """
            cur.execute(query_fallback, tuple(params_fallback))
            filas = cur.fetchall()

        return [{
            "id": f[0],
            "id_estudiante": f[0],
            "run": f[1],
            "run_ipe": f[1],
            "nombres": f[2],
            "apellido_paterno": f[3],
            "apellido_materno": f[4] or "",
            "nombre_completo": f"{f[2]} {f[3]} {f[4] or ''}".strip(),
            "estado": f[5] or "Sin Matrícula",
            "anio_escolar": f[6],
            "curso": f[7] or "Sin Curso",
            "colegio": f[8] or "Sin Colegio"
        } for f in filas]
    except Exception as e:
        print(f"Error en buscar_estudiantes_db: {e}")
        return []
    finally:
        cur.close()
        conn.close()

def obtener_ficha_estudiante_db(rut: str):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT e.id_estudiante, e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno, e.fecha_nacimiento, e.domicilio,
                   a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno, a.telefono, a.correo_electronico, a.domicilio, a.relacion_estudiante, a.ruta_documento_tutor,
                   asup.rut_pasaporte, asup.nombres, asup.apellido_paterno, asup.apellido_materno, asup.telefono, asup.correo_electronico, asup.domicilio, asup.relacion_estudiante,
                   fs.id_ficha, fs.sistema_salud, fs.letra_fonasa, fs.cesfam, fs.centro_emergencia, 
                    fs.alergias, fs.diagnostico_medico, fs.medico_tratante, fs.medicamento, fs.nee, fs.nee_tipo,
                    e.fecha_actualizacion,
                    e.pais_origen, e.documento_extranjero,
                    a.pais_origen, a.documento_extranjero,
                    e.calle, e.numero, e.sector, e.comuna
            FROM estudiante e
            LEFT JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado
            LEFT JOIN apoderado asup ON e.id_apoderado_suplente = asup.id_apoderado
            LEFT JOIN ficha_salud fs ON e.id_estudiante = fs.id_estudiante
            WHERE REPLACE(REPLACE(REPLACE(UPPER(e.run_ipe), '.', ''), '-', ''), ' ', '') = REPLACE(REPLACE(REPLACE(UPPER(%s), '.', ''), '-', ''), ' ', '')
               OR e.run_ipe = %s
        """, (rut, rut))
        estudiante_db = cur.fetchone()
        
        if not estudiante_db:
            raise HTTPException(status_code=404, detail="Estudiante no encontrado en el sistema RGM.")
            
        cur.execute("""
            SELECT m.id_matricula, m.anio_escolar, m.nivel_ensenanza, m.curso, m.estado, m.fecha_matricula, m.observaciones,
                   est.rbd, est.nombre
            FROM matricula m
            INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            WHERE m.id_estudiante = %s 
            ORDER BY m.anio_escolar DESC, m.fecha_matricula DESC NULLS LAST, m.id_matricula DESC
        """, (estudiante_db[0],))
        
        historial_db = cur.fetchall()
        
        ultimo_rbd = historial_db[0][7] if historial_db else "Sin Registro"
        ultimo_colegio = historial_db[0][8] if historial_db else "Sin Registro"

        respuesta = {
            "personal": {
                "id": estudiante_db[0], 
                "run": estudiante_db[1], 
                "nombres": estudiante_db[2],
                "apellidos": f"{estudiante_db[3]} {estudiante_db[4] or ''}".strip(),
                "fecha_nacimiento": str(estudiante_db[5]) if estudiante_db[5] else "No registrada",
                "domicilio": estudiante_db[6] if estudiante_db[6] else "Sin registrar",
                # Dirección estructurada
                "calle": estudiante_db[40] or "",
                "numero": estudiante_db[41] or "",
                "sector": estudiante_db[42] or "",
                "comuna": estudiante_db[43] or "",
                "rbd_actual": ultimo_rbd,
                "colegio_actual": ultimo_colegio,
                "fecha_actualizacion": str(estudiante_db[35]) if len(estudiante_db) > 35 and estudiante_db[35] else None,
                "pais_origen": estudiante_db[36] if len(estudiante_db) > 36 and estudiante_db[36] else "Chile",
                "documento_extranjero": estudiante_db[37] if len(estudiante_db) > 37 else None
            },
            "apoderado": {
                "rut": estudiante_db[7] if estudiante_db[7] else "Sin registrar",
                "rut_raw": estudiante_db[7] or "",
                "nombres": estudiante_db[8] or "",
                "apellido_paterno": estudiante_db[9] or "",
                "apellido_materno": estudiante_db[10] or "",
                "telefono_raw": estudiante_db[11] or "",
                "correo_raw": estudiante_db[12] or "",
                "nombre": f"{estudiante_db[8] or ''} {estudiante_db[9] or ''} {estudiante_db[10] or ''}".strip() if estudiante_db[8] else "Pendiente",
                "telefono": estudiante_db[11] if estudiante_db[11] else "-",
                "correo": estudiante_db[12] if estudiante_db[12] else "-",
                "domicilio": estudiante_db[13] if estudiante_db[13] else "",
                "relacion": estudiante_db[14] or "Titular",
                "ruta_documento_tutor": estudiante_db[15],
                "pais_origen": estudiante_db[38] if len(estudiante_db) > 38 and estudiante_db[38] else "Chile",
                "documento_extranjero": estudiante_db[39] if len(estudiante_db) > 39 else None
            },
            "apoderado_suplente": {
                "rut": estudiante_db[16],
                "nombres": estudiante_db[17] or "",
                "apellido_paterno": estudiante_db[18] or "",
                "apellido_materno": estudiante_db[19] or "",
                "nombre": f"{estudiante_db[17] or ''} {estudiante_db[18] or ''} {estudiante_db[19] or ''}".strip(),
                "telefono": estudiante_db[20] if estudiante_db[20] else "-",
                "correo": estudiante_db[21] if estudiante_db[21] else "-",
                "domicilio": estudiante_db[22] if estudiante_db[22] else "",
                "relacion": estudiante_db[23] or "Suplente"
            } if estudiante_db[16] else None,
            "salud": {
                "sistema_salud": estudiante_db[25] or "No informado",
                "letra_fonasa": estudiante_db[26] or "-",
                "cesfam": estudiante_db[27] or "No informado",
                "centro_emergencia": estudiante_db[28] or "No informado",
                "alergias": estudiante_db[29] or "",
                "diagnostico_medico": estudiante_db[30] or "No",
                "medico_tratante": estudiante_db[31] or "No informado",
                "medicamento": estudiante_db[32] or "",
                "nee": estudiante_db[33] or "No",
                "nee_tipo": estudiante_db[34] or "No aplica"
            } if estudiante_db[24] is not None else None,
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

def guardar_documento_tutor_db(rut: str, archivo_bytes: bytes, filename: str, usuario_actual: dict):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id_estudiante, id_apoderado_principal FROM estudiante WHERE run_ipe = %s", (rut,))
        est = cur.fetchone()
        if not est:
            raise HTTPException(status_code=404, detail="Estudiante no encontrado.")

        id_estudiante, id_apoderado = est
        if not id_apoderado:
            raise HTTPException(status_code=400, detail="El estudiante no tiene un apoderado registrado para adjuntar la tutoría.")

        ext = os.path.splitext(filename)[1].lower() if filename else ".pdf"
        if ext not in [".pdf", ".jpg", ".jpeg", ".png"]:
            ext = ".pdf"

        rut_limpio = rut.replace(".", "").replace("-", "")
        clave = f"tutores/tutor_{rut_limpio}_{uuid.uuid4().hex[:8]}{ext}"
        storage_service.guardar_archivo(archivo_bytes, clave, content_type="application/pdf")

        cur.execute("UPDATE apoderado SET ruta_documento_tutor = %s WHERE id_apoderado = %s", (clave, id_apoderado))
        conn.commit()
        return {"mensaje": "Documento de tutoría legal guardado exitosamente.", "ruta": clave}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar documento de tutoría: {e}")
    finally:
        cur.close()
        conn.close()

def obtener_ruta_documento_tutor_db(rut: str, usuario_actual: dict) -> str:
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT a.ruta_documento_tutor 
            FROM estudiante e 
            INNER JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado 
            WHERE e.run_ipe = %s
        """, (rut,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Estudiante o apoderado no encontrado.")

        if not row[0]:
            raise HTTPException(status_code=404, detail="Este apoderado no tiene un documento de tutoría legal adjunto.")

        return row[0]
    finally:
        cur.close()
        conn.close()


def crear_estudiante_db(payload: dict):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # 1. Procesar Apoderado Principal
        run_apod = normalizar_rut(payload.get("run_apoderado"))
        cur.execute("SELECT id_apoderado FROM apoderado WHERE rut_pasaporte = %s", (run_apod,))
        apod_db = cur.fetchone()
        
        if apod_db:
            id_apoderado = apod_db[0]
            cur.execute("""
                UPDATE apoderado SET
                    nombres = COALESCE(NULLIF(%s, ''), nombres),
                    apellido_paterno = COALESCE(NULLIF(%s, ''), apellido_paterno),
                    apellido_materno = COALESCE(NULLIF(%s, ''), apellido_materno),
                    domicilio = COALESCE(NULLIF(%s, ''), domicilio),
                    telefono = COALESCE(NULLIF(%s, ''), telefono),
                    correo_electronico = COALESCE(NULLIF(%s, ''), correo_electronico),
                    relacion_estudiante = COALESCE(NULLIF(%s, ''), relacion_estudiante),
                    pais_origen = COALESCE(NULLIF(%s, ''), pais_origen),
                    documento_extranjero = COALESCE(NULLIF(%s, ''), documento_extranjero)
                WHERE id_apoderado = %s
            """, (payload.get("nombres_apoderado"), payload.get("apellido_paterno_apoderado"), 
                  payload.get("apellido_materno_apoderado"), payload.get("domicilio_apoderado"), 
                  payload.get("telefono_apoderado"), payload.get("correo_apoderado"),
                  payload.get("relacion_estudiante"), payload.get("pais_origen_apoderado"),
                  payload.get("doc_extranjero_apoderado"), id_apoderado))
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

        # 2. Procesar Apoderado Suplente (si aplica)
        id_suplente = None
        if payload.get("tiene_suplente") and payload.get("run_suplente"):
            run_sup = normalizar_rut(payload.get("run_suplente"))
            cur.execute("SELECT id_apoderado FROM apoderado WHERE rut_pasaporte = %s", (run_sup,))
            sup_db = cur.fetchone()
            if sup_db:
                id_suplente = sup_db[0]
                cur.execute("""
                    UPDATE apoderado SET
                        nombres = COALESCE(NULLIF(%s, ''), nombres),
                        apellido_paterno = COALESCE(NULLIF(%s, ''), apellido_paterno),
                        apellido_materno = COALESCE(NULLIF(%s, ''), apellido_materno),
                        domicilio = COALESCE(NULLIF(%s, ''), domicilio),
                        telefono = COALESCE(NULLIF(%s, ''), telefono),
                        correo_electronico = COALESCE(NULLIF(%s, ''), correo_electronico),
                        relacion_estudiante = COALESCE(NULLIF(%s, ''), relacion_estudiante)
                    WHERE id_apoderado = %s
                """, (payload.get("nombres_suplente"), payload.get("apellido_paterno_suplente"),
                      payload.get("apellido_materno_suplente"), payload.get("domicilio_suplente") or payload.get("domicilio_apoderado"),
                      payload.get("telefono_suplente"), payload.get("correo_suplente"),
                      payload.get("relacion_suplente"), id_suplente))
            else:
                cur.execute("""
                    INSERT INTO apoderado (
                        rut_pasaporte, nombres, apellido_paterno, apellido_materno, 
                        domicilio, telefono, correo_electronico, relacion_estudiante
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_apoderado
                """, (run_sup, payload.get("nombres_suplente"), payload.get("apellido_paterno_suplente"),
                      payload.get("apellido_materno_suplente"), payload.get("domicilio_suplente") or payload.get("domicilio_apoderado"),
                      payload.get("telefono_suplente"), payload.get("correo_suplente"),
                      payload.get("relacion_suplente") or "Suplente"))
                id_suplente = cur.fetchone()[0]

        # 3. Insertar Estudiante con ambas referencias
        cur.execute("""
            INSERT INTO estudiante (
                run_ipe, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, 
                domicilio, latitud, longitud, id_apoderado_principal, id_apoderado_suplente, 
                pais_origen, documento_extranjero
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_estudiante
        """, (payload.get("run"), payload.get("nombres"), payload.get("apellido_paterno"), payload.get("apellido_materno"), 
              payload.get("fecha_nacimiento"), payload.get("sexo"), payload.get("domicilio"), 
              payload.get("latitud"), payload.get("longitud"), id_apoderado, id_suplente,
              payload.get("pais_origen_estudiante", "Chile"), payload.get("doc_extranjero_estudiante", None)))
        
        nuevo_id_est = cur.fetchone()[0]

        # 4. Insertar Ficha de Salud asociada
        cur.execute("""
            INSERT INTO ficha_salud (
                id_estudiante, sistema_salud, letra_fonasa, cesfam, centro_emergencia,
                alergias, diagnostico_medico, medico_tratante, medicamento, nee, nee_tipo
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id_estudiante) DO UPDATE SET
                sistema_salud = EXCLUDED.sistema_salud,
                letra_fonasa = EXCLUDED.letra_fonasa,
                cesfam = EXCLUDED.cesfam,
                centro_emergencia = EXCLUDED.centro_emergencia,
                alergias = EXCLUDED.alergias,
                diagnostico_medico = EXCLUDED.diagnostico_medico,
                medico_tratante = EXCLUDED.medico_tratante,
                medicamento = EXCLUDED.medicamento,
                nee = EXCLUDED.nee,
                nee_tipo = EXCLUDED.nee_tipo,
                fecha_actualizacion = CURRENT_TIMESTAMP;
        """, (
            nuevo_id_est,
            payload.get("sistema_salud") or "No informado",
            payload.get("letra_fonasa") or "-",
            payload.get("cesfam") or "No informado",
            payload.get("centro_emergencia") or "No informado",
            payload.get("alergias") or "",
            payload.get("diagnostico_medico") or "No",
            payload.get("medico_tratante") or "No informado",
            payload.get("medicamento") or "",
            payload.get("nee") or "No",
            payload.get("nee_tipo") or "No aplica"
        ))

        conn.commit()
        return {"mensaje": "Estudiante guardado exitosamente", "id_estudiante": nuevo_id_est, "run": payload.get("run")}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar: {e}")
    finally:
        cur.close()
        conn.close()

def buscar_apoderado_por_rut_db(rut_apoderado: str):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT a.id_apoderado, a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno,
                   a.domicilio, a.telefono, a.correo_electronico,
                   COUNT(e.id_estudiante) AS n_estudiantes
            FROM apoderado a
            LEFT JOIN estudiante e ON e.id_apoderado_principal = a.id_apoderado
            WHERE a.rut_pasaporte = %s
            GROUP BY a.id_apoderado, a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno,
                     a.domicilio, a.telefono, a.correo_electronico
            """,
            (normalizar_rut(rut_apoderado),),
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
    """Registra en auditoria_matricula el cambio de datos de la ficha del estudiante."""
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
        # 1. Obtener estudiante existente y valores anteriores para auditoría
        cur.execute("""
            SELECT id_estudiante, id_apoderado_principal, id_apoderado_suplente,
                   calle, numero, sector, comuna, domicilio 
            FROM estudiante WHERE run_ipe = %s
        """, (rut,))
        est_db = cur.fetchone()
        if not est_db:
            raise HTTPException(status_code=404, detail="Estudiante no encontrado")
            
        id_estudiante, id_apod_princ, id_apod_supl, prev_calle, prev_num, prev_sec, prev_com, prev_dom = est_db
        dir_anterior = {
            "calle": prev_calle, "numero": prev_num, "sector": prev_sec,
            "comuna": prev_com, "domicilio": prev_dom
        }

        # 2. Dirección del estudiante: estructurada o campo único
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
                "domicilio = %s WHERE id_estudiante = %s",
                (calle, numero, sector, comuna, domicilio_final, id_estudiante),
            )
        elif req.domicilio_estudiante is not None:
            domicilio_final = req.domicilio_estudiante
            cur.execute(
                "UPDATE estudiante SET domicilio = %s WHERE id_estudiante = %s",
                (domicilio_final, id_estudiante),
            )
        else:
            domicilio_final = prev_dom

        dir_nueva = {
            "calle": req.calle if usa_estructurado else dir_anterior["calle"],
            "numero": req.numero if usa_estructurado else dir_anterior["numero"],
            "sector": req.sector if usa_estructurado else dir_anterior["sector"],
            "comuna": req.comuna if usa_estructurado else dir_anterior["comuna"],
            "domicilio": domicilio_final,
        }

        try:
            cur.execute("UPDATE estudiante SET fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_estudiante = %s", (id_estudiante,))
        except Exception:
            pass

        # 3. Procesar Apoderado Principal
        if req.rut_apoderado:
            rut_nuevo = normalizar_rut(req.rut_apoderado)
            nom_a = req.nombres_apoderado or "Apoderado"
            pat_a = req.apellido_paterno_apoderado or "Titular"
            mat_a = req.apellido_materno_apoderado or ""
            dom_a = req.domicilio_apoderado or domicilio_final or "Sin registrar"
            tel_a = req.telefono_apoderado or ""
            cor_a = req.correo_apoderado or ""

            rel_a = getattr(req, "relacion_apoderado", None)
            if not rel_a and id_apod_princ:
                cur.execute("SELECT relacion_estudiante FROM apoderado WHERE id_apoderado = %s", (id_apod_princ,))
                row_rel = cur.fetchone()
                if row_rel and row_rel[0]:
                    rel_a = row_rel[0]
            if not rel_a:
                rel_a = "Madre"

            cur.execute("SELECT id_apoderado FROM apoderado WHERE rut_pasaporte = %s", (rut_nuevo,))
            apod_exist = cur.fetchone()

            if apod_exist:
                id_apod_existente = apod_exist[0]
                if id_apod_princ == id_apod_existente:
                    # Mismo apoderado ya vinculado -> edición normal
                    cur.execute("""
                        UPDATE apoderado 
                        SET nombres = %s, apellido_paterno = %s, apellido_materno = %s, 
                            domicilio = %s, telefono = %s, correo_electronico = %s, relacion_estudiante = %s
                        WHERE id_apoderado = %s
                    """, (nom_a, pat_a, mat_a, dom_a, tel_a, cor_a, rel_a, id_apod_princ))
                else:
                    # Opción 1: el RUT pertenece a otro apoderado -> solo vinculamos sin pisar datos
                    cur.execute("UPDATE estudiante SET id_apoderado_principal = %s WHERE id_estudiante = %s", (id_apod_existente, id_estudiante))
            else:
                if id_apod_princ:
                    cur.execute("""
                        UPDATE apoderado 
                        SET rut_pasaporte = %s, nombres = %s, apellido_paterno = %s, apellido_materno = %s, 
                            domicilio = %s, telefono = %s, correo_electronico = %s, relacion_estudiante = %s
                        WHERE id_apoderado = %s
                    """, (rut_nuevo, nom_a, pat_a, mat_a, dom_a, tel_a, cor_a, rel_a, id_apod_princ))
                else:
                    cur.execute("""
                        INSERT INTO apoderado (rut_pasaporte, nombres, apellido_paterno, apellido_materno, domicilio, telefono, correo_electronico, relacion_estudiante)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_apoderado
                    """, (rut_nuevo, nom_a, pat_a, mat_a, dom_a, tel_a, cor_a, rel_a))
                    nuevo_id = cur.fetchone()[0]
                    cur.execute("UPDATE estudiante SET id_apoderado_principal = %s WHERE id_estudiante = %s", (nuevo_id, id_estudiante))

        # 4. Procesar Apoderado Suplente
        modificar_supl = getattr(req, "modificar_suplente", False)
        if getattr(req, "tiene_suplente", False) and getattr(req, "rut_suplente", None):
            rut_supl_norm = normalizar_rut(req.rut_suplente)
            nom_s = req.nombres_suplente or "Apoderado"
            pat_s = req.apellido_paterno_suplente or "Suplente"
            mat_s = req.apellido_materno_suplente or ""
            dom_s = req.domicilio_suplente or req.domicilio_apoderado or domicilio_final or "Sin registrar"
            tel_s = req.telefono_suplente or ""
            cor_s = req.correo_suplente or ""

            rel_s = getattr(req, "relacion_suplente", None)
            if not rel_s and id_apod_supl:
                cur.execute("SELECT relacion_estudiante FROM apoderado WHERE id_apoderado = %s", (id_apod_supl,))
                row_rel_s = cur.fetchone()
                if row_rel_s and row_rel_s[0]:
                    rel_s = row_rel_s[0]
            if not rel_s:
                rel_s = "Suplente"

            if id_apod_supl:
                cur.execute("""
                    UPDATE apoderado 
                    SET rut_pasaporte = %s, nombres = %s, apellido_paterno = %s, apellido_materno = %s, 
                        domicilio = %s, telefono = %s, correo_electronico = %s, relacion_estudiante = %s
                    WHERE id_apoderado = %s
                """, (rut_supl_norm, nom_s, pat_s, mat_s, dom_s, tel_s, cor_s, rel_s, id_apod_supl))
            else:
                cur.execute("SELECT id_apoderado, relacion_estudiante FROM apoderado WHERE rut_pasaporte = %s", (rut_supl_norm,))
                sup_exist = cur.fetchone()
                if sup_exist:
                    id_apod_supl = sup_exist[0]
                    if not getattr(req, "relacion_suplente", None) and sup_exist[1]:
                        rel_s = sup_exist[1]
                    cur.execute("""
                        UPDATE apoderado 
                        SET nombres = %s, apellido_paterno = %s, apellido_materno = %s, 
                            domicilio = %s, telefono = %s, correo_electronico = %s, relacion_estudiante = %s
                        WHERE id_apoderado = %s
                    """, (nom_s, pat_s, mat_s, dom_s, tel_s, cor_s, rel_s, id_apod_supl))
                else:
                    cur.execute("""
                        INSERT INTO apoderado (rut_pasaporte, nombres, apellido_paterno, apellido_materno, domicilio, telefono, correo_electronico, relacion_estudiante)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_apoderado
                    """, (rut_supl_norm, nom_s, pat_s, mat_s, dom_s, tel_s, cor_s, rel_s))
                    id_apod_supl = cur.fetchone()[0]

                cur.execute("UPDATE estudiante SET id_apoderado_suplente = %s WHERE id_estudiante = %s", (id_apod_supl, id_estudiante))
        elif modificar_supl and (getattr(req, "tiene_suplente", None) is False):
            cur.execute("UPDATE estudiante SET id_apoderado_suplente = NULL WHERE id_estudiante = %s", (id_estudiante,))

        # 5. Procesar Ficha Médica / Salud
        if getattr(req, "actualizar_salud", False) or getattr(req, "sistema_salud", None):
            sis_salud = req.sistema_salud or "No informado"
            let_fon = req.letra_fonasa or "-"
            cesfam = req.cesfam or "No informado"
            emergencia = req.centro_emergencia or "No informado"
            alergias = req.alergias or ""
            diag_med = req.diagnostico_medico or "No"
            med_trat = req.medico_tratante or "No informado"
            meds = req.medicamento or ""
            nee = req.nee or "No"
            nee_tipo = req.nee_tipo or "No aplica"

            cur.execute("""
                INSERT INTO ficha_salud (
                    id_estudiante, sistema_salud, letra_fonasa, cesfam, centro_emergencia,
                    alergias, diagnostico_medico, medico_tratante, medicamento, nee, nee_tipo,
                    fecha_actualizacion
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (id_estudiante) DO UPDATE SET
                    sistema_salud = EXCLUDED.sistema_salud,
                    letra_fonasa = EXCLUDED.letra_fonasa,
                    cesfam = EXCLUDED.cesfam,
                    centro_emergencia = EXCLUDED.centro_emergencia,
                    alergias = EXCLUDED.alergias,
                    diagnostico_medico = EXCLUDED.diagnostico_medico,
                    medico_tratante = EXCLUDED.medico_tratante,
                    medicamento = EXCLUDED.medicamento,
                    nee = EXCLUDED.nee,
                    nee_tipo = EXCLUDED.nee_tipo,
                    fecha_actualizacion = CURRENT_TIMESTAMP;
            """, (id_estudiante, sis_salud, let_fon, cesfam, emergencia, alergias, diag_med, med_trat, meds, nee, nee_tipo))

        # 6. Trazabilidad: registrar en auditoría real
        _registrar_auditoria_estudiante(cur, rut, id_usuario, dir_anterior, dir_nueva)

        conn.commit()
        return {"mensaje": "Datos y ficha médica actualizados exitosamente"}
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
