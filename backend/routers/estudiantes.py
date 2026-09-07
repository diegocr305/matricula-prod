# routers/estudiantes.py
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from pydantic import BaseModel
from security import obtener_usuario_actual, verificar_escritura

# Importamos la capa de servicio
from services import estudiante_service

router = APIRouter(prefix="/estudiante", tags=["Estudiantes"])

# 🌟 NUEVA CLASE ESTRICTA: El "guardia de seguridad" para registrar un nuevo alumno
class CrearEstudianteRequest(BaseModel):
    run: str
    nombres: str
    apellido_paterno: str
    apellido_materno: str
    fecha_nacimiento: str
    sexo: str
    domicilio: str
    latitud: str
    longitud: str
    run_apoderado: str
    nombres_apoderado: str
    apellido_paterno_apoderado: str
    apellido_materno_apoderado: str
    domicilio_apoderado: str
    telefono_apoderado: str
    correo_apoderado: str
    # Opcionales (Solo llegarán llenos si React detectó un IPE/IPA)
    pais_origen_estudiante: Optional[str] = "Chile"
    doc_extranjero_estudiante: Optional[str] = None
    pais_origen_apoderado: Optional[str] = "Chile"
    doc_extranjero_apoderado: Optional[str] = None

class ActualizarEstudianteRequest(BaseModel):
    domicilio_estudiante: Optional[str] = ""
    rut_apoderado: Optional[str] = ""
    nombres_apoderado: Optional[str] = ""
    apellido_paterno_apoderado: Optional[str] = ""
    apellido_materno_apoderado: Optional[str] = ""
    domicilio_apoderado: Optional[str] = ""
    telefono_apoderado: Optional[str] = ""
    correo_apoderado: Optional[str] = ""

@router.get("")
def obtener_estudiantes(establecimiento_id: Optional[int] = None, usuario_actual: dict = Depends(obtener_usuario_actual)):
    rol = usuario_actual.get("rol")
    if rol in ["Colegio", "Visualizador_Colegio"]:
        establecimiento_id = usuario_actual.get("id_establecimiento")       
        
    return estudiante_service.obtener_estudiantes_db(establecimiento_id, rol)

@router.get("/{rut}")
def obtener_ficha_estudiante(rut: str, usuario_actual: dict = Depends(obtener_usuario_actual)):
    return estudiante_service.obtener_ficha_estudiante_db(rut)

@router.post("")
def crear_estudiante(payload: CrearEstudianteRequest, usuario_actual: dict = Depends(verificar_escritura)):
    # .model_dump() convierte la clase segura nuevamente en diccionario para el servicio
    return estudiante_service.crear_estudiante_db(payload.model_dump())

@router.get("/apoderado/buscar/{rut_apoderado}")
def buscar_apoderado(rut_apoderado: str, usuario_actual: dict = Depends(obtener_usuario_actual)):
    return estudiante_service.buscar_apoderado_por_rut_db(rut_apoderado)

@router.put("/{rut}")
def actualizar_datos_estudiante(rut: str, req: ActualizarEstudianteRequest, usuario_actual: dict = Depends(verificar_escritura)):
    return estudiante_service.actualizar_datos_estudiante_db(rut, req)