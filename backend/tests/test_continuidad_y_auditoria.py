"""Pruebas de lógica pura: continuidad (no duplicar pre-matrículas) y clasificación de auditoría."""
import json

from services.matricula_service import detectar_prematricula_pendiente
from services.reporte_service import clasificar_evento


def _mp(id_mat, curso, anio, id_est, estado_renov, estado="Activa"):
    # Mismo orden de columnas que el SELECT de crear_nueva_matricula_db.
    return (id_mat, curso, "Educación Media", 4, anio, estado, id_est, "Liceo", "1520", None, None, estado_renov)


def test_prematricula_por_renovar_del_mismo_anio_y_colegio_bloquea():
    previas = [_mp(1, "4° medio A", 2027, 17, "Por renovar")]
    msg = detectar_prematricula_pendiente(previas, 2027, 17)
    assert msg and "Confirmar renovación" in msg


def test_pendiente_firma_tambien_bloquea():
    assert detectar_prematricula_pendiente([_mp(1, "2° medio A", 2027, 17, "Pendiente firma")], 2027, 17)


def test_firmada_no_bloquea_flujos_existentes():
    assert detectar_prematricula_pendiente([_mp(1, "2° medio A", 2027, 17, "Firmada")], 2027, 17) is None


def test_otro_anio_u_otro_colegio_no_bloquea():
    previas = [_mp(1, "4° medio A", 2027, 17, "Por renovar")]
    assert detectar_prematricula_pendiente(previas, 2026, 17) is None
    assert detectar_prematricula_pendiente(previas, 2027, 99) is None


def test_matricula_sin_estado_de_renovacion_no_bloquea():
    assert detectar_prematricula_pendiente([_mp(1, "8° básico A", 2026, 17, None)], 2026, 17) is None


def test_cambio_de_curso_ahora_se_clasifica():
    tipo, detalle = clasificar_evento(
        "UPDATE",
        json.dumps({"curso": "2° medio A", "estado": "Activa"}),
        json.dumps({"curso": "2° medio B", "estado": "Activa"}),
    )
    assert tipo == "CAMBIO_CURSO"
    assert "2° medio A" in detalle and "2° medio B" in detalle


def test_actualizacion_sin_cambio_de_curso_sigue_siendo_actualizacion():
    tipo, _ = clasificar_evento("UPDATE", {"curso": "1° medio A", "observaciones": "a"},
                                {"curso": "1° medio A", "observaciones": "b"})
    assert tipo == "ACTUALIZACION"
