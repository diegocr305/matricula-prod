# services/documento_service.py
import hashlib
from fastapi import HTTPException
from database import get_db_connection

# Importamos los servicios externos necesarios
from services.pdf_service import generar_certificado_pdf
from services.email_service import enviar_certificado_por_correo

def obtener_datos_bd(id_matricula: int):
    """
    Extrae y formatea todos los datos cruzados de la base de datos
    necesarios para rellenar un certificado o documento.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT m.numero_correlativo, m.anio_escolar, m.nivel_ensenanza, m.curso, m.fecha_matricula,
                   e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno, e.sexo,
                   m.estado, m.fecha_retiro, m.motivo_cambio_curso, est.nombre, est.rbd,
                   a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno, e.domicilio,
                   e.fecha_nacimiento, a.telefono, a.correo_electronico
            FROM matricula m 
            INNER JOIN estudiante e ON m.id_estudiante = e.id_estudiante 
            INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            LEFT JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado
            WHERE m.id_matricula = %s
        """, (id_matricula,))
        datos = cur.fetchone()
        
        if not datos: return None
        
        # Procesar datos del apoderado y domicilio
        rut_apod = datos[15] if datos[15] else "Sin registro"
        nom_apod = f"{datos[16] or ''} {datos[17] or ''} {datos[18] or ''}".strip()
        if not nom_apod: nom_apod = "Sin registro"
        
        domicilio = datos[19] if datos[19] else "los registros del establecimiento"

        return {
            "folio": datos[0],
            "anio": datos[1],
            "nivel": datos[2],
            "curso": datos[3],
            "fecha_matricula": datos[4],
            "rut": str(datos[5]).strip(),
            "nombre_completo": f"{datos[6]} {datos[7]} {datos[8]}".strip(),
            "sexo": datos[9],
            "estado": datos[10],
            "fecha_retiro": datos[11],
            "motivo_cambio": datos[12],
            "nombre_colegio": datos[13],
            "rbd_colegio": datos[14],
            "rut_apoderado": rut_apod,
            "nombre_apoderado": nom_apod,
            "domicilio": domicilio,
            "fecha_nacimiento": str(datos[20]) if datos[20] else "No registrada",
            "telefono_apoderado": str(datos[21]) if datos[21] else "Sin registro",
            "correo_apoderado": str(datos[22]) if datos[22] else "Sin registro"
        }
    finally:
        cur.close()
        conn.close()

def emitir_documento_service(id_matricula: int, tipo_documento: str, destinatarios: list, background_tasks = None):
    if not destinatarios:
        raise HTTPException(status_code=400, detail="No se proporcionaron correos de destino.")

    datos_alumno = obtener_datos_bd(id_matricula)
    if not datos_alumno: 
        raise HTTPException(status_code=404, detail="Matrícula no encontrada")

    pdf_buffer, titulo_pdf = generar_certificado_pdf(datos_alumno, tipo_documento)
    pdf_bytes = pdf_buffer.getvalue() if hasattr(pdf_buffer, 'getvalue') else pdf_buffer.read()
    
    if background_tasks:
        background_tasks.add_task(
            enviar_certificado_por_correo,
            destinatarios=destinatarios,
            pdf_buffer=pdf_bytes,
            titulo_pdf=titulo_pdf,
            nombre_completo=datos_alumno['nombre_completo'],
            rut_estudiante=datos_alumno['rut']
        )
        return {"status": "success", "message": f"Documento encolado para envío a {len(destinatarios)} destinatario(s)."}
    else:
        try:
            enviar_certificado_por_correo(
                destinatarios=destinatarios,
                pdf_buffer=pdf_bytes,
                titulo_pdf=titulo_pdf,
                nombre_completo=datos_alumno['nombre_completo'],
                rut_estudiante=datos_alumno['rut']
            )
            return {"status": "success", "message": f"Documento enviado a {len(destinatarios)} destinatario(s)."}
        except Exception as e:
            print(f"Error emitiendo documento: {e}")
            raise HTTPException(status_code=500, detail=str(e))

def verificar_certificado_service(rut: str, codigo: str):
    partes = codigo.strip().upper().split('-')
    if len(partes) != 3 or partes[0] != 'VLP':
        raise HTTPException(status_code=400, detail="Formato de código inválido.")
        
    id_matricula = partes[1]
    hash_ingresado = partes[2]

    datos_alumno = obtener_datos_bd(id_matricula)
    if not datos_alumno: 
        raise HTTPException(status_code=404, detail="El documento no existe en los registros.")

    if datos_alumno['rut'].lower() != rut.strip().lower():
        raise HTTPException(status_code=401, detail="El RUT ingresado no corresponde a este certificado.")

    hash_base = f"{datos_alumno['rut']}-{id_matricula}-SLEP{datos_alumno['anio']}"
    hash_real = hashlib.sha256(hash_base.encode('utf-8')).hexdigest()[:6].upper()
    
    if hash_real != hash_ingresado:
        raise HTTPException(status_code=401, detail="El código de verificación ha sido alterado.")

    pdf_buffer, _ = generar_certificado_pdf(
        datos=datos_alumno, 
        tipo_documento='MATRICULA', 
        codigo_verificacion=codigo
    )

    return pdf_buffer, datos_alumno['rut']

def descargar_comprobante_ingreso_service(rut: str, usuario_actual: dict):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT m.id_matricula 
            FROM matricula m
            INNER JOIN estudiante e ON m.id_estudiante = e.id_estudiante
            WHERE e.run_ipe = %s
            ORDER BY m.id_matricula DESC
            LIMIT 1
        """, (rut,))
        fila = cur.fetchone()
        
        if not fila:
            raise HTTPException(status_code=404, detail="No se encontraron matrículas para este estudiante.")
            
        id_matricula_reciente = fila[0]
    finally:
        cur.close()
        conn.close()

    # Un usuario de colegio solo descarga comprobantes de matrículas de su establecimiento.
    from services.matricula_service import verificar_acceso_matricula_db
    verificar_acceso_matricula_db(id_matricula_reciente, usuario_actual)

    datos_alumno = obtener_datos_bd(id_matricula_reciente)
    if not datos_alumno: 
        raise HTTPException(status_code=404, detail="Error al extraer los datos de la matrícula.")

    datos_alumno['usuario_ejecutor'] = usuario_actual.get('nombre', 'Administrador del Sistema')

    pdf_buffer, _ = generar_certificado_pdf(datos_alumno, 'COMPROBANTE_INGRESO')

    return pdf_buffer, rut