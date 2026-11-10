"""Pruebas de lógica pura de domicilios (sin base de datos)."""
import pytest

from services.estudiante_service import componer_domicilio, normalizar_numero_domicilio


@pytest.mark.parametrize("entrada, esperado", [
    ("s/n", "S/N"), ("S/N", "S/N"), ("sn", "S/N"), ("S / N", "S/N"),
    ("sin numero", "S/N"), ("Sin Número", "S/N"),
    ("1234", "1234"), ("  45   B ", "45 B"), ("Depto 5", "Depto 5"),
])
def test_normaliza_numero_y_unifica_sin_numero(entrada, esperado):
    assert normalizar_numero_domicilio(entrada) == esperado


@pytest.mark.parametrize("vacio", [None, "", "   "])
def test_numero_vacio_devuelve_none(vacio):
    assert normalizar_numero_domicilio(vacio) is None


def test_compone_domicilio_completo():
    assert componer_domicilio("Av. Argentina", "1234", "Cerro Alegre", "Valparaíso") == \
        "Av. Argentina 1234, Cerro Alegre, Valparaíso"


def test_compone_domicilio_sin_sector():
    assert componer_domicilio("Prat", "450", None, "Valparaíso") == "Prat 450, Valparaíso"


def test_compone_domicilio_vacio_devuelve_none():
    assert componer_domicilio(None, None, None, None) is None
    assert componer_domicilio("", "", "", "") is None


def test_domicilio_desglosado_del_apoderado_se_compone_con_s_n():
    # Caso del bug: el desglose del apoderado debe producir un texto propio,
    # no heredar el del estudiante.
    texto = componer_domicilio("Los Aromos", normalizar_numero_domicilio("s/n"), None, "Quilpué")
    assert texto == "Los Aromos S/N, Quilpué"
