# routers/matriculas.py
from fastapi import APIRouter, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from typing import Optional, List
from pydantic import BaseModel
from schemas import MatriculaCreate, MatriculaUpdate, CuestionarioRetiro
from security import obtener_usuario_actual, verificar_escritura
from services import matricula_service
from services.matricula_service import exportar_matriculas_excel_service

router = APIRouter(prefix="/matriculas", tags=["Matrículas"])

class CambioCursoRequest(BaseModel):
    cod_tipo_ensenanza: int
    nuevo_curso: str
    motivo_cambio_curso: Optional[str] = None 

@router.get("")
def obtener_matriculas(establecimiento_id: Optional[int] = None, anio: Optional[str] = None, usuario_actual: dict = Depends(obtener_usuario_actual)):
    rol = usuario_actual.get("rol")
    if rol in ["Colegio", "Visualizador_Colegio"]:
        establecimiento_id = usuario_actual.get("id_establecimiento")

    # anio: None -> último año con datos; "todos" -> histórico completo; "<n>" -> ese año
    return matricula_service.obtener_todas_matriculas_db(establecimiento_id, anio)


@router.get("/anios-disponibles")
def anios_disponibles(establecimiento_id: Optional[int] = None, usuario_actual: dict = Depends(obtener_usuario_actual)):
    rol = usuario_actual.get("rol")
    if rol in ["Colegio", "Visualizador_Colegio"]:
        establecimiento_id = usuario_actual.get("id_establecimiento")

    return matricula_service.obtener_anios_disponibles_db(establecimiento_id)

@router.post("")
def crear_matricula(matricula: MatriculaCreate, usuario_actual: dict = Depends(verificar_escritura)):
    # Inyectamos el ID del usuario directamente en el esquema si no viene (medida de seguridad)
    if not matricula.id_usuario_ejecutor:
        matricula.id_usuario_ejecutor = usuario_actual.get("id_usuario")
    return matricula_service.crear_nueva_matricula_db(matricula)

@router.put("/{id_matricula}")
def actualizar_matricula(id_matricula: int, matricula: MatriculaUpdate, usuario_actual: dict = Depends(verificar_escritura)):
    return matricula_service.actualizar_estado_matricula_db(id_matricula, matricula)

@router.put("/{id_matricula}/cuestionario")
def responder_cuestionario(id_matricula: int, payload: CuestionarioRetiro):
    return matricula_service.guardar_respuesta_cuestionario_db(id_matricula, payload)

@router.put("/{id_matricula}/cuestionario-curso")
def responder_cuestionario_curso(id_matricula: int, payload: CuestionarioRetiro):
    return matricula_service.guardar_respuesta_cuestionario_curso_db(id_matricula, payload)

@router.put("/{id_matricula}/curso")
def cambiar_curso(id_matricula: int, req: CambioCursoRequest, usuario_actual: dict = Depends(verificar_escritura)):
    return matricula_service.registrar_cambio_curso_db(id_matricula, req)

@router.get("/{id_matricula}/certificado")
def descargar_certificado(id_matricula: int, tipo: str = "MATRICULA"):
    pdf_buffer, rut_alumno = matricula_service.generar_pdf_certificado_db(id_matricula, tipo)
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"inline; filename={tipo}_{rut_alumno}.pdf"}
    )

@router.post("/carga-masiva")
async def carga_masiva_sige(archivos: List[UploadFile] = File(...), usuario_actual: dict = Depends(obtener_usuario_actual)):
    # Pasamos el trabajo pesado al servicio enviando el request
    return await matricula_service.procesar_carga_masiva_db(archivos, usuario_actual)

@router.get("/procedencia/{rut_estudiante}")
def obtener_colegio_procedencia(rut_estudiante: str):
    return matricula_service.obtener_colegio_procedencia_db(rut_estudiante)

@router.get("/exportar-excel")
async def exportar_matriculas_excel(
    establecimiento_id: int,
    anio: str = Query(None),
    codigo_plan: str = Query(None)
    # usuario = Depends(obtener_usuario_actual) # Descomentar si requieres token de sesión
):
    """
    Endpoint para descargar el registro general de matrículas en formato .xlsx
    """
    # Delegamos toda la lógica al servicio
    buffer = exportar_matriculas_excel_service(
        id_establecimiento=establecimiento_id,
        anio=anio,
        codigo_plan=codigo_plan
    )
    # Preparamos las cabeceras HTTP para forzar la descarga del archivo en el navegador
    headers = {
        'Content-Disposition': f'attachment; filename="Reporte_Matriculas_Establecimiento_{establecimiento_id}.xlsx"'
    }
    return StreamingResponse(
        buffer, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers=headers
    )