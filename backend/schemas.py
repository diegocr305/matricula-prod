from pydantic import BaseModel
from typing import Optional
from datetime import date

class MatriculaCreate(BaseModel):
    numero_correlativo: int
    anio_escolar: int
    id_estudiante: int
    id_establecimiento: int
    fecha_matricula: date
    nivel_ensenanza: str
    curso: str
    id_usuario_ejecutor: int
    cod_tipo_ensenanza: Optional[int] = None
    cod_grado: Optional[int] = None
    letra_curso: Optional[str] = None
    es_excedente: bool = False
    numero_resolucion_excedente: Optional[str] = None
    fecha_resolucion_excedente: Optional[date] = None
    es_alumno_practica: Optional[bool] = False
    opcion_religion: str
    acepta_compromiso: bool
    autoriza_entrevista: bool
    autoriza_imagen: bool
    metodo_firma: str
    
class MatriculaUpdate(BaseModel):
    estado: str
    fecha_retiro: Optional[date] = None
    motivo_retiro: Optional[str] = None
    observaciones: Optional[str] = None
    id_usuario_ejecutor: int 
    correo_destino: Optional[str] = None

class CuestionarioRetiro(BaseModel):
    rut_estudiante: str 
    motivo_real: str    

class LoginRequest(BaseModel):
    email: str
    password: str
    rol: str