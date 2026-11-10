"""Pruebas de lógica pura de las reglas de correo del estudiante (sin base de datos)."""
import pytest
from fastapi import HTTPException

from reglas_estudiante import (
    CORREO_PERSONAL_POR_NIVEL, OBLIGATORIO, OPCIONAL,
    correo_personal_es_obligatorio, es_correo_valido, nivel_desde_curso, validar_formato_correo,
)


@pytest.mark.parametrize("curso, nivel", [
    ("4° medio A", "4MEDIO"), ("4° Medio B", "4MEDIO"), ("3° medio C", "3MEDIO"),
    ("8° básico A", "8BASICO"), ("1° Básico", "1BASICO"),
])
def test_nivel_desde_curso(curso, nivel):
    assert nivel_desde_curso(curso) == nivel


def test_regla_acordada_cuarto_obligatorio_tercero_opcional():
    assert CORREO_PERSONAL_POR_NIVEL["4MEDIO"] == OBLIGATORIO
    assert CORREO_PERSONAL_POR_NIVEL["3MEDIO"] == OPCIONAL


@pytest.mark.parametrize("curso, esperado", [
    ("4° medio A", True),
    ("3° medio A", False),   # opcional hasta decisión funcional
    ("2° medio A", False),
    ("8° básico A", False),
    (None, False),
    ("", False),
])
def test_obligatoriedad_por_curso(curso, esperado):
    assert correo_personal_es_obligatorio(curso) is esperado


@pytest.mark.parametrize("correo", ["alumno@gmail.com", "a.b-c@dominio.cl", "x@sub.dominio.com"])
def test_correos_validos(correo):
    assert es_correo_valido(correo)
    validar_formato_correo(correo, "Correo")  # no lanza


@pytest.mark.parametrize("correo", ["sin-arroba.cl", "a@b", "a @b.cl", "@dominio.cl", "a@.c"])
def test_correos_invalidos(correo):
    assert not es_correo_valido(correo)
    with pytest.raises(HTTPException) as e:
        validar_formato_correo(correo, "Correo")
    assert e.value.status_code == 422


@pytest.mark.parametrize("vacio", [None, "", "   "])
def test_correo_vacio_no_falla_la_validacion_de_formato(vacio):
    validar_formato_correo(vacio, "Correo")
