# routers/dashboard.py
from fastapi import APIRouter, Depends
from typing import Optional
from security import obtener_usuario_actual

# Importamos la capa de servicio
from services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["Dashboard y Reportes"])

@router.get("/estadisticas")
def obtener_estadisticas_dashboard(
    establecimiento_id: Optional[int] = None, 
    anio: Optional[int] = None, 
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    rol = usuario_actual.get("rol")
    if rol in ["Colegio", "Visualizador_Colegio"]:
        establecimiento_id = usuario_actual.get("id_establecimiento")

    return dashboard_service.obtener_estadisticas_dashboard_db(establecimiento_id, anio)


@router.get("/calidad-dato")
def obtener_calidad_dato(
    establecimiento_id: Optional[int] = None,
    anio: Optional[int] = None,
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """Semáforo de calidad del dato por establecimiento (% dirección geolocalizable
    y % apoderado cargado). SLEP ve todos; Colegio solo el suyo."""
    rol = usuario_actual.get("rol")
    if rol in ["Colegio", "Visualizador_Colegio"]:
        establecimiento_id = usuario_actual.get("id_establecimiento")
    return dashboard_service.obtener_calidad_dato_por_establecimiento_db(establecimiento_id, anio)


@router.get("/muestra-geo")
def obtener_muestra_geo(
    establecimiento_id: Optional[int] = None,
    limite: int = 15,
    usuario_actual: dict = Depends(obtener_usuario_actual)
):
    """Muestra de direcciones reales anonimizadas para el mapa de ejemplo."""
    rol = usuario_actual.get("rol")
    if rol in ["Colegio", "Visualizador_Colegio"]:
        establecimiento_id = usuario_actual.get("id_establecimiento")
    limite = max(1, min(limite, 30))
    return dashboard_service.obtener_muestra_geo_db(establecimiento_id, limite)