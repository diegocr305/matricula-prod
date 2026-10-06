# routers/matriculas.py
from fastapi import APIRouter, Depends, UploadFile, File, Query, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from typing import Optional, List
from pydantic import BaseModel
from schemas import MatriculaCreate, MatriculaUpdate, CuestionarioRetiro
from security import obtener_usuario_actual, verificar_escritura, validar_acceso_colegio
from services import matricula_service
from services.matricula_service import exportar_matriculas_excel_service
from services.storage_service import validar_tamano_archivo

router = APIRouter(prefix="/matriculas", tags=["Matrículas"])

class CambioCursoRequest(BaseModel):
    cod_tipo_ensenanza: int
    nuevo_curso: str
    motivo_cambio_curso: Optional[str] = None 
    correo_destino: Optional[str] = None

@router.get("")
def obtener_matriculas(
    establecimiento_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=5000),
    anio: Optional[int] = Query(None),
    busqueda: Optional[str] = Query(None),
    curso: Optional[str] = Query(None),
    codigo: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    establecimiento_id = validar_acceso_colegio(establecimiento_id, usuario_actual)
        
    return matricula_service.obtener_todas_matriculas_db(
        establecimiento_id=establecimiento_id,
        page=page,
        page_size=page_size,
        anio=anio,
        busqueda=busqueda,
        curso=curso,
        codigo=codigo,
        estado=estado,
    )

@router.get("/anios-disponibles")
def anios_disponibles(establecimiento_id: Optional[int] = None, usuario_actual: dict = Depends(obtener_usuario_actual)):
    rol = usuario_actual.get("rol")
    if rol in ["Colegio", "Visualizador_Colegio"]:
        establecimiento_id = usuario_actual.get("id_establecimiento")
    return matricula_service.obtener_anios_disponibles_db(establecimiento_id)

@router.post("")
def crear_matricula(matricula: MatriculaCreate, usuario_actual: dict = Depends(verificar_escritura)):
    rol = usuario_actual.get("rol")
    id_est_usuario = usuario_actual.get("id_establecimiento")
    if rol in ["Colegio", "Visualizador_Colegio"]:
        if id_est_usuario and matricula.id_establecimiento != id_est_usuario:
            raise HTTPException(
                status_code=403, 
                detail="No tiene permisos para crear matrículas en otro establecimiento."
            )
        matricula.id_establecimiento = id_est_usuario

    # Inyectamos el ID del usuario directamente en el esquema si no viene (medida de seguridad)
    if not matricula.id_usuario_ejecutor:
        matricula.id_usuario_ejecutor = usuario_actual.get("id_usuario")
    return matricula_service.crear_nueva_matricula_db(matricula)

@router.put("/{id_matricula}")
def actualizar_matricula(
    id_matricula: int, 
    matricula: MatriculaUpdate, 
    background_tasks: BackgroundTasks,
    usuario_actual: dict = Depends(verificar_escritura)
):
    return matricula_service.actualizar_estado_matricula_db(id_matricula, matricula, usuario_actual, background_tasks=background_tasks)

@router.put("/{id_matricula}/confirmar-renovacion")
def confirmar_renovacion(id_matricula: int, usuario_actual: dict = Depends(verificar_escritura)):
    """Confirma la renovación de una matrícula pre-creada (estado_renovacion
    'Por renovar' -> 'Pendiente firma'). Los datos de estudiante/apoderado/ficha
    deben guardarse antes con PUT /estudiante/{rut}. No crea matrícula nueva."""
    return matricula_service.confirmar_renovacion_db(id_matricula, usuario_actual)

@router.put("/{id_matricula}/cuestionario")
def responder_cuestionario(id_matricula: int, payload: CuestionarioRetiro):
    return matricula_service.guardar_respuesta_cuestionario_db(id_matricula, payload)

@router.put("/{id_matricula}/cuestionario-curso")
def responder_cuestionario_curso(id_matricula: int, payload: CuestionarioRetiro):
    return matricula_service.guardar_respuesta_cuestionario_curso_db(id_matricula, payload)

@router.put("/{id_matricula}/curso")
def cambiar_curso(
    id_matricula: int, 
    req: CambioCursoRequest, 
    background_tasks: BackgroundTasks,
    usuario_actual: dict = Depends(verificar_escritura)
):
    return matricula_service.registrar_cambio_curso_db(id_matricula, req, usuario_actual, background_tasks=background_tasks)

@router.get("/{id_matricula}/certificado")
def descargar_certificado(id_matricula: int, tipo: str = "MATRICULA", usuario_actual: dict = Depends(obtener_usuario_actual)):
    pdf_buffer, rut_alumno = matricula_service.generar_pdf_certificado_db(id_matricula, tipo, usuario_actual)
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"inline; filename={tipo}_{rut_alumno}.pdf"}
    )

@router.get("/{id_matricula}/detalle-motivo")
def obtener_detalle_motivo(id_matricula: int, usuario_actual: dict = Depends(obtener_usuario_actual)):
    """
    Retorna el desglose de los motivos de retiro y/o cambio de curso de una matrícula,
    incluyendo respuestas de encuestas confidenciales y observaciones de trazabilidad.
    """
    return matricula_service.obtener_detalle_motivo_matricula_db(id_matricula, usuario_actual)

@router.post("/carga-masiva")
async def carga_masiva_sige(
    archivos: List[UploadFile] = File(...), 
    usuario_actual: dict = Depends(verificar_escritura)
):
    rol = str(usuario_actual.get("rol", "")).lower()
    if rol not in ["admin_slep", "slep", "admin"]:
        raise HTTPException(
            status_code=403, 
            detail="Acceso restringido: La carga masiva de SIGE está reservada exclusivamente para administradores o nivel central SLEP."
        )
    
    # Validar que ningún archivo supere el tamaño máximo permitido (5 MB)
    for arch in archivos:
        contenido = await arch.read()
        validar_tamano_archivo(contenido, arch.filename)
        await arch.seek(0)

    # Pasamos el trabajo pesado al servicio enviando el request
    return await matricula_service.procesar_carga_masiva_db(archivos, usuario_actual)

@router.get("/procedencia/{rut_estudiante}")
def obtener_colegio_procedencia(rut_estudiante: str, usuario_actual: dict = Depends(obtener_usuario_actual)):
    return matricula_service.obtener_colegio_procedencia_db(rut_estudiante)

@router.get("/opciones-filtro")
def obtener_opciones_filtro(
    establecimiento_id: Optional[int] = None,
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """
    Devuelve los años, cursos y planes de estudio disponibles en la BD
    para poblar los selects del modal de descarga Excel.
    """
    establecimiento_id = validar_acceso_colegio(establecimiento_id, usuario_actual)
    return matricula_service.obtener_opciones_filtro_excel(establecimiento_id)

@router.get("/conteo-cursos")
def obtener_conteo_cursos(
    establecimiento_id: int = Query(...),
    anio: Optional[int] = Query(None),
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """
    Devuelve la cantidad de estudiantes activos por curso en un establecimiento y año escolar,
    junto con el RBD institucional.
    """
    establecimiento_id = validar_acceso_colegio(establecimiento_id, usuario_actual)
    return matricula_service.obtener_conteo_alumnos_por_curso_db(establecimiento_id, anio)

@router.get("/estudiantes-curso")
def obtener_estudiantes_curso(
    establecimiento_id: int = Query(...),
    anio: int = Query(...),
    curso: str = Query(...),
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """
    Devuelve la nómina de estudiantes activos inscritos en un curso específico.
    """
    establecimiento_id = validar_acceso_colegio(establecimiento_id, usuario_actual)
    return matricula_service.obtener_estudiantes_curso_db(establecimiento_id, anio, curso)

@router.get("/exportar-excel")
async def exportar_matriculas_excel(
    establecimiento_id: Optional[int] = None,
    anio: str = Query(None),
    codigo_plan: str = Query(None),
    curso: str = Query(None),
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """
    Endpoint para descargar el registro general de matrículas en formato .xlsx.
    Los administradores SLEP pueden descargar sin filtrar por colegio.
    """
    establecimiento_id = validar_acceso_colegio(establecimiento_id, usuario_actual)

    # Delegamos toda la lógica al servicio
    buffer = exportar_matriculas_excel_service(
        id_establecimiento=establecimiento_id,
        anio=anio,
        codigo_plan=codigo_plan,
        curso=curso
    )

    # Nombre dinámico del archivo según alcance
    if establecimiento_id:
        nombre_archivo = f"Reporte_Matriculas_Establecimiento_{establecimiento_id}.xlsx"
    elif anio:
        nombre_archivo = f"Reporte_Matriculas_SLEP_{anio}.xlsx"
    else:
        nombre_archivo = "Reporte_Matriculas_SLEP_Global.xlsx"

    headers = {
        'Content-Disposition': f'attachment; filename="{nombre_archivo}"'
    }
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers
    )

@router.post("/{id_matricula}/documento-resolucion")
async def subir_documento_resolucion(
    id_matricula: int,
    archivo: UploadFile = File(...),
    usuario_actual: dict = Depends(verificar_escritura)
):
    """
    Sube el archivo PDF de la resolución de sobrecupo (excedente) al almacenamiento de objetos o local.
    """
    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo enviado está vacío.")
    
    # Validar tamaño máximo permitido (5 MB)
    validar_tamano_archivo(contenido, archivo.filename)

    return matricula_service.guardar_documento_resolucion_db(
        id_matricula, contenido, archivo.filename, usuario_actual
    )

@router.post("/{id_matricula}/documento-traslado")
async def subir_documento_traslado(
    id_matricula: int,
    archivo: UploadFile = File(...),
    usuario_actual: dict = Depends(verificar_escritura)
):
    """
    Sube el archivo PDF o imagen del certificado de retiro/traslado al almacenamiento.
    """
    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo enviado está vacío.")
    
    # Validar tamaño máximo permitido (5 MB)
    validar_tamano_archivo(contenido, archivo.filename)

    return matricula_service.guardar_documento_traslado_db(
        id_matricula, contenido, archivo.filename, usuario_actual
    )
