# routers/estudiantes.py
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import Optional
from pydantic import BaseModel
from security import obtener_usuario_actual, verificar_escritura

from services import estudiante_service
from services.storage_service import validar_tamano_archivo

router = APIRouter(prefix="/estudiante", tags=["Estudiantes"])

class CrearEstudianteRequest(BaseModel):
    # 1. Datos Personales
    run: str
    nombres: str
    apellido_paterno: str
    apellido_materno: str
    fecha_nacimiento: str
    sexo: str
    domicilio: str
    latitud: Optional[str] = ""
    longitud: Optional[str] = ""
    pais_origen_estudiante: Optional[str] = "Chile"
    doc_extranjero_estudiante: Optional[str] = None
    
    # 2. Apoderado Titular
    run_apoderado: str
    nombres_apoderado: str
    apellido_paterno_apoderado: str
    apellido_materno_apoderado: str
    domicilio_apoderado: str
    telefono_apoderado: str
    correo_apoderado: str
    relacion_estudiante: str
    ruta_documento_tutor: Optional[str] = None
    pais_origen_apoderado: Optional[str] = "Chile"
    doc_extranjero_apoderado: Optional[str] = None

    # 3. Apoderado Suplente (Opcional)
    tiene_suplente: Optional[bool] = False
    run_suplente: Optional[str] = None
    nombres_suplente: Optional[str] = None
    apellido_paterno_suplente: Optional[str] = None
    apellido_materno_suplente: Optional[str] = None
    domicilio_suplente: Optional[str] = None
    telefono_suplente: Optional[str] = None
    correo_suplente: Optional[str] = None
    relacion_suplente: Optional[str] = None

    # 4. Ficha Médica y Salud
    sistema_salud: Optional[str] = "FONASA"
    letra_fonasa: Optional[str] = "A"
    cesfam: Optional[str] = "No informado"
    centro_emergencia: Optional[str] = "No informado"
    alergias: Optional[str] = ""
    diagnostico_medico: Optional[str] = "No"
    medico_tratante: Optional[str] = "No informado"
    medicamento: Optional[str] = ""
    nee: Optional[str] = "No"
    nee_tipo: Optional[str] = "No aplica"


class ActualizarEstudianteRequest(BaseModel):
    # 1. Domicilio Estudiante
    calle: Optional[str] = None
    numero: Optional[str] = None
    sector: Optional[str] = None
    comuna: Optional[str] = None
    domicilio_estudiante: Optional[str] = None
    
    # 2. Apoderado Titular
    rut_apoderado: Optional[str] = None
    nombres_apoderado: Optional[str] = None
    apellido_paterno_apoderado: Optional[str] = None
    apellido_materno_apoderado: Optional[str] = None
    domicilio_apoderado: Optional[str] = None
    # Domicilio del apoderado desglosado (georreferenciable). Si vienen, se
    # componen a 'domicilio_apoderado'. Retrocompatible: si no vienen, se usa
    # domicilio_apoderado tal cual.
    calle_apoderado: Optional[str] = None
    numero_apoderado: Optional[str] = None
    sector_apoderado: Optional[str] = None
    comuna_apoderado: Optional[str] = None
    telefono_apoderado: Optional[str] = None
    correo_apoderado: Optional[str] = None
    relacion_apoderado: Optional[str] = None

    # 3. Apoderado Suplente
    modificar_suplente: Optional[bool] = False
    tiene_suplente: Optional[bool] = None
    rut_suplente: Optional[str] = None
    nombres_suplente: Optional[str] = None
    apellido_paterno_suplente: Optional[str] = None
    apellido_materno_suplente: Optional[str] = None
    domicilio_suplente: Optional[str] = None
    calle_suplente: Optional[str] = None
    numero_suplente: Optional[str] = None
    sector_suplente: Optional[str] = None
    comuna_suplente: Optional[str] = None
    telefono_suplente: Optional[str] = None
    correo_suplente: Optional[str] = None
    relacion_suplente: Optional[str] = None

    # 4. Ficha Médica
    actualizar_salud: Optional[bool] = False
    sistema_salud: Optional[str] = None
    letra_fonasa: Optional[str] = None
    cesfam: Optional[str] = None
    centro_emergencia: Optional[str] = None
    alergias: Optional[str] = None
    diagnostico_medico: Optional[str] = None
    medico_tratante: Optional[str] = None
    medicamento: Optional[str] = None
    nee: Optional[str] = None
    nee_tipo: Optional[str] = None

@router.get("/buscar")
def buscar_estudiantes(
    q: str, 
    establecimiento_id: Optional[int] = None, 
    buscar_global: Optional[bool] = False,
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    rol = usuario_actual.get("rol")
    if rol in ["Colegio", "Visualizador_Colegio"] and not buscar_global:
        establecimiento_id = usuario_actual.get("id_establecimiento")
    elif buscar_global:
        establecimiento_id = None
        
    return estudiante_service.buscar_estudiantes_db(q, establecimiento_id)

@router.get("")
def obtener_estudiantes(
    q: Optional[str] = None, 
    establecimiento_id: Optional[int] = None, 
    buscar_global: Optional[bool] = False,
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    rol = usuario_actual.get("rol")
    if rol in ["Colegio", "Visualizador_Colegio"] and not buscar_global:
        establecimiento_id = usuario_actual.get("id_establecimiento")
    elif buscar_global:
        establecimiento_id = None
        
    if q:
        return estudiante_service.buscar_estudiantes_db(q, establecimiento_id)
    return estudiante_service.obtener_estudiantes_db(establecimiento_id, rol)

@router.get("/apoderado/buscar/{rut_apoderado}")
def buscar_apoderado(rut_apoderado: str, usuario_actual: dict = Depends(obtener_usuario_actual)):
    return estudiante_service.buscar_apoderado_por_rut_db(rut_apoderado)

@router.get("/{rut}")
def obtener_ficha_estudiante(rut: str, usuario_actual: dict = Depends(obtener_usuario_actual)):
    return estudiante_service.obtener_ficha_estudiante_db(rut)

@router.post("")
def crear_estudiante(payload: CrearEstudianteRequest, usuario_actual: dict = Depends(verificar_escritura)):
    return estudiante_service.crear_estudiante_db(payload.model_dump())

@router.put("/{rut}")
def actualizar_datos_estudiante(rut: str, req: ActualizarEstudianteRequest, usuario_actual: dict = Depends(verificar_escritura)):
    id_usuario = usuario_actual.get("id_usuario")
    return estudiante_service.actualizar_datos_estudiante_db(rut, req, id_usuario)

@router.post("/{rut}/documento-tutor")
async def subir_documento_tutor(
    rut: str,
    archivo: UploadFile = File(...),
    usuario_actual: dict = Depends(verificar_escritura)
):
    """
    Sube el archivo PDF de la resolución/acreditación de tutor legal al almacenamiento de objetos o local.
    """
    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo enviado está vacío.")
    
    # Validar tamaño máximo permitido (5 MB)
    validar_tamano_archivo(contenido, archivo.filename)

    return estudiante_service.guardar_documento_tutor_db(
        rut, contenido, archivo.filename, usuario_actual
    )
