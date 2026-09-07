# services/matricula_service.py
import io
import pandas as pd
import hashlib
from datetime import datetime
from fastapi import HTTPException
from database import get_db_connection

# Importamos las herramientas desacopladas
from services.pdf_service import generar_certificado_pdf
from services.email_service import enviar_correo_retiro, enviar_correo_cambio_curso
from services.utils import determinar_nivel_backend

def obtener_anio_por_defecto_db(establecimiento_id: int = None):
    """Devuelve el mayor anio_escolar con datos (del establecimiento si se indica, o global)."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if establecimiento_id is not None:
            cur.execute("SELECT MAX(anio_escolar) FROM matricula WHERE id_establecimiento = %s", (establecimiento_id,))
        else:
            cur.execute("SELECT MAX(anio_escolar) FROM matricula")
        fila = cur.fetchone()
        return fila[0] if fila and fila[0] is not None else None
    finally:
        cur.close()
        conn.close()


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


def obtener_todas_matriculas_db(establecimiento_id: int = None, anio=None):
    """
    Devuelve matrículas filtradas por año.
    - anio None            -> usa el último año con datos (por defecto).
    - anio 'todos'         -> sin filtro de año (histórico completo).
    - anio <número/str num> -> ese año específico.
    """
    # Resolver el año a usar
    anio_filtro = None  # None = sin filtro (caso 'todos')
    if anio is None:
        anio_filtro = obtener_anio_por_defecto_db(establecimiento_id)
    elif str(anio).lower() == "todos":
        anio_filtro = None
    else:
        try:
            anio_filtro = int(anio)
        except (ValueError, TypeError):
            anio_filtro = obtener_anio_por_defecto_db(establecimiento_id)

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        query = """
            SELECT m.id_matricula, m.numero_correlativo, m.nivel_ensenanza, m.curso, m.fecha_matricula, m.estado,
                   e.run_ipe, e.nombres, e.apellido_paterno, a.rut_pasaporte, a.nombres, a.apellido_paterno,
                   m.anio_escolar, cte.descripcion, est.rbd, m.cod_tipo_ensenanza, m.id_establecimiento
            FROM matricula m
            INNER JOIN estudiante e ON m.id_estudiante = e.id_estudiante
            LEFT JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado
            LEFT JOIN catalogo_tipo_ensenanza cte ON m.cod_tipo_ensenanza = cte.codigo
            INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            WHERE 1=1
        """
        parametros = []
        if establecimiento_id is not None:
            query += " AND m.id_establecimiento = %s"
            parametros.append(establecimiento_id)

        if anio_filtro is not None:
            query += " AND m.anio_escolar = %s"
            parametros.append(anio_filtro)

        query += " ORDER BY m.id_matricula DESC"
        cur.execute(query, tuple(parametros))
        
        matriculas = [{
            "id_matricula": f[0], "numero_correlativo": f[1], "nivel_ensenanza": f[2], "curso": f[3],
            "fecha_matricula": str(f[4]), "estado": f[5], "estudiante_rut": f[6], "estudiante_nombre": f"{f[7]} {f[8]}".strip(),
            "apoderado_rut": f[9] or "Sin registro", "apoderado_nombre": f"{f[10]} {f[11]}".strip() if f[10] else "Pendiente",
            "anio_escolar": f[12], "tipo_ensenanza": f[13] or "Plan General", "rbd": f[14] or "Sin RBD",
            "cod_tipo_ensenanza": f[15], "id_establecimiento": f[16]
        } for f in cur.fetchall()]
        return matriculas
    finally:
        cur.close()
        conn.close()

def crear_nueva_matricula_db(matricula):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
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
                es_alumno_practica
            ) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_matricula;
        """
        valores = (
            nuevo_correlativo, matricula.anio_escolar, matricula.id_estudiante, 
            matricula.id_establecimiento, matricula.fecha_matricula, matricula.nivel_ensenanza, 
            matricula.curso, getattr(matricula, 'estado', 'Activa'), 
            getattr(matricula, 'cod_tipo_ensenanza', None), getattr(matricula, 'cod_grado', None), 
            getattr(matricula, 'letra_curso', None), matricula.id_usuario_ejecutor,
            es_excedente, num_resolucion, fecha_res,es_practica        
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

def actualizar_estado_matricula_db(id_matricula: int, matricula):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        mensaje_alerta = ""
        if matricula.estado == "Retirado":
            matricula.observaciones = "Pendiente de respuesta mediante cuestionario autoaplicado."
            matricula.motivo_retiro = "Pendiente"

        cursor.execute("""
            UPDATE matricula SET estado = %s, fecha_retiro = %s, motivo_retiro = %s, observaciones = %s, id_usuario_ejecutor = %s WHERE id_matricula = %s RETURNING id_matricula;
        """, (matricula.estado, matricula.fecha_retiro, matricula.motivo_retiro, matricula.observaciones, matricula.id_usuario_ejecutor, id_matricula))
        
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
            correo_apoderado = datos[20] if datos else None
            
            if datos and correo_apoderado:
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
                
                pdf_buffer, _ = generar_certificado_pdf(datos_alumno, "RETIRO", codigo_verificacion)
                exito, msg_error = enviar_correo_retiro(correo_apoderado, id_matricula, datos[6], pdf_buffer)
                
                if not exito: mensaje_alerta = f"⚠️ Retiro guardado, pero falló el envío de Gmail: {msg_error}"
            else:
                mensaje_alerta = "⚠️ Retiro guardado, pero el estudiante NO TIENE apoderado con correo electrónico registrado."

        conn.commit()
        return {"mensaje": mensaje_alerta if mensaje_alerta else "Matrícula actualizada y correo enviado exitosamente."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

def guardar_respuesta_cuestionario_db(id_matricula: int, payload):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT e.run_ipe FROM matricula m INNER JOIN estudiante e ON m.id_estudiante = e.id_estudiante WHERE m.id_matricula = %s", (id_matricula,))
        resultado = cur.fetchone()
        if not resultado or resultado[0] != payload.rut_estudiante:
            raise HTTPException(status_code=401, detail="El RUT ingresado no coincide.")
            
        cur.execute("UPDATE matricula SET observaciones = %s, motivo_retiro = 'Respuesta Apoderado (Confidencial)' WHERE id_matricula = %s", (payload.motivo_real, id_matricula))
        conn.commit()
        return {"mensaje": "Cuestionario guardado con éxito."}
    finally:
        cur.close()
        conn.close()

def guardar_respuesta_cuestionario_curso_db(id_matricula: int, payload):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT e.run_ipe FROM matricula m INNER JOIN estudiante e ON m.id_estudiante = e.id_estudiante WHERE m.id_matricula = %s", (id_matricula,))
        resultado = cur.fetchone()
        if not resultado or resultado[0] != payload.rut_estudiante:
            raise HTTPException(status_code=401, detail="El RUT ingresado no coincide.")
            
        cur.execute("UPDATE matricula SET motivo_cambio_curso = %s WHERE id_matricula = %s", (payload.motivo_real, id_matricula))
        conn.commit()
        return {"mensaje": "Motivo de traslado guardado con éxito."}
    finally:
        cur.close()
        conn.close()

def registrar_cambio_curso_db(id_matricula: int, req):
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
            
        anio_escolar = datos[0]
        id_establecimiento = datos[21]
        folio_antiguo = datos[6]

        cur.execute("""
            SELECT COALESCE(MAX(numero_correlativo), 0) 
            FROM matricula 
            WHERE id_establecimiento = %s AND anio_escolar = %s AND curso = %s
        """, (id_establecimiento, anio_escolar, req.nuevo_curso))
        nuevo_correlativo = cur.fetchone()[0] + 1

        nueva_observacion = f"{datos[3] or ''}\n[{datetime.now().strftime('%Y-%m-%d')}] Trasladado de '{datos[2]}' a '{req.nuevo_curso}'. Folio anterior: {folio_antiguo}. Motivo pendiente."
        motivo_provisional = "Pendiente de respuesta mediante cuestionario autoaplicado."

        cur.execute("""
            UPDATE matricula 
            SET cod_tipo_ensenanza = %s, curso = %s, observaciones = %s, motivo_cambio_curso = %s, numero_correlativo = %s 
            WHERE id_matricula = %s
        """, (req.cod_tipo_ensenanza, req.nuevo_curso, nueva_observacion.strip(), motivo_provisional, nuevo_correlativo, id_matricula))
        
        mensaje_alerta = ""
        correo_apoderado = datos[5]
        nombre_alumno = datos[4]
        
        if correo_apoderado:
            rut_apod = datos[16] if datos[16] else "Sin registro"
            nom_apod = f"{datos[17] or ''} {datos[18] or ''} {datos[19] or ''}".strip()
            if not nom_apod: nom_apod = "Sin registro"
            domicilio = datos[20] if datos[20] else "los registros del establecimiento"

            datos_alumno = {
                "folio": nuevo_correlativo, "anio": datos[0], "nivel": datos[7], "curso": req.nuevo_curso,
                "fecha_matricula": datos[8], "rut": str(datos[9]).strip(),
                "nombre_completo": f"{datos[4]} {datos[10]} {datos[11]}".strip(),
                "sexo": datos[12], "estado": datos[1], "fecha_retiro": datos[13],
                "motivo_cambio": motivo_provisional, "nombre_colegio": datos[14], "rbd_colegio": datos[15],
                "rut_apoderado": rut_apod, "nombre_apoderado": nom_apod, "domicilio": domicilio
            }
            
            hash_base = f"{datos_alumno['rut']}-{id_matricula}-SLEP{datos_alumno['anio']}"
            hash_corto = hashlib.sha256(hash_base.encode('utf-8')).hexdigest()[:6].upper()
            codigo_verificacion = f"VLP-{id_matricula}-{hash_corto}"
            
            pdf_buffer, _ = generar_certificado_pdf(datos_alumno, "CAMBIO_CURSO", codigo_verificacion)
            
            exito, msg_error = enviar_correo_cambio_curso(correo_apoderado, id_matricula, nombre_alumno, req.nuevo_curso, pdf_buffer)
            if not exito: mensaje_alerta = f"⚠️ Traslado guardado, pero falló el envío a Gmail: {msg_error}"
        else:
            mensaje_alerta = "⚠️ Traslado guardado, pero el estudiante NO TIENE apoderado con correo registrado."

        conn.commit()
        return {"status": "success", "mensaje": mensaje_alerta if mensaje_alerta else "Traslado registrado y correo enviado al apoderado."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

def generar_pdf_certificado_db(id_matricula: int, tipo: str):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT m.numero_correlativo, m.anio_escolar, m.nivel_ensenanza, m.curso, m.fecha_matricula,
                   e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno, e.sexo,
                   m.estado, m.fecha_retiro, m.motivo_cambio_curso, est.nombre, est.rbd,
                   a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno, e.domicilio
            FROM matricula m 
            INNER JOIN estudiante e ON m.id_estudiante = e.id_estudiante 
            INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            LEFT JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado
            WHERE m.id_matricula = %s
        """, (id_matricula,))
        datos = cur.fetchone()
        
        if not datos: raise HTTPException(status_code=404, detail="Matrícula no encontrada")
        
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
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        total_alumnos_nuevos = 0
        total_alumnos_actualizados = 0
        id_ejecutor = usuario_actual.get('id_usuario', 1)
        correlativos_actuales = {}

        for archivo in archivos:
            contenido = await archivo.read()
            try:
                tablas = pd.read_html(io.BytesIO(contenido), encoding='latin1')
            except Exception:
                try:
                    tablas = pd.read_html(io.BytesIO(contenido), encoding='utf-8')
                except Exception:
                    continue
            
            if not tablas: continue
            df = tablas[0].where(pd.notnull(tablas[0]), None)
            
            for index, row in df.iterrows():
                rbd_excel = str(row.get('RBD', '')).strip()
                id_colegio = usuario_actual.get('id_establecimiento', 1)
                
                if rbd_excel and rbd_excel != 'None':
                    cur.execute("SELECT id_establecimiento FROM establecimiento WHERE rbd = %s", (rbd_excel,))
                    resultado_colegio = cur.fetchone()
                    if resultado_colegio:
                        id_colegio = resultado_colegio[0]
                    else:
                        cur.execute("INSERT INTO establecimiento (rbd, nombre, tipo_local) VALUES (%s, %s, 'Generado por SIGE') RETURNING id_establecimiento;", (rbd_excel, f"Colegio RBD {rbd_excel}"))
                        id_colegio = cur.fetchone()[0]

                rut_alumno = str(row.get('Run', '')).strip()
                dv_alumno = str(row.get('Dígito Ver.', '')).strip()
                if rut_alumno == 'None' or not rut_alumno: continue
                run_completo = f"{rut_alumno}-{dv_alumno}"
                
                nombres = str(row.get('Nombres', '')).strip()
                if not nombres or nombres == 'None': nombres = "Sin Nombre"
                ap_paterno = str(row.get('Apellido Paterno', '')).strip()
                if not ap_paterno or ap_paterno == 'None': ap_paterno = "Sin Apellido"
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
                domicilio_final = f"{dir_limpia} {comuna_limpia}".strip()
                if not domicilio_final: domicilio_final = "Sin registro"

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

                cur.execute("""
                    INSERT INTO estudiante (run_ipe, nombres, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, domicilio)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (run_ipe) 
                    DO UPDATE SET nombres = EXCLUDED.nombres, apellido_paterno = EXCLUDED.apellido_paterno, apellido_materno = EXCLUDED.apellido_materno, sexo = EXCLUDED.sexo, fecha_nacimiento = COALESCE(EXCLUDED.fecha_nacimiento, estudiante.fecha_nacimiento), domicilio = COALESCE(EXCLUDED.domicilio, estudiante.domicilio)
                    RETURNING id_estudiante;
                """, (run_completo, nombres, ap_paterno, ap_materno, sexo_db, fecha_nac_str, domicilio_final))
                
                resultado_estudiante = cur.fetchone()
                if resultado_estudiante: id_estudiante = resultado_estudiante[0]
                else:
                    cur.execute("SELECT id_estudiante FROM estudiante WHERE run_ipe = %s", (run_completo,))
                    id_estudiante = cur.fetchone()[0]

                curso_texto = f"{desc_grado} {letra_curso}".strip() if desc_grado else "Sin Asignar"
                nivel_calculado = determinar_nivel_backend(curso_texto, cod_ensenanza)
                
                cur.execute("SELECT id_matricula FROM matricula WHERE id_estudiante = %s AND id_establecimiento = %s AND anio_escolar = %s", (id_estudiante, id_colegio, anio_escolar))
                matricula_existente = cur.fetchone()
                
                if matricula_existente:
                    cur.execute("""
                        UPDATE matricula SET cod_tipo_ensenanza = %s, cod_grado = %s, letra_curso = %s, curso = %s, fecha_retiro = %s, estado = %s WHERE id_matricula = %s
                    """, (cod_ensenanza, cod_grado, letra_curso, curso_texto, fecha_retiro_db, estado_matricula, matricula_existente[0]))
                    total_alumnos_actualizados += 1
                else:
                    llave_correlativo = (id_colegio, anio_escolar, cod_ensenanza, curso_texto)
                    if llave_correlativo not in correlativos_actuales:
                        cur.execute("""
                            SELECT COALESCE(MAX(numero_correlativo), 0) FROM matricula 
                            WHERE id_establecimiento = %s AND anio_escolar = %s AND cod_tipo_ensenanza IS NOT DISTINCT FROM %s AND curso IS NOT DISTINCT FROM %s
                        """, (id_colegio, anio_escolar, cod_ensenanza, curso_texto))
                        correlativos_actuales[llave_correlativo] = cur.fetchone()[0]

                    correlativos_actuales[llave_correlativo] += 1
                    nuevo_correlativo = correlativos_actuales[llave_correlativo]
                    
                    cur.execute("""
                        INSERT INTO matricula (
                            id_estudiante, id_establecimiento, numero_correlativo, estado, cod_tipo_ensenanza, cod_grado, letra_curso, curso, nivel_ensenanza, anio_escolar, fecha_matricula, id_usuario_ejecutor, fecha_retiro
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (id_estudiante, id_colegio, nuevo_correlativo, estado_matricula, cod_ensenanza, cod_grado, letra_curso, curso_texto,nivel_calculado, anio_escolar, fecha_matricula_str, id_ejecutor, fecha_retiro_db))
                    total_alumnos_nuevos += 1
            
        conn.commit()
        return {"mensaje": f"✅ Éxito: {len(archivos)} archivo(s) procesado(s). {total_alumnos_nuevos} alumnos nuevos matriculados y {total_alumnos_actualizados} actualizados."}
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
            WHERE e.run_ipe = %s
            ORDER BY m.anio_escolar DESC, m.fecha_matricula DESC, m.id_matricula DESC
            LIMIT 1
        """, (rut_estudiante.strip(),))
        
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