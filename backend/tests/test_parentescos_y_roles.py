"""Pruebas de lógica pura (sin base de datos).

Cubren:
  - Catálogo único de parentescos y compatibilidad con valores históricos.
  - Que el aislamiento por establecimiento aplique a TODO rol que no sea SLEP
    (antes solo aplicaba a "Colegio" y "Visualizador_Colegio").
"""
import pytest
from fastapi import HTTPException

from parentescos import PARENTESCOS, validar_parentesco, es_parentesco_del_catalogo
from services.matricula_service import _es_usuario_acotado


# ---------------------------------------------------------------- parentescos
def test_catalogo_tiene_las_ocho_opciones_acordadas():
    assert PARENTESCOS == (
        "Madre", "Padre", "Abuelo Paterno", "Abuela Paterna",
        "Abuelo Materno", "Abuela Materna", "Tutor Legal Designado", "Otro",
    )


@pytest.mark.parametrize("valor", list(PARENTESCOS))
def test_valores_del_catalogo_son_validos(valor):
    validar_parentesco(valor)  # no lanza


@pytest.mark.parametrize("vacio", [None, "", "   "])
def test_vacio_es_valido_porque_el_parentesco_no_es_obligatorio(vacio):
    validar_parentesco(vacio)


def test_valor_fuera_del_catalogo_se_rechaza():
    with pytest.raises(HTTPException) as e:
        validar_parentesco("Tía")
    assert e.value.status_code == 422


@pytest.mark.parametrize("historico", ["Apoderado Titular", "Apoderado Suplente", "Papá", "PADRE", "Papa ", "Familiar"])
def test_valor_historico_se_acepta_solo_si_ya_estaba_guardado(historico):
    # Sin ser el valor guardado: rechazado.
    with pytest.raises(HTTPException):
        validar_parentesco(historico)
    # Idéntico al guardado: aceptado (no se obliga a reescribirlo).
    validar_parentesco(historico, legados_aceptados=[historico])


def test_valor_historico_distinto_al_guardado_se_rechaza():
    with pytest.raises(HTTPException):
        validar_parentesco("Tia", legados_aceptados=["Papá"])


def test_catalogo_es_coincidencia_exacta_para_no_ocultar_variantes():
    assert es_parentesco_del_catalogo("Madre")
    assert not es_parentesco_del_catalogo("madre")
    assert not es_parentesco_del_catalogo("Madre ")


# --------------------------------------------------------------------- roles
@pytest.mark.parametrize("rol", ["admin_slep", "Visualizador_SLEP", "SLEP", "admin"])
def test_roles_slep_no_quedan_acotados(rol):
    assert _es_usuario_acotado({"rol": rol}) is False


@pytest.mark.parametrize("rol", [
    "Colegio", "COLEGIO", "Director", "Matriculador", "Visualizador_Colegio",
    "Docente_Jefe", "rol_desconocido", "", None,
])
def test_todo_rol_que_no_es_slep_queda_acotado_a_su_colegio(rol):
    # Regresión: Matriculador, Director y variantes de mayúsculas quedaban sin restricción.
    assert _es_usuario_acotado({"rol": rol}) is True


def test_sin_usuario_no_aplica_restriccion_interna():
    # Llamadas internas (scripts) pasan usuario_actual=None.
    assert _es_usuario_acotado(None) is False
