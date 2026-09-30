# services/matricula_service.py
import io
import os
import uuid
import pandas as pd
import hashlib
from datetime import datetime
import openpyxl
from fastapi import HTTPException
from database import get_db_connection

# Importamos las herramientas desacopladas
from services.pdf_service import generar_certificado_pdf
from services.email_service import (
    enviar_correo_retiro, 
    enviar_correo_cambio_curso,
    enviar_correo_solicitud_retiro,
    enviar_correo_confirmacion_retiro,
    enviar_correo_solicitud_cambio_curso,
    enviar_correo_confirmacion_cambio_curso
)
from services.utils import determinar_nivel_backend
from services import storage_service
from services.establecimientos_service import obtener_capacidad_curso
import re

def formatear_nivel_curso(curso_str: str) -> str:
    texto = (curso_str or "").upper()
    match = re.search(r'\d+', texto)
    numero = match.group(0) if match else ""
    if "MEDIO" in texto or "MEDIA" in texto:
        return f"{numero}MEDIO"
    if "BÁSICO" in texto or "BASICO" in texto:
        return f"{numero}BASICO"
    if "KINDER" in texto or "KÍNDER" in texto:
        return "PREKINDER" if "PRE" in texto else "KINDER"
    return re.sub(r'[^A-Z0-9]', '', texto)

def formatear_nombre_apoderado_resumido(nombres: str, apellido_paterno: str) -> str:
    if not nombres and not apellido_paterno:
        return "Pendiente"
    
    nombres_str = (nombres or "").replace(",", "").strip()
    apellido_str = (apellido_paterno or "").replace(",", "").strip()
    
    if not nombres_str and not apellido_str:
        return "Pendiente"
    if nombres_str.lower() == "apoderado" and apellido_str.lower() == "pendiente":
        return "Pendiente"
        
    primer_nombre = nombres_str.split()[0] if nombres_str else ""
    primer_apellido = apellido_str.split()[0] if apellido_str else ""
    
    resultado = f"{primer_nombre} {primer_apellido}".strip()
    return resultado if resultado else "Pendiente"

def obtener_anios_disponibles_db(establecimiento_id: int = None):
    """Lista de años con datos + el año por defecto, para poblar el selector del frontend."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if establecimiento_id is not None:
            cur.execute(
                "SELECT DISTINCT anio_escolar FROM matricula WHERE id_establecimiento = %s ORDER BY anio_escolar DESC",
                (establecimiento_id,),
            )
        else:
            cur.execute("SELECT DISTINCT anio_escolar FROM matricula ORDER BY anio_escolar DESC")
        anios = [f[0] for f in cur.fetchall()]
        return {"anios": anios, "por_defecto": anios[0] if anios else None}
    finally:
        cur.close()
        conn.close()

def obtener_todas_matriculas_db(
    establecimiento_id: int = None,
    page: int = 1,
    page_size: int = 50,
    anio: int = None,
    busqueda: str = None,
    curso: str = None,
    codigo: int = None,
):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        base_where = """
            FROM matricula m
            INNER JOIN estudiante e ON m.id_estudiante = e.id_estudiante
            LEFT JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado
            LEFT JOIN catalogo_tipo_ensenanza cte ON m.cod_tipo_ensenanza = cte.codigo
            INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            WHERE 1=1
        """
        parametros = []

        if establecimiento_id is not None:
            base_where += " AND m.id_establecimiento = %s"
            parametros.append(establecimiento_id)

        if anio is not None:
            base_where += " AND m.anio_escolar = %s"
            parametros.append(anio)

        if codigo is not None:
            base_where += " AND m.cod_tipo_ensenanza = %s"
            parametros.append(codigo)

        if curso:
            base_where += " AND m.curso = %s"
            parametros.append(curso)

        if busqueda and busqueda.strip():
            tokens = busqueda.strip().split()
            for token in tokens:
                like = f"%{token}%"
                base_where += """ AND (
                    e.nombres ILIKE %s OR e.apellido_paterno ILIKE %s OR
                    e.run_ipe ILIKE %s OR
                    a.nombres ILIKE %s OR a.apellido_paterno ILIKE %s OR
                    CAST(m.numero_correlativo AS TEXT) ILIKE %s
                )"""
                parametros.extend([like, like, like, like, like, like])

        # COUNT query
        cur.execute(f"SELECT COUNT(*) {base_where}", tuple(parametros))
        total = cur.fetchone()[0]

        # Data query
        offset = (page - 1) * page_size
        data_query = f"""
            SELECT m.id_matricula, m.numero_correlativo, m.nivel_ensenanza, m.curso, m.fecha_matricula, m.estado,
                   e.run_ipe, e.nombres, e.apellido_paterno, a.rut_pasaporte, a.nombres, a.apellido_paterno,
                   m.anio_escolar, cte.descripcion, est.rbd, m.cod_tipo_ensenanza, m.id_establecimiento,
                   m.es_excedente, m.numero_resolucion_excedente, m.fecha_resolucion_excedente, m.ruta_documento_resolucion,
                   m.motivo_cambio_curso, m.estado_renovacion
            {base_where}
            ORDER BY m.id_matricula DESC
            LIMIT %s OFFSET %s
        """
        cur.execute(data_query, tuple(parametros) + (page_size, offset))

        items = [{
            "id_matricula": f[0], "numero_correlativo": f[1], "nivel_ensenanza": f[2], "curso": f[3],
            "fecha_matricula": str(f[4]), "estado": f[5], "estudiante_rut": f[6], "estudiante_nombre": f"{f[7]} {f[8]}".strip(),
            "apoderado_rut": f[9] or "Sin registro", "apoderado_nombre": formatear_nombre_apoderado_resumido(f[10], f[11]),
            "anio_escolar": f[12], "tipo_ensenanza": f[13] or "Plan General", "rbd": f[14] or "Sin RBD",
            "cod_tipo_ensenanza": f[15], "id_establecimiento": f[16],
            "es_excedente": bool(f[17]),
            "numero_resolucion_excedente": f[18],
            "fecha_resolucion_excedente": str(f[19]) if f[19] else None,
            "ruta_documento_resolucion": f[20],
            "motivo_cambio_curso": f[21],
            "estado_renovacion": f[22]
        } for f in cur.fetchall()]

        import math
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": math.ceil(total / page_size) if page_size > 0 else 1,
        }
    finally:
        cur.close()
        conn.close()

def confirmar_renovacion_db(id_matricula: int, usuario_actual: dict):
    """Confirma la renovacion de una matricula PRE-CREADA (Opcion A): pasa
    estado_renovacion de 'Por renovar' a 'Pendiente firma'. No crea matricula
    nueva. Los datos de estudiante/apoderado/ficha se guardan aparte con
    PUT /estudiante/{rut} antes de llamar aqui.

    Reglas:
    - La matricula debe existir (404 si no).
    - El colegio solo puede confirmar matriculas de su establecimiento (403).
    - Solo se confirma si estado_renovacion = 'Por renovar' (409 en otro caso,
      salvo que ya este 'Pendiente firma' -> idempotente, devuelve ok).
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT m.id_establecimiento, m.estado_renovacion, m.anio_escolar,
                   e.run_ipe, e.id_apoderado_principal, e.id_apoderado_suplente
            FROM matricula m
            JOIN estudiante e ON e.id_estudiante = m.id_estudiante
            WHERE m.id_matricula = %s
        """, (id_matricula,))
        fila = cur.fetchone()
        if not fila:
            raise HTTPException(status_code=404, detail="Matrícula no encontrada.")

        id_est, estado_renov, anio, run_ipe, id_apod_ppal, id_apod_supl = fila

        # Permisos: un colegio solo confirma matriculas de su establecimiento.
        if usuario_actual and usuario_actual.get("rol") in ["Colegio", "Visualizador_Colegio"]:
            id_est_user = usuario_actual.get("id_establecimiento")
            if id_est_user and id_est != id_est_user:
                raise HTTPException(status_code=403, detail="No tiene permisos para confirmar esta matrícula.")

        # Idempotencia: si ya esta en 'Pendiente firma' o 'Firmada', no re-procesa.
        if estado_renov in ("Pendiente firma", "Firmada"):
            return {
                "ok": True, "id_matricula": id_matricula,
                "estado_renovacion": estado_renov, "rut_alumno": run_ipe,
                "anio_escolar": anio, "mensaje": "La renovación ya estaba registrada."
            }

        if estado_renov != "Por renovar":
            raise HTTPException(
                status_code=409,
                detail=f"La matrícula no está en estado 'Por renovar' (estado actual: {estado_renov or 'sin estado'})."
            )

        # Requisito para poder firmar en SIMPLE: debe existir apoderado cargado.
        if not id_apod_ppal and not id_apod_supl:
            raise HTTPException(
                status_code=422,
                detail="El estudiante no tiene apoderado registrado. Actualice la ficha del apoderado antes de enviar a firma."
            )

        cur.execute(
            "UPDATE matricula SET estado_renovacion = 'Pendiente firma' WHERE id_matricula = %s",
            (id_matricula,),
        )
        conn.commit()
        return {
            "ok": True, "id_matricula": id_matricula,
            "estado_renovacion": "Pendiente firma", "rut_alumno": run_ipe,
            "anio_escolar": anio, "mensaje": "Renovación confirmada. Envíe a firma al apoderado."
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al confirmar renovación: {e}")
    finally:
        cur.close()
        conn.close()


def guardar_documento_resolucion_db(id_matricula: int, archivo_bytes: bytes, filename: str, usuario_actual: dict):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id_establecimiento, es_excedente FROM matricula WHERE id_matricula = %s", (id_matricula,))
        mat = cur.fetchone()
        if not mat:
            raise HTTPException(status_code=404, detail="Matrícula no encontrada.")
        
        # Validar permisos
        if usuario_actual and usuario_actual.get("rol") in ["Colegio", "Visualizador_Colegio"]:
            id_est_user = usuario_actual.get("id_establecimiento")
            if id_est_user and mat[0] != id_est_user:
                raise HTTPException(status_code=403, detail="No tiene permisos para modificar esta matrícula.")

        ext = os.path.splitext(filename)[1].lower() if filename else ".pdf"
        if ext not in [".pdf", ".jpg", ".jpeg", ".png"]:
            ext = ".pdf"
            
        clave = f"resoluciones/res_mat_{id_matricula}_{uuid.uuid4().hex[:8]}{ext}"
        storage_service.guardar_archivo(archivo_bytes, clave, content_type="application/pdf")

        cur.execute("UPDATE matricula SET ruta_documento_resolucion = %s WHERE id_matricula = %s", (clave, id_matricula))
        conn.commit()
        return {"mensaje": "Documento de resolución guardado exitosamente.", "ruta": clave}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar documento de resolución: {e}")
    finally:
        cur.close()
        conn.close()

def obtener_ruta_documento_resolucion_db(id_matricula: int, usuario_actual: dict) -> str:
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id_establecimiento, ruta_documento_resolucion FROM matricula WHERE id_matricula = %s", (id_matricula,))
        mat = cur.fetchone()
        if not mat:
            raise HTTPException(status_code=404, detail="Matrícula no encontrada.")

        if usuario_actual and usuario_actual.get("rol") in ["Colegio", "Visualizador_Colegio"]:
            id_est_user = usuario_actual.get("id_establecimiento")
            if id_est_user and mat[0] != id_est_user:
                raise HTTPException(status_code=403, detail="No tiene permisos para consultar esta matrícula.")

        if not mat[1]:
            raise HTTPException(status_code=404, detail="Esta matrícula no tiene un documento de resolución adjunto.")

        return mat[1]
    finally:
        cur.close()
        conn.close()


def crear_nueva_matricula_db(matricula):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Bloqueo a nivel de transacción para prevenir carreras concurrentes en el mismo curso/colegio/año
        clave_bloqueo = f"{matricula.id_establecimiento}-{matricula.anio_escolar}-{matricula.curso}"
        cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (clave_bloqueo,))

        cursor.execute("""
            SELECT COALESCE(MAX(numero_correlativo), 0) 
            FROM matricula 
            WHERE id_establecimiento = %s AND anio_escolar = %s AND curso = %s
        """, (matricula.id_establecimiento, matricula.anio_escolar, matricula.curso))
        
        max_correlativo = cursor.fetchone()[0]
        nuevo_correlativo = max_correlativo + 1

        cursor.execute("""
            UPDATE matricula 
            SET estado = 'Anulada', 
                observaciones = CASE 
                    WHEN observaciones IS NULL OR observaciones = '' THEN 'Anulada automáticamente por registro de nueva matrícula.'
                    ELSE CONCAT(observaciones, ' | Anulada automáticamente por registro de nueva matrícula.')
                END
            WHERE id_estudiante = %s AND anio_escolar = %s AND estado = 'Activa'
        """, (matricula.id_estudiante, matricula.anio_escolar))


        es_practica = getattr(matricula, 'es_alumno_practica', False)
        es_excedente = getattr(matricula, 'es_excedente', False)
        num_resolucion = getattr(matricula, 'numero_resolucion_excedente', None)
        fecha_res = getattr(matricula, 'fecha_resolucion_excedente', None)
        if fecha_res == "":
            fecha_res = None

        query = """
            INSERT INTO matricula (
                numero_correlativo, anio_escolar, id_estudiante, id_establecimiento, 
                fecha_matricula, nivel_ensenanza, curso, estado, 
                cod_tipo_ensenanza, cod_grado, letra_curso, id_usuario_ejecutor,
                es_excedente, numero_resolucion_excedente, fecha_resolucion_excedente,
                es_alumno_practica,
                opcion_religion, acepta_compromiso, autoriza_entrevista, autoriza_imagen, metodo_firma, estado_firma
            ) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Pendiente') RETURNING id_matricula;
        """
        valores = (
            nuevo_correlativo, matricula.anio_escolar, matricula.id_estudiante, 
            matricula.id_establecimiento, matricula.fecha_matricula, matricula.nivel_ensenanza, 
            matricula.curso, getattr(matricula, 'estado', 'Activa'), 
            getattr(matricula, 'cod_tipo_ensenanza', None), getattr(matricula, 'cod_grado', None), 
            getattr(matricula, 'letra_curso', None), matricula.id_usuario_ejecutor,
            es_excedente, num_resolucion, fecha_res,es_practica,matricula.opcion_religion, matricula.acepta_compromiso, 
            matricula.autoriza_entrevista, matricula.autoriza_imagen, 
            matricula.metodo_firma       
        )
        cursor.execute(query, valores)
        nuevo_id = cursor.fetchone()[0]
        
        conn.commit()
        return {"mensaje": f"Matrícula creada. Se asignó automáticamente el folio #{nuevo_correlativo}.", "id_matricula": nuevo_id, "correlativo_asignado": nuevo_correlativo}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

def actualizar_estado_matricula_db(id_matricula: int, matricula, usuario_actual: dict = None, background_tasks = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id_establecimiento FROM matricula WHERE id_matricula = %s", (id_matricula,))
        mat_row = cursor.fetchone()
        if not mat_row:
            raise HTTPException(status_code=404, detail="Matrícula no encontrada")

        if usuario_actual and usuario_actual.get("rol") in ["Colegio", "Visualizador_Colegio"]:
            id_est_user = usuario_actual.get("id_establecimiento")
            if id_est_user and mat_row[0] != id_est_user:
                raise HTTPException(status_code=403, detail="No tiene permisos para modificar matrículas de otro establecimiento.")

        mensaje_alerta = ""
        estado_a_guardar = matricula.estado

        # Si se solicita retiro, NO se oficializa de inmediato: queda en 'Pendiente Retiro'
        # hasta que el apoderado complete obligatoriamente la encuesta.
        if matricula.estado == "Retirado":
            estado_a_guardar = "Pendiente Retiro"
            matricula.observaciones = f"Solicitud de retiro iniciada ({matricula.fecha_retiro or datetime.now().strftime('%Y-%m-%d')}). En espera de formalización mediante encuesta obligatoria del apoderado."
            matricula.motivo_retiro = "Pendiente de respuesta mediante cuestionario autoaplicado."

        cursor.execute("""
            UPDATE matricula SET estado = %s, fecha_retiro = %s, motivo_retiro = %s, observaciones = %s, id_usuario_ejecutor = %s WHERE id_matricula = %s RETURNING id_matricula;
        """, (estado_a_guardar, matricula.fecha_retiro, matricula.motivo_retiro, matricula.observaciones, matricula.id_usuario_ejecutor, id_matricula))
        
        if not cursor.fetchone(): 
            raise HTTPException(status_code=404, detail="Matrícula no encontrada")

        if matricula.estado == "Retirado":
            cursor.execute("""
                SELECT m.numero_correlativo, m.anio_escolar, m.nivel_ensenanza, m.curso, m.fecha_matricula,
                       e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno, e.sexo,
                       m.estado, m.fecha_retiro, m.motivo_cambio_curso, est.nombre, est.rbd,
                       a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno, e.domicilio,
                       a.correo_electronico
                FROM matricula m 
                INNER JOIN estudiante e ON m.id_estudiante = e.id_estudiante 
                INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
                LEFT JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado
                WHERE m.id_matricula = %s
            """, (id_matricula,))
            datos = cursor.fetchone()
            correo_ingresado = getattr(matricula, 'correo_destino', None)
            correo_apoderado = correo_ingresado if correo_ingresado else (datos[20] if datos else None)
            
            if datos and correo_apoderado:
                f_ret = str(matricula.fecha_retiro) if matricula.fecha_retiro else ""
                if background_tasks:
                    background_tasks.add_task(enviar_correo_solicitud_retiro, correo_apoderado, id_matricula, datos[6], f_ret)
                else:
                    exito, msg_error = enviar_correo_solicitud_retiro(correo_apoderado, id_matricula, datos[6], f_ret)
                    if not exito: mensaje_alerta = f"⚠️ Solicitud registrada, pero falló el envío de Gmail: {msg_error}"
            else:
                mensaje_alerta = "⚠️ Solicitud registrada, pero el estudiante NO TIENE apoderado con correo electrónico registrado."

        conn.commit()
        msg_exito = "Solicitud de retiro registrada exitosamente. Se ha enviado el cuestionario obligatorio al apoderado. El retiro se oficializará de forma automática cuando el apoderado complete y envíe la encuesta."
        return {"mensaje": mensaje_alerta if mensaje_alerta else msg_exito}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

def guardar_respuesta_cuestionario_db(id_matricula: int, payload):
    """
    Recibe la encuesta de retiro completada por el apoderado:
    1. Valida el RUT del estudiante.
    2. Oficializa el estado a 'Retirado' en la base de datos.
    3. Genera el Certificado Oficial de Retiro.
    4. Envía el Certificado Oficial al correo del apoderado.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT e.run_ipe, m.numero_correlativo, m.anio_escolar, m.nivel_ensenanza, m.curso, m.fecha_matricula,
                   e.nombres, e.apellido_paterno, e.apellido_materno, e.sexo,
                   m.fecha_retiro, m.motivo_cambio_curso, est.nombre, est.rbd,
                   a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno, e.domicilio,
                   a.correo_electronico
            FROM matricula m 
            INNER JOIN estudiante e ON m.id_estudiante = e.id_estudiante 
            INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            LEFT JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado
            WHERE m.id_matricula = %s
        """, (id_matricula,))
        datos = cur.fetchone()
        if not datos:
            raise HTTPException(status_code=404, detail="Matrícula no encontrada.")

        run_bd = str(datos[0]).strip().replace(".", "").upper()
        run_ingresado = str(payload.rut_estudiante).strip().replace(".", "").upper()
        if run_bd != run_ingresado:
            raise HTTPException(status_code=401, detail="El RUT ingresado no coincide con el estudiante registrado.")

        # Formalizar el retiro en la base de datos
        cur.execute("""
            UPDATE matricula 
            SET estado = 'Retirado', 
                motivo_retiro = 'Respuesta Apoderado (Confidencial)', 
                observaciones = %s,
                fecha_retiro = COALESCE(fecha_retiro, CURRENT_DATE)
            WHERE id_matricula = %s
        """, (payload.motivo_real, id_matricula))

        # Generar Certificado Oficial de Retiro
        nom_apod = f"{datos[15] or ''} {datos[16] or ''} {datos[17] or ''}".strip() or "Sin registro"
        domicilio = datos[18] if datos[18] else "los registros del establecimiento"
        f_retiro = datos[10] if datos[10] else datetime.now().strftime('%Y-%m-%d')
        
        datos_alumno = {
            "folio": datos[1], "anio": datos[2], "nivel": datos[3], "curso": datos[4],
            "fecha_matricula": datos[5], "rut": str(datos[0]).strip(),
            "nombre_completo": f"{datos[6]} {datos[7]} {datos[8]}".strip(),
            "sexo": datos[9], "estado": "Retirado", "fecha_retiro": f_retiro,
            "motivo_cambio": datos[11], "nombre_colegio": datos[12], "rbd_colegio": datos[13],
            "rut_apoderado": datos[14] if datos[14] else "Sin registro", 
            "nombre_apoderado": nom_apod, "domicilio": domicilio
        }

        hash_base = f"{datos_alumno['rut']}-{id_matricula}-SLEP{datos_alumno['anio']}"
        hash_corto = hashlib.sha256(hash_base.encode('utf-8')).hexdigest()[:6].upper()
        codigo_verificacion = f"VLP-{id_matricula}-{hash_corto}"

        pdf_buffer, _ = generar_certificado_pdf(datos_alumno, "RETIRO", codigo_verificacion)
        pdf_bytes = pdf_buffer.getvalue() if hasattr(pdf_buffer, 'getvalue') else pdf_buffer.read()

        correo_apoderado = datos[19]
        if correo_apoderado:
            enviar_correo_confirmacion_retiro(correo_apoderado, id_matricula, datos_alumno['nombre_completo'], pdf_bytes)

        conn.commit()
        return {"mensaje": "Cuestionario procesado exitosamente. El retiro del estudiante ha sido formalizado y se ha emitido el Certificado Oficial."}
    finally:
        cur.close()
        conn.close()

def guardar_respuesta_cuestionario_curso_db(id_matricula: int, payload):
    """
    Recibe la justificación de cambio de curso completada por el apoderado:
    1. Valida el RUT del estudiante.
    2. Lee la solicitud pendiente (PENDIENTE_TRASLADO|cod_plan|nuevo_curso).
    3. Asigna atómicamente el nuevo correlativo en la sala de destino y cambia el curso.
    4. Genera el Comprobante Oficial de Traslado.
    5. Envía el comprobante al correo del apoderado.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT e.run_ipe, m.curso, m.id_establecimiento, m.anio_escolar, m.numero_correlativo,
                   m.motivo_cambio_curso, m.observaciones, e.nombres, e.apellido_paterno, e.apellido_materno,
                   e.sexo, m.estado, m.fecha_matricula, m.fecha_retiro, est.nombre, est.rbd,
                   a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno, e.domicilio,
                   a.correo_electronico, m.nivel_ensenanza
            FROM matricula m 
            INNER JOIN estudiante e ON m.id_estudiante = e.id_estudiante 
            INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            LEFT JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado
            WHERE m.id_matricula = %s
        """, (id_matricula,))
        datos = cur.fetchone()
        if not datos:
            raise HTTPException(status_code=404, detail="Matrícula no encontrada.")

        run_bd = str(datos[0]).strip().replace(".", "").upper()
        run_ingresado = str(payload.rut_estudiante).strip().replace(".", "").upper()
        if run_bd != run_ingresado:
            raise HTTPException(status_code=401, detail="El RUT ingresado no coincide con el estudiante registrado.")

        curso_anterior = datos[1]
        id_establecimiento = datos[2]
        anio_escolar = datos[3]
        folio_antiguo = datos[4]
        motivo_actual = datos[5] or ""
        obs_actual = datos[6] or ""

        # Verificar si hay una solicitud pendiente con formato PENDIENTE_TRASLADO|cod_plan|nuevo_curso
        if motivo_actual.startswith("PENDIENTE_TRASLADO|"):
            partes = motivo_actual.split("|")
            nuevo_cod = int(partes[1])
            nuevo_curso = partes[2]
        else:
            # Si ya fue trasladado previamente o formato legacy, solo guardar motivo
            cur.execute("UPDATE matricula SET motivo_cambio_curso = %s WHERE id_matricula = %s", (payload.motivo_real, id_matricula))
            conn.commit()
            return {"mensaje": "Motivo de traslado guardado con éxito."}

        # Bloqueo atómico a nivel de curso/colegio/año
        clave_bloqueo = f"{id_establecimiento}-{anio_escolar}-{nuevo_curso}"
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (clave_bloqueo,))

        # Validar capacidad de sala antes de aplicar el traslado definitivo
        cur.execute("""
            SELECT COUNT(*) 
            FROM matricula 
            WHERE id_establecimiento = %s AND anio_escolar = %s AND curso = %s AND estado = 'Activa'
        """, (id_establecimiento, anio_escolar, nuevo_curso))
        matriculados_activos = cur.fetchone()[0]

        rbd_colegio = datos[15]
        nivel_str = formatear_nivel_curso(nuevo_curso)
        capacidad_maxima = obtener_capacidad_curso(rbd_colegio, anio_escolar, nivel_str)

        if matriculados_activos >= capacidad_maxima:
            raise HTTPException(
                status_code=400,
                detail=f"El curso '{nuevo_curso}' ha alcanzado su capacidad máxima permitida ({matriculados_activos}/{capacidad_maxima} cupos). No es posible concretar el traslado."
            )

        cur.execute("""
            SELECT COALESCE(MAX(numero_correlativo), 0) 
            FROM matricula 
            WHERE id_establecimiento = %s AND anio_escolar = %s AND curso = %s
        """, (id_establecimiento, anio_escolar, nuevo_curso))
        nuevo_correlativo = cur.fetchone()[0] + 1

        obs_actualizada = f"{obs_actual}\n[{datetime.now().strftime('%Y-%m-%d')}] Traslado formalizado tras justificación del apoderado. De '{curso_anterior}' (Folio #{folio_antiguo}) a '{nuevo_curso}' (Folio #{nuevo_correlativo})."

        # Aplicar el cambio de curso oficial
        cur.execute("""
            UPDATE matricula 
            SET cod_tipo_ensenanza = %s, curso = %s, numero_correlativo = %s, motivo_cambio_curso = %s, observaciones = %s 
            WHERE id_matricula = %s
        """, (nuevo_cod, nuevo_curso, nuevo_correlativo, payload.motivo_real, obs_actualizada.strip(), id_matricula))

        # Generar comprobante oficial de traslado
        nombre_completo = f"{datos[7]} {datos[8]} {datos[9]}".strip()
        nom_apod = f"{datos[17] or ''} {datos[18] or ''} {datos[19] or ''}".strip() or "Sin registro"
        domicilio = datos[20] if datos[20] else "los registros del establecimiento"

        datos_alumno = {
            "folio": nuevo_correlativo, "anio": anio_escolar, "nivel": datos[22], "curso": nuevo_curso,
            "fecha_matricula": datos[12], "rut": str(datos[0]).strip(),
            "nombre_completo": nombre_completo,
            "sexo": datos[10], "estado": datos[11], "fecha_retiro": datos[13],
            "motivo_cambio": payload.motivo_real, "nombre_colegio": datos[14], "rbd_colegio": datos[15],
            "rut_apoderado": datos[16] if datos[16] else "Sin registro", 
            "nombre_apoderado": nom_apod, "domicilio": domicilio
        }

        hash_base = f"{datos_alumno['rut']}-{id_matricula}-SLEP{datos_alumno['anio']}"
        hash_corto = hashlib.sha256(hash_base.encode('utf-8')).hexdigest()[:6].upper()
        codigo_verificacion = f"VLP-{id_matricula}-{hash_corto}"

        pdf_buffer, _ = generar_certificado_pdf(datos_alumno, "CAMBIO_CURSO", codigo_verificacion)
        pdf_bytes = pdf_buffer.getvalue() if hasattr(pdf_buffer, 'getvalue') else pdf_buffer.read()

        correo_apoderado = datos[21]
        if correo_apoderado:
            enviar_correo_confirmacion_cambio_curso(correo_apoderado, id_matricula, nombre_completo, nuevo_curso, pdf_bytes)

        conn.commit()
        return {"mensaje": "Justificación recibida exitosamente. El cambio de curso ha sido aplicado y la constancia oficial fue emitida."}
    finally:
        cur.close()
        conn.close()

def registrar_cambio_curso_db(id_matricula: int, req, usuario_actual: dict = None, background_tasks = None):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT m.anio_escolar, m.estado, m.curso, m.observaciones, e.nombres, a.correo_electronico,
                   m.numero_correlativo, m.nivel_ensenanza, m.fecha_matricula, e.run_ipe, e.apellido_paterno,
                   e.apellido_materno, e.sexo, m.fecha_retiro, est.nombre, est.rbd, a.rut_pasaporte,
                   a.nombres, a.apellido_paterno, a.apellido_materno, e.domicilio, m.id_establecimiento
            FROM matricula m
            INNER JOIN estudiante e ON m.id_estudiante = e.id_estudiante
            INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            LEFT JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado
            WHERE m.id_matricula = %s
        """, (id_matricula,))
        datos = cur.fetchone()
        
        if not datos: raise HTTPException(status_code=404, detail="Matrícula no encontrada")
        if datos[0] != datetime.now().year: raise HTTPException(status_code=400, detail="Solo se puede cambiar curso en año vigente.")
        if datos[1] != 'Activa': raise HTTPException(status_code=400, detail="El alumno debe estar activo.")
            
        id_establecimiento = datos[21]

        if usuario_actual and usuario_actual.get("rol") in ["Colegio", "Visualizador_Colegio"]:
            id_est_user = usuario_actual.get("id_establecimiento")
            if id_est_user and id_establecimiento != id_est_user:
                raise HTTPException(status_code=403, detail="No tiene permisos para cambiar curso a estudiantes de otro establecimiento.")

        # VALIDAR CAPACIDAD DE SALA ANTES DE REGISTRAR SOLICITUD
        cur.execute("""
            SELECT COUNT(*) 
            FROM matricula 
            WHERE id_establecimiento = %s 
              AND anio_escolar = %s 
              AND curso = %s 
              AND estado = 'Activa'
        """, (id_establecimiento, datos[0], req.nuevo_curso))
        matriculados_activos = cur.fetchone()[0]

        rbd_colegio = datos[15]
        nivel_str = formatear_nivel_curso(req.nuevo_curso)
        capacidad_maxima = obtener_capacidad_curso(rbd_colegio, datos[0], nivel_str)

        if matriculados_activos >= capacidad_maxima:
            raise HTTPException(
                status_code=400, 
                detail=f"El curso '{req.nuevo_curso}' ha alcanzado su capacidad máxima ({matriculados_activos}/{capacidad_maxima} cupos). No es posible solicitar el traslado hacia un curso lleno."
            )

        # Guardamos la solicitud de traslado como PENDIENTE sin mover aún al estudiante de curso.
        # El cambio se efectúa cuando el apoderado complete la justificación obligatoria.
        nueva_observacion = f"{datos[3] or ''}\n[{datetime.now().strftime('%Y-%m-%d')}] Solicitud de traslado hacia '{req.nuevo_curso}'. En espera de justificación obligatoria del apoderado."
        motivo_provisional = f"PENDIENTE_TRASLADO|{req.cod_tipo_ensenanza}|{req.nuevo_curso}"

        cur.execute("""
            UPDATE matricula 
            SET observaciones = %s, motivo_cambio_curso = %s 
            WHERE id_matricula = %s
        """, (nueva_observacion.strip(), motivo_provisional, id_matricula))
        
        mensaje_alerta = ""
        correo_ingresado = getattr(req, 'correo_destino', None)      
        correo_apoderado = correo_ingresado if correo_ingresado else datos[5]  
        nombre_alumno = datos[4]
        
        if correo_apoderado:
            if background_tasks:
                background_tasks.add_task(enviar_correo_solicitud_cambio_curso, correo_apoderado, id_matricula, nombre_alumno, req.nuevo_curso)
            else:
                exito, msg_error = enviar_correo_solicitud_cambio_curso(correo_apoderado, id_matricula, nombre_alumno, req.nuevo_curso)
                if not exito: mensaje_alerta = f"⚠️ Solicitud registrada, pero falló el envío a Gmail: {msg_error}"
        else:
            mensaje_alerta = "⚠️ Solicitud registrada, pero el estudiante NO TIENE apoderado con correo registrado."

        conn.commit()
        msg_exito = f"Solicitud de traslado hacia '{req.nuevo_curso}' registrada exitosamente. Se envió el formulario de justificación al apoderado. El cambio de curso se aplicará automáticamente en cuanto el apoderado complete la encuesta."
        return {"status": "success", "mensaje": mensaje_alerta if mensaje_alerta else msg_exito}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


def generar_pdf_certificado_db(id_matricula: int, tipo: str, usuario_actual: dict = None):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT m.numero_correlativo, m.anio_escolar, m.nivel_ensenanza, m.curso, m.fecha_matricula,
                   e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno, e.sexo,
                   m.estado, m.fecha_retiro, m.motivo_cambio_curso, est.nombre, est.rbd,
                   a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno, e.domicilio,
                   m.id_establecimiento, m.estado_renovacion
            FROM matricula m 
            INNER JOIN estudiante e ON m.id_estudiante = e.id_estudiante 
            INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            LEFT JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado
            WHERE m.id_matricula = %s
        """, (id_matricula,))
        datos = cur.fetchone()
        
        if not datos: raise HTTPException(status_code=404, detail="Matrícula no encontrada")
        
        if usuario_actual and usuario_actual.get("rol") in ["Colegio", "Visualizador_Colegio"]:
            id_est_user = usuario_actual.get("id_establecimiento")
            if id_est_user and datos[20] != id_est_user:
                raise HTTPException(status_code=403, detail="No tiene permisos para descargar certificados de otro establecimiento.")

        # Candado: no se puede emitir el documento de una matrícula en renovación
        # que aún no ha sido firmada por el apoderado en SIMPLE.
        estado_renov = datos[21]
        if estado_renov in ("Por renovar", "Pendiente firma"):
            raise HTTPException(
                status_code=409,
                detail="No se puede emitir el documento: la matrícula aún no ha sido firmada por el apoderado.",
            )
        
        rut_apod = datos[15] if datos[15] else "Sin registro"
        nom_apod = f"{datos[16] or ''} {datos[17] or ''} {datos[18] or ''}".strip()
        if not nom_apod: nom_apod = "Sin registro"
        domicilio = datos[19] if datos[19] else "los registros del establecimiento"

        datos_alumno = {
            "folio": datos[0], "anio": datos[1], "nivel": datos[2], "curso": datos[3],
            "fecha_matricula": datos[4], "rut": str(datos[5]).strip(),
            "nombre_completo": f"{datos[6]} {datos[7]} {datos[8]}".strip(),
            "sexo": datos[9], "estado": datos[10], "fecha_retiro": datos[11],
            "motivo_cambio": datos[12], "nombre_colegio": datos[13], "rbd_colegio": datos[14],
            "rut_apoderado": rut_apod, "nombre_apoderado": nom_apod, "domicilio": domicilio
        }
        
        hash_base = f"{datos_alumno['rut']}-{id_matricula}-SLEP{datos_alumno['anio']}"
        hash_corto = hashlib.sha256(hash_base.encode('utf-8')).hexdigest()[:6].upper()
        codigo_verificacion = f"VLP-{id_matricula}-{hash_corto}"
        
        pdf_buffer, _ = generar_certificado_pdf(datos_alumno, tipo, codigo_verificacion)
        return pdf_buffer, datos_alumno['rut']
    finally:
        cur.close()
        conn.close()

async def procesar_carga_masiva_db(archivos, usuario_actual):
    """
    Carga masiva adaptada para archivos SIGE (.xls / HTML):
    - Detecta traslados/cambios de curso y asigna un nuevo correlativo en el curso de destino.
    - Respeta correlativos de alumnos que continúan en el mismo curso.
    - Procesa en orden cronológico para asegurar que la matrícula activa quede vigente.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        total_alumnos_nuevos = 0
        total_alumnos_actualizados = 0
        total_alumnos_trasladados = 0
        id_ejecutor = usuario_actual.get('id_usuario', 1)
        correlativos_actuales = {}

        for archivo in archivos:
            contenido = await archivo.read()
            tablas = None
            try:
                tablas = pd.read_html(io.BytesIO(contenido), encoding='latin1')
            except Exception:
                try:
                    tablas = pd.read_html(io.BytesIO(contenido), encoding='utf-8')
                except Exception:
                    continue
            
            if not tablas: continue
            df = tablas[0].where(pd.notnull(tablas[0]), None)

            # Ordenar para que si un alumno tiene 2 filas (retirado de un curso y activo en otro),
            # se procese primero el retiro y al final su curso activo definitivo.
            def es_retirado(val):
                s = str(val).strip()
                if not s or s == 'None' or s.startswith('1900'):
                    return 1  # Activo -> procesar al final
                return 0      # Retirado -> procesar primero

            df['orden_activo'] = df['Fecha Retiro'].apply(es_retirado)
            df['f_incorp_dt'] = pd.to_datetime(df['Fecha Incorporación Curso'], errors='coerce')
            df = df.sort_values(by=['orden_activo', 'f_incorp_dt'], ascending=[True, True]).reset_index(drop=True)
            
            for index, row in df.iterrows():
                rbd_excel = str(row.get('RBD', '')).strip()
                id_colegio = usuario_actual.get('id_establecimiento', 1)
                
                if rbd_excel and rbd_excel != 'None':
                    cur.execute("SELECT id_establecimiento FROM establecimiento WHERE rbd = %s", (rbd_excel,))
                    resultado_colegio = cur.fetchone()
                    if resultado_colegio:
                        id_colegio = resultado_colegio[0]
                    else:
                        cur.execute(
                            "INSERT INTO establecimiento (rbd, nombre, tipo_local) VALUES (%s, %s, 'Generado por SIGE') RETURNING id_establecimiento;", 
                            (rbd_excel, f"Colegio RBD {rbd_excel}")
                        )
                        id_colegio = cur.fetchone()[0]

                rut_alumno = str(row.get('Run', '')).strip()
                dv_alumno = str(row.get('Dígito Ver.', '')).strip()
                if rut_alumno == 'None' or not rut_alumno: continue
                run_completo = f"{rut_alumno}-{dv_alumno}"
                
                nombres = str(row.get('Nombres', '')).strip() or "Sin Nombre"
                ap_paterno = str(row.get('Apellido Paterno', '')).strip() or "Sin Apellido"
                ap_materno = str(row.get('Apellido Materno', '')).strip()
                if ap_materno == 'None': ap_materno = ''

                genero_excel = str(row.get('Genero', '')).strip().upper()
                if genero_excel == 'F': sexo_db = "Femenino"
                elif genero_excel == 'M': sexo_db = "Masculino"
                else: sexo_db = "No Informado"
                
                fecha_nac = str(row.get('Fecha Nacimiento', '')).strip()
                fecha_nac_str = "2000-01-01" if not fecha_nac or fecha_nac == 'None' else fecha_nac.split(' ')[0]
                    
                direccion_excel = str(row.get('Dirección', '')).strip()
                comuna_excel = str(row.get('Comuna Residencia', '')).strip()
                dir_limpia = "" if direccion_excel == 'None' else direccion_excel
                comuna_limpia = "" if comuna_excel == 'None' else comuna_excel
                domicilio_final = f"{dir_limpia} {comuna_limpia}".strip() or "Sin registro"

                try: anio_escolar = int(float(row.get('Año', 2026)))
                except: anio_escolar = 2026

                fecha_incorp = str(row.get('Fecha Incorporación Curso', '')).strip()
                fecha_matricula_str = pd.Timestamp.now().strftime('%Y-%m-%d') if not fecha_incorp or fecha_incorp == 'None' else fecha_incorp.split(' ')[0]

                fecha_retiro_excel = str(row.get('Fecha Retiro', row.get('Fec. Retiro', ''))).strip()
                estado_matricula = 'Activa'
                fecha_retiro_db = None
                if fecha_retiro_excel and fecha_retiro_excel != 'None':
                    fecha_retiro_limpia = fecha_retiro_excel.split(' ')[0]
                    if not fecha_retiro_limpia.startswith('1900'):
                        estado_matricula = 'Inactiva'
                        fecha_retiro_db = fecha_retiro_limpia

                try: cod_ensenanza = int(float(row.get('Cod Tipo Enseñanza')))
                except: cod_ensenanza = None
                try: cod_grado = int(float(row.get('Cod Grado')))
                except: cod_grado = None

                desc_grado = str(row.get('Desc Grado', '')).strip()
                if desc_grado == 'None': desc_grado = ''
                letra_curso = str(row.get('Letra Curso', '')).strip()
                if letra_curso == 'None': letra_curso = ''

                if cod_ensenanza is not None:
                    cur.execute("INSERT INTO catalogo_tipo_ensenanza (codigo, descripcion) VALUES (%s, 'Importado desde SIGE') ON CONFLICT (codigo) DO NOTHING;", (cod_ensenanza,))
                if cod_grado is not None:
                    cur.execute("INSERT INTO catalogo_grado (codigo, descripcion) VALUES (%s, %s) ON CONFLICT (codigo) DO NOTHING;", (cod_grado, desc_grado))

                # Registrar o actualizar estudiante
                cur.execute("""
                    INSERT INTO estudiante (run_ipe, nombres, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, domicilio)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (run_ipe) 
                    DO UPDATE SET nombres = EXCLUDED.nombres, apellido_paterno = EXCLUDED.apellido_paterno, apellido_materno = EXCLUDED.apellido_materno, sexo = EXCLUDED.sexo, fecha_nacimiento = COALESCE(EXCLUDED.fecha_nacimiento, estudiante.fecha_nacimiento), domicilio = COALESCE(EXCLUDED.domicilio, estudiante.domicilio)
                    RETURNING id_estudiante;
                """, (run_completo, nombres, ap_paterno, ap_materno, sexo_db, fecha_nac_str, domicilio_final))
                
                resultado_estudiante = cur.fetchone()
                if resultado_estudiante: 
                    id_estudiante = resultado_estudiante[0]
                else:
                    cur.execute("SELECT id_estudiante FROM estudiante WHERE run_ipe = %s", (run_completo,))
                    id_estudiante = cur.fetchone()[0]

                curso_texto = f"{desc_grado} {letra_curso}".strip() if desc_grado else "Sin Asignar"
                nivel_calculado = determinar_nivel_backend(curso_texto, cod_ensenanza)
                
                # Verificar si el alumno ya tiene matrícula previa en este establecimiento y año
                cur.execute("""
                    SELECT id_matricula, curso, cod_tipo_ensenanza, numero_correlativo 
                    FROM matricula 
                    WHERE id_estudiante = %s AND id_establecimiento = %s AND anio_escolar = %s
                """, (id_estudiante, id_colegio, anio_escolar))
                matricula_existente = cur.fetchone()
                
                if matricula_existente:
                    id_mat_antigua, curso_antiguo, cod_ens_antiguo, folio_antiguo = matricula_existente
                    
                    # ¿El alumno cambió de curso o plan de enseñanza?
                    if curso_antiguo != curso_texto or cod_ens_antiguo != cod_ensenanza:
                        # TRASLADO: Asignar nuevo correlativo en el curso nuevo
                        llave_correlativo = (id_colegio, anio_escolar, cod_ensenanza, curso_texto)
                        if llave_correlativo not in correlativos_actuales:
                            cur.execute("""
                                SELECT COALESCE(MAX(numero_correlativo), 0) FROM matricula 
                                WHERE id_establecimiento = %s AND anio_escolar = %s 
                                  AND cod_tipo_ensenanza IS NOT DISTINCT FROM %s 
                                  AND curso IS NOT DISTINCT FROM %s
                            """, (id_colegio, anio_escolar, cod_ensenanza, curso_texto))
                            correlativos_actuales[llave_correlativo] = cur.fetchone()[0]

                        correlativos_actuales[llave_correlativo] += 1
                        nuevo_correlativo = correlativos_actuales[llave_correlativo]

                        obs_traslado = f"Trasladado desde '{curso_antiguo}' (Folio anterior: #{folio_antiguo})"
                        cur.execute("""
                            UPDATE matricula SET 
                                cod_tipo_ensenanza = %s, 
                                cod_grado = %s, 
                                letra_curso = %s, 
                                curso = %s, 
                                numero_correlativo = %s, 
                                nivel_ensenanza = %s,
                                fecha_retiro = %s, 
                                estado = %s,
                                motivo_cambio_curso = COALESCE(motivo_cambio_curso, %s),
                                observaciones = CASE 
                                    WHEN observaciones IS NULL OR observaciones = '' THEN %s
                                    WHEN observaciones LIKE %s THEN observaciones
                                    ELSE CONCAT(observaciones, ' | ', %s)
                                END
                            WHERE id_matricula = %s
                        """, (
                            cod_ensenanza, cod_grado, letra_curso, curso_texto, 
                            nuevo_correlativo, nivel_calculado, fecha_retiro_db, 
                            estado_matricula, obs_traslado, obs_traslado, f"%{obs_traslado}%", obs_traslado, 
                            id_mat_antigua
                        ))
                        total_alumnos_trasladados += 1
                    else:
                        # MISMO CURSO: Mantiene su correlativo original
                        cur.execute("""
                            UPDATE matricula SET 
                                cod_grado = %s, 
                                letra_curso = %s, 
                                fecha_retiro = %s, 
                                estado = %s,
                                nivel_ensenanza = %s
                            WHERE id_matricula = %s
                        """, (cod_grado, letra_curso, fecha_retiro_db, estado_matricula, nivel_calculado, id_mat_antigua))
                        total_alumnos_actualizados += 1
                else:
                    # MATRÍCULA NUEVA
                    llave_correlativo = (id_colegio, anio_escolar, cod_ensenanza, curso_texto)
                    if llave_correlativo not in correlativos_actuales:
                        cur.execute("""
                            SELECT COALESCE(MAX(numero_correlativo), 0) FROM matricula 
                            WHERE id_establecimiento = %s AND anio_escolar = %s 
                              AND cod_tipo_ensenanza IS NOT DISTINCT FROM %s 
                              AND curso IS NOT DISTINCT FROM %s
                        """, (id_colegio, anio_escolar, cod_ensenanza, curso_texto))
                        correlativos_actuales[llave_correlativo] = cur.fetchone()[0]

                    correlativos_actuales[llave_correlativo] += 1
                    nuevo_correlativo = correlativos_actuales[llave_correlativo]
                    
                    cur.execute("""
                        INSERT INTO matricula (
                            id_estudiante, id_establecimiento, numero_correlativo, estado, 
                            cod_tipo_ensenanza, cod_grado, letra_curso, curso, nivel_ensenanza, 
                            anio_escolar, fecha_matricula, id_usuario_ejecutor, fecha_retiro
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        id_estudiante, id_colegio, nuevo_correlativo, estado_matricula, 
                        cod_ensenanza, cod_grado, letra_curso, curso_texto, nivel_calculado, 
                        anio_escolar, fecha_matricula_str, id_ejecutor, fecha_retiro_db
                    ))
                    total_alumnos_nuevos += 1
            
        conn.commit()
        return {
            "mensaje": f"✅ Éxito: {total_alumnos_nuevos} alumnos nuevos matriculados, {total_alumnos_trasladados} cambios de curso reasignados con nuevo folio y {total_alumnos_actualizados} actualizados."
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error en la carga masiva: {str(e)}")
    finally:
        cur.close()
        conn.close()

def obtener_colegio_procedencia_db(rut_estudiante: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT est.nombre, est.rbd, m.estado, m.anio_escolar, m.curso, m.id_establecimiento
            FROM matricula m
            INNER JOIN estudiante e ON m.id_estudiante = e.id_estudiante
            INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            WHERE REPLACE(REPLACE(REPLACE(UPPER(e.run_ipe), '.', ''), '-', ''), ' ', '') = REPLACE(REPLACE(REPLACE(UPPER(%s), '.', ''), '-', ''), ' ', '')
               OR e.run_ipe = %s
            ORDER BY m.anio_escolar DESC, m.fecha_matricula DESC, m.id_matricula DESC
            LIMIT 1
        """, (rut_estudiante.strip(), rut_estudiante.strip()))
        
        resultado = cursor.fetchone()
        if not resultado:
            return {"encontrado": False, "colegio_procedencia": "Estudiante Nuevo (Sin registros previos en el sistema)", "id_establecimiento_previo": None}
            
        return {
            "encontrado": True, "colegio_procedencia": resultado[0], "rbd_procedencia": resultado[1],
            "estado_previo": resultado[2], "anio_previo": resultado[3], "curso_previo": resultado[4], "id_establecimiento_previo": resultado[5]
        }
    finally:
        cursor.close()
        conn.close()
        
def obtener_opciones_filtro_excel(id_establecimiento: int = None):
    """
    Devuelve los años escolares, cursos, planes de estudio y el mapa
    cursos_por_plan (dict: codigo_plan -> [cursos]) disponibles en la BD.
    Respeta el filtro de establecimiento si se provee.
    Usado para poblar los selects del modal de descarga Excel.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        filtro_est = "WHERE id_establecimiento = %s" if id_establecimiento else ""
        params = (id_establecimiento,) if id_establecimiento else ()

        # Años disponibles
        cur.execute(
            f"SELECT DISTINCT anio_escolar FROM matricula {filtro_est} ORDER BY anio_escolar DESC",
            params
        )
        anios = [r[0] for r in cur.fetchall() if r[0]]

        # Todos los cursos (para cuando no hay plan seleccionado)
        cur.execute(
            f"SELECT DISTINCT curso FROM matricula {filtro_est} ORDER BY curso ASC",
            params
        )
        cursos = [r[0] for r in cur.fetchall() if r[0]]

        # Planes de estudio
        cur.execute(f"""
            SELECT DISTINCT m.cod_tipo_ensenanza, COALESCE(c.descripcion, 'Sin descripción')
            FROM matricula m
            LEFT JOIN catalogo_tipo_ensenanza c ON m.cod_tipo_ensenanza = c.codigo
            {"WHERE m.id_establecimiento = %s" if id_establecimiento else ""}
            ORDER BY m.cod_tipo_ensenanza ASC
        """, params)
        planes = [{"codigo": r[0], "descripcion": r[1]} for r in cur.fetchall() if r[0]]

        # Mapa plan -> cursos: una sola query adicional que relaciona ambos
        cur.execute(f"""
            SELECT DISTINCT cod_tipo_ensenanza, curso
            FROM matricula
            {filtro_est}
            ORDER BY cod_tipo_ensenanza ASC, curso ASC
        """, params)
        cursos_por_plan: dict = {}
        for cod_plan, curso in cur.fetchall():
            if cod_plan is None or not curso:
                continue
            key = str(cod_plan)
            cursos_por_plan.setdefault(key, []).append(curso)

        return {
            "anios": anios,
            "cursos": cursos,
            "planes": planes,
            "cursos_por_plan": cursos_por_plan
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error al obtener opciones de filtro: " + str(e))
    finally:
        cur.close()
        conn.close()


def exportar_matriculas_excel_service(id_establecimiento: int = None, anio: str = None, codigo_plan: str = None, curso: str = None):
    """
    Extrae las matrículas con TODA la información disponible del alumno, apoderados
    y ficha de salud, y genera un libro Excel (.xlsx) con 4 pestañas organizadas.
    Si id_establecimiento es None, exporta todos los establecimientos (uso SLEP global).
    """
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        # ---------------------------------------------------------------
        # 1. Consulta principal: matrícula + estudiante completo + est.
        # ---------------------------------------------------------------
        query = """
            SELECT
                -- Matrícula
                m.id_matricula,
                est.nombre              AS establecimiento,
                m.numero_correlativo,
                m.anio_escolar,
                m.estado,
                m.fecha_matricula,
                m.fecha_retiro,
                m.motivo_retiro,
                m.nivel_ensenanza,
                m.curso,
                m.letra_curso,
                m.cod_tipo_ensenanza,
                m.es_excedente,
                m.numero_resolucion_excedente,
                m.es_alumno_practica,
                m.opcion_religion,
                -- Estudiante
                e.run_ipe,
                e.nombres,
                e.apellido_paterno,
                e.apellido_materno,
                e.sexo,
                e.fecha_nacimiento,
                e.domicilio,
                -- Apoderado Principal
                ap.rut_pasaporte        AS ap_rut,
                ap.nombres              AS ap_nombres,
                ap.apellido_paterno     AS ap_ap_pat,
                ap.apellido_materno     AS ap_ap_mat,
                ap.telefono             AS ap_telefono,
                ap.correo_electronico   AS ap_correo,
                ap.domicilio            AS ap_domicilio,
                ap.relacion_estudiante  AS ap_relacion,
                -- Apoderado Suplente
                asup.rut_pasaporte      AS as_rut,
                asup.nombres            AS as_nombres,
                asup.apellido_paterno   AS as_ap_pat,
                asup.apellido_materno   AS as_ap_mat,
                asup.telefono           AS as_telefono,
                asup.correo_electronico AS as_correo,
                asup.domicilio          AS as_domicilio,
                asup.relacion_estudiante AS as_relacion,
                -- Ficha de Salud
                fs.sistema_salud,
                fs.letra_fonasa,
                fs.cesfam,
                fs.centro_emergencia,
                fs.alergias,
                fs.diagnostico_medico,
                fs.medico_tratante,
                fs.medicamento,
                fs.nee,
                fs.nee_tipo
            FROM matricula m
            INNER JOIN estudiante e        ON m.id_estudiante      = e.id_estudiante
            LEFT JOIN apoderado ap         ON e.id_apoderado_principal = ap.id_apoderado
            LEFT JOIN apoderado asup       ON e.id_apoderado_suplente  = asup.id_apoderado
            LEFT JOIN ficha_salud fs       ON e.id_estudiante      = fs.id_estudiante
            LEFT JOIN establecimiento est  ON m.id_establecimiento  = est.id_establecimiento
            WHERE 1=1
        """
        params = []

        if id_establecimiento:
            query += " AND m.id_establecimiento = %s"
            params.append(id_establecimiento)
        if anio:
            query += " AND m.anio_escolar = %s"
            params.append(int(anio))
        if codigo_plan:
            query += " AND m.cod_tipo_ensenanza = %s"
            params.append(int(codigo_plan))
        if curso and curso.strip():
            query += " AND m.curso = %s"
            params.append(curso.strip())

        query += " ORDER BY est.nombre ASC, m.anio_escolar DESC, m.curso ASC, e.apellido_paterno ASC"

        cur.execute(query, tuple(params))
        filas = cur.fetchall()

        # ---------------------------------------------------------------
        # 2. Crear libro Excel con estilo de cabeceras
        # ---------------------------------------------------------------
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter

        wb = openpyxl.Workbook()

        COLOR_MATRICULA  = "1F3864"   # azul oscuro
        COLOR_ESTUDIANTE = "1F6464"   # verde azulado
        COLOR_APOD_PRINC = "6A4C93"   # violeta
        COLOR_APOD_SUPL  = "C25B00"   # naranja oscuro
        COLOR_SALUD      = "8B0000"   # rojo oscuro

        def estilizar_hoja(ws, encabezados, color_hex):
            """Aplica formato a la fila de encabezados."""
            fill = PatternFill("solid", fgColor=color_hex)
            font = Font(bold=True, color="FFFFFF", size=10)
            border_side = Side(style="thin", color="CCCCCC")
            borde = Border(left=border_side, right=border_side,
                           top=border_side, bottom=border_side)
            ws.append(encabezados)
            for col_idx, _ in enumerate(encabezados, start=1):
                cell = ws.cell(row=1, column=col_idx)
                cell.fill = fill
                cell.font = font
                cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                cell.border = borde
                ws.column_dimensions[get_column_letter(col_idx)].width = max(14, len(str(encabezados[col_idx - 1])) + 4)
            ws.row_dimensions[1].height = 32
            ws.freeze_panes = "A2"

        # ---------------------------------------------------------------
        # HOJA 1 — Matrícula (datos académicos + identificación estudiante)
        # ---------------------------------------------------------------
        ws1 = wb.active
        ws1.title = "Matrícula"
        enc1 = [
            "ID Matrícula", "Establecimiento", "N° Correlativo", "Año Escolar",
            "Estado", "Fecha Matrícula", "Fecha Retiro", "Motivo Retiro",
            "Nivel", "Curso", "Letra Curso", "Cód. Enseñanza",
            "Excedente", "N° Resolución Excedente", "Alumno Práctica", "Opción Religión",
            # Estudiante — identificación
            "RUT/IPE Estudiante", "Nombres", "Ap. Paterno", "Ap. Materno",
            "Sexo", "Fecha Nacimiento", "Domicilio Estudiante",
        ]
        estilizar_hoja(ws1, enc1, COLOR_MATRICULA)
        for f in filas:
            fila_ws1 = (
                f[0],   # id_matricula
                f[1],   # establecimiento
                f[2],   # correlativo
                f[3],   # anio
                f[4],   # estado
                str(f[5]) if f[5] else "",   # fecha_matricula
                str(f[6]) if f[6] else "",   # fecha_retiro
                f[7] or "",                  # motivo_retiro
                f[8],   # nivel
                f[9],   # curso
                f[10],  # letra_curso
                f[11],  # cod_tipo_ensenanza
                "Sí" if f[12] else "No",    # es_excedente
                f[13] or "",                 # num_resolucion
                "Sí" if f[14] else "No",    # es_alumno_practica
                f[15] or "",                 # opcion_religion
                f[16],  # run_ipe
                f[17],  # nombres
                f[18],  # ap_paterno
                f[19],  # ap_materno
                f[20],  # sexo
                str(f[21]) if f[21] else "",  # fecha_nacimiento
                f[22] or "",                  # domicilio
            )
            ws1.append(fila_ws1)

        # ---------------------------------------------------------------
        # HOJA 2 — Apoderado Principal
        # ---------------------------------------------------------------
        ws2 = wb.create_sheet("Apoderado Principal")
        enc2 = [
            "ID Matrícula", "RUT/IPE Estudiante", "Nombres Estudiante", "Ap. Paterno", "Ap. Materno",
            "RUT Apoderado", "Nombres Apoderado", "Ap. Paterno Apod.", "Ap. Materno Apod.",
            "Teléfono", "Correo Electrónico", "Domicilio Apoderado", "Relación con Estudiante",
        ]
        estilizar_hoja(ws2, enc2, COLOR_APOD_PRINC)
        for f in filas:
            ws2.append((
                f[0], f[16], f[17], f[18], f[19],
                f[23] or "", f[24] or "", f[25] or "", f[26] or "",
                f[27] or "", f[28] or "", f[29] or "", f[30] or "",
            ))

        # ---------------------------------------------------------------
        # HOJA 3 — Apoderado Suplente
        # ---------------------------------------------------------------
        ws3 = wb.create_sheet("Apoderado Suplente")
        enc3 = [
            "ID Matrícula", "RUT/IPE Estudiante", "Nombres Estudiante", "Ap. Paterno", "Ap. Materno",
            "RUT Apoderado Suplente", "Nombres", "Ap. Paterno Supl.", "Ap. Materno Supl.",
            "Teléfono", "Correo Electrónico", "Domicilio", "Relación con Estudiante",
        ]
        estilizar_hoja(ws3, enc3, COLOR_APOD_SUPL)
        for f in filas:
            # Solo agregar fila si el suplente tiene RUT registrado
            tiene_suplente = bool(f[31])
            ws3.append((
                f[0], f[16], f[17], f[18], f[19],
                f[31] or "Sin suplente registrado",
                f[32] or "", f[33] or "", f[34] or "",
                f[35] or "", f[36] or "", f[37] or "", f[38] or "",
            ) if tiene_suplente else (
                f[0], f[16], f[17], f[18], f[19],
                "Sin apoderado suplente", "", "", "", "", "", "", "",
            ))

        # ---------------------------------------------------------------
        # HOJA 4 — Ficha de Salud
        # ---------------------------------------------------------------
        ws4 = wb.create_sheet("Ficha de Salud")
        enc4 = [
            "ID Matrícula", "RUT/IPE Estudiante", "Nombres Estudiante", "Ap. Paterno", "Ap. Materno",
            "Sistema de Salud", "Letra FONASA", "CESFAM", "Centro de Emergencia",
            "Alergias", "Diagnóstico Médico", "Médico Tratante", "Medicamentos",
            "Necesidad Ed. Especial (NEE)", "Tipo NEE",
        ]
        estilizar_hoja(ws4, enc4, COLOR_SALUD)
        for f in filas:
            ws4.append((
                f[0], f[16], f[17], f[18], f[19],
                f[39] or "No informado",
                f[40] or "",
                f[41] or "No informado",
                f[42] or "No informado",
                f[43] or "",
                f[44] or "No",
                f[45] or "No informado",
                f[46] or "",
                f[47] or "No",
                f[48] or "No aplica",
            ))

        # ---------------------------------------------------------------
        # 3. Guardar en buffer de memoria
        # ---------------------------------------------------------------
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        return buffer

    except Exception as e:
        print(f"Error generando Excel: {e}")
        raise HTTPException(status_code=500, detail="Error interno al generar el archivo Excel: " + str(e))
    finally:
        cur.close()
        conn.close()

