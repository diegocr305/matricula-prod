# routers/documentos.py
import io
from typing import List, Optional
from fastapi import APIRouter, Depends, BackgroundTasks, Query, HTTPException
from pydantic import BaseModel
from fastapi.responses import StreamingResponse, RedirectResponse

from security import obtener_usuario_actual

# Importamos la capa de servicio
from services import documento_service, matricula_service, estudiante_service, storage_service

router = APIRouter(prefix="/documentos", tags=["Emisión de Documentos"])

class EmisionRequest(BaseModel):
    id_matricula: int
    tipo_documento: str
    destinatarios: List[str]

@router.post("/emitir")
def emitir_documento(
    req: EmisionRequest, 
    background_tasks: BackgroundTasks,
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    return documento_service.emitir_documento_service(req.id_matricula, req.tipo_documento, req.destinatarios, background_tasks=background_tasks)

@router.get("/verificar")
def verificar_certificado_publico(rut: str, codigo: str):
    # El servicio valida el hash y nos devuelve el archivo PDF generado en memoria
    pdf_buffer, rut_alumno = documento_service.verificar_certificado_service(rut, codigo)
    
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"inline; filename=Verificado_{rut_alumno}.pdf"}
    )

@router.get("/comprobante/{rut}")
def descargar_comprobante_ingreso(rut: str, usuario_actual: dict = Depends(obtener_usuario_actual)):
    # El servicio encuentra la matrícula, inyecta al usuario y nos devuelve el PDF listo
    pdf_buffer, rut_alumno = documento_service.descargar_comprobante_ingreso_service(rut, usuario_actual)
    
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename=Comprobante_Ingreso_{rut_alumno}.pdf"}
    )

@router.get("/adjunto")
def obtener_documento_adjunto(
    tipo: str = Query(..., description="'resolucion', 'traslado' o 'tutor'"),
    id: str = Query(..., description="id_matricula para resolucion/traslado, o rut del estudiante para tutor"),
    token: Optional[str] = Query(None),
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """
    Obtiene el archivo adjunto (resolución de excedente, certificado de traslado o decreto de tutoría legal).
    - Si el sistema usa S3: Redirige temporalmente a una Presigned URL segura de S3 (HTTP 307).
    - Si el sistema usa Local: Transmite el archivo binario directamente (StreamingResponse).
    """
    if tipo == "resolucion":
        try:
            id_mat = int(id)
        except ValueError:
            raise HTTPException(status_code=400, detail="El ID de matrícula debe ser numérico.")
        clave = matricula_service.obtener_ruta_documento_resolucion_db(id_mat, usuario_actual)
    elif tipo == "traslado":
        try:
            id_mat = int(id)
        except ValueError:
            raise HTTPException(status_code=400, detail="El ID de matrícula debe ser numérico.")
        clave = matricula_service.obtener_ruta_documento_traslado_db(id_mat, usuario_actual)
    elif tipo == "tutor":
        clave = estudiante_service.obtener_ruta_documento_tutor_db(id, usuario_actual)
    else:
        raise HTTPException(status_code=400, detail="Tipo de documento no válido. Use 'resolucion', 'traslado' o 'tutor'.")

    # Si estamos en S3 / Cloudflare R2 / MinIO, redirigir a Presigned URL
    if storage_service.es_almacenamiento_s3():
        url_prefirmada = storage_service.obtener_url_descarga(clave, expiracion_segundos=1800)
        return RedirectResponse(url=url_prefirmada, status_code=307)

    # Si es local, servir los bytes directamente
    contenido, content_type, filename = storage_service.obtener_archivo_bytes(clave)
    return StreamingResponse(
        io.BytesIO(contenido),
        media_type=content_type,
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )
