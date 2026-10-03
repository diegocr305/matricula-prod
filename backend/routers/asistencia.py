# routers/asistencia.py
from fastapi import APIRouter, Depends
from typing import Optional
from security import obtener_usuario_actual
from services import asistencia_service

router = APIRouter(prefix="/asistencia", tags=["Analítica de Asistencia"])


@router.get("/resumen")
def resumen_asistencia(
    establecimiento_id: Optional[int] = None,
    anio: Optional[int] = None,
    usuario_actual: dict = Depends(obtener_usuario_actual),
):
    """Agregado del panel de asistencia (KPIs, semáforo, tendencia, ranking).
    SLEP ve todos los establecimientos; Colegio solo el suyo. Sin datos personales."""
    rol = usuario_actual.get("rol")
    if rol in ["Colegio", "Visualizador_Colegio"]:
        establecimiento_id = usuario_actual.get("id_establecimiento")
    return asistencia_service.obtener_resumen_asistencia_db(establecimiento_id, anio)


@router.get("/anios")
def anios_asistencia(usuario_actual: dict = Depends(obtener_usuario_actual)):
    return asistencia_service.obtener_anios_asistencia_db()
