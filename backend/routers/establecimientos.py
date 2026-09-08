# routers/establecimientos.py
from fastapi import APIRouter, Depends, UploadFile, Form, HTTPException, File
from security import obtener_usuario_actual

# Importamos la capa de servicio
from services import establecimientos_service
from services.establecimientos_service import cargar_capacidades_excel_service, obtener_capacidad_curso

router = APIRouter(prefix="/establecimientos", tags=["Establecimientos Educacionales"])

@router.get("")
def obtener_establecimientos(usuario_actual: dict = Depends(obtener_usuario_actual)):
    # Delegamos la consulta a la base de datos al servicio
    return establecimientos_service.obtener_establecimientos_db()
@router.post("/cargar-capacidades")
async def cargar_capacidades(
    anio_escolar: int = Form(...),
    archivo: UploadFile = File(...)
):
    """
    Recibe el Excel de Declaración de Cupos (DCV) y lo procesa.
    """
    if not archivo.filename.endswith(('.xls', '.xlsx')):
        raise HTTPException(status_code=400, detail="El archivo debe ser un Excel (.xls, .xlsx)")
        
    return cargar_capacidades_excel_service(archivo, anio_escolar)

@router.get("/capacidad-sala")
async def consultar_capacidad(rbd: int, anio_escolar: int, nivel: str):
    """
    Devuelve la capacidad máxima configurada para un curso específico.
    """
    capacidad = obtener_capacidad_curso(rbd, anio_escolar, nivel.upper().strip())
    return {"capacidad_maxima": capacidad}