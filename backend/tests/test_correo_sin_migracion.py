"""El código de correo debe funcionar ANTES y DESPUÉS de aplicar la migración
(sin base de datos real: cursor simulado)."""
import pytest
from fastapi import HTTPException

from services import estudiante_service as svc


class CursorFalso:
    def __init__(self, respuestas):
        self.respuestas = list(respuestas)  # una respuesta por cada fetchone
        self.ejecutadas = []

    def execute(self, sql, params=None):
        self.ejecutadas.append(" ".join(sql.split()))

    def fetchone(self):
        return self.respuestas.pop(0)


@pytest.fixture(autouse=True)
def reiniciar_cache():
    svc._COLUMNAS_CORREO_OK = False
    yield
    svc._COLUMNAS_CORREO_OK = False


def test_sin_migracion_detecta_que_faltan_columnas():
    assert svc._tiene_columnas_correo(CursorFalso([(0,)])) is False


def test_con_migracion_detecta_columnas_y_cachea():
    cur = CursorFalso([(2,)])
    assert svc._tiene_columnas_correo(cur) is True
    assert svc._tiene_columnas_correo(cur) is True  # segunda vez sin consultar
    assert len(cur.ejecutadas) == 1


def test_cuarto_medio_sin_correo_se_rechaza():
    cur = CursorFalso([(None,), ("4° medio A",)])
    with pytest.raises(HTTPException) as e:
        svc._guardar_correo_estudiante(cur, 1, "", None)
    assert e.value.status_code == 422


def test_cuarto_medio_con_correo_ya_guardado_no_se_rechaza():
    # No se envía el campo (None): vale el correo ya guardado.
    cur = CursorFalso([("alumno@gmail.com",), ("4° medio A",)])
    svc._guardar_correo_estudiante(cur, 1, None, None)
    assert not any(s.startswith("UPDATE") for s in cur.ejecutadas)


def test_tercero_medio_sin_correo_se_acepta_y_guarda():
    cur = CursorFalso([(None,), ("3° medio A",)])
    svc._guardar_correo_estudiante(cur, 1, "", "")
    assert sum(s.startswith("UPDATE estudiante SET correo_") for s in cur.ejecutadas) == 2
