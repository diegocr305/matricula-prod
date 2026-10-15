from fastapi import APIRouter, Depends, UploadFile, Form, HTTPException, File
from security import obtener_usuario_actual, verificar_escritura
import roles

# Importamos la capa de servicio
from services import establecimientos_service
from services.establecimientos_service import cargar_capacidades_excel_service, obtener_capacidad_curso
from services.storage_service import validar_tamano_archivo

router = APIRouter(prefix="/establecimientos", tags=["Establecimientos Educacionales"])

@router.get("")
def obtener_establecimientos(usuario_actual: dict = Depends(obtener_usuario_actual)):
    # Delegamos la consulta a la base de datos al servicio
    return establecimientos_service.obtener_establecimientos_db()

@router.post("/cargar-capacidades")
async def cargar_capacidades(
    anio_escolar: int = Form(...),
    archivo: UploadFile = File(...),
    usuario_actual: dict = Depends(verificar_escritura)
):
    """
    Recibe el Excel de Declaración de Cupos (DCV) y lo procesa.
    Restringido exclusivamente a administradores del SLEP.
    """
    if not roles.es_slep(usuario_actual.get("rol")):
        raise HTTPException(
            status_code=403, 
            detail="Acceso restringido: Solo el nivel central (SLEP) puede cargar capacidades de oferta."
        )

    if not archivo.filename.endswith(('.xls', '.xlsx')):
        raise HTTPException(status_code=400, detail="El archivo debe ser un Excel (.xls, .xlsx)")
        
    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo enviado está vacío.")
    
    # Validar tamaño máximo permitido (5 MB)
    validar_tamano_archivo(contenido, archivo.filename)
    await archivo.seek(0)

    return cargar_capacidades_excel_service(archivo, anio_escolar)

@router.get("/capacidad-sala")
async def consultar_capacidad(
    rbd: int, 
    anio_escolar: int, 
    nivel: str, 
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """
    Devuelve la capacidad máxima configurada para un curso específico.
    """
    capacidad = obtener_capacidad_curso(rbd, anio_escolar, nivel.upper().strip())
    return {"capacidad_maxima": capacidad}