"""
Catálogo central de roles del sistema RGM — FUENTE ÚNICA DE VERDAD.

Antes la validación de rol estaba repartida en listas hardcodeadas e inconsistentes
(unas en mayúsculas, otras con .lower()) por security.py, auth_service.py y los routers.
Este módulo centraliza:
  - qué roles existen,
  - su alcance (nivel central SLEP vs establecimiento),
  - si pueden escribir o son solo lectura,
  - a qué pestañas/paneles acceden.

Toda comparación de rol se hace NORMALIZADA (minúsculas, sin espacios) para tolerar
la mezcla histórica de capitalización que hay en la base (Colegio / COLEGIO / Director).
"""

# --- Identificadores canónicos de rol (el valor que conviene guardar en la BD) ---
ADMIN_SLEP = "admin_slep"
VISUALIZADOR_SLEP = "Visualizador_SLEP"
COLEGIO = "Colegio"
MATRICULADOR = "Matriculador"
VISUALIZADOR_COLEGIO = "Visualizador_Colegio"
DOCENTE_JEFE = "Docente_Jefe"  # futuro: acceso acotado a su curso (requiere id_curso)

# --- Pestañas/paneles del sistema (deben calzar con las rutas del frontend) ---
TAB_INICIO = "inicio"
TAB_MATRICULAS = "matriculas"
TAB_ESTUDIANTES = "estudiantes"
TAB_PANEL = "panel"          # /inicio -> Panel de Control (dashboard)
TAB_ASISTENCIA = "asistencia"
TAB_AUDITORIA = "auditoria"  # Trazabilidad & Auditoría

TODAS_LAS_PESTANAS = [
    TAB_INICIO, TAB_MATRICULAS, TAB_ESTUDIANTES,
    TAB_PANEL, TAB_ASISTENCIA, TAB_AUDITORIA,
]


def _norm(rol) -> str:
    """Normaliza un rol a minúsculas sin espacios para comparar sin importar capitalización."""
    return str(rol or "").strip().lower()


# --- Definición de cada rol ---
# alcance:   'slep'  = nivel central, ve todos los establecimientos
#            'colegio' = acotado a su id_establecimiento
# escribe:   True si puede hacer POST/PUT/DELETE; False = solo lectura
# pestanas:  conjunto de pestañas visibles/accesibles
# alias:     otras formas (normalizadas) en que ese rol aparece en la BD/legado
ROLES = {
    _norm(ADMIN_SLEP): {
        "canonico": ADMIN_SLEP,
        "alcance": "slep",
        "escribe": True,
        "pestanas": set(TODAS_LAS_PESTANAS),
        "alias": {"slep", "admin"},
    },
    _norm(VISUALIZADOR_SLEP): {
        "canonico": VISUALIZADOR_SLEP,
        "alcance": "slep",
        "escribe": False,
        "pestanas": set(TODAS_LAS_PESTANAS),
        "alias": {"visualizador_slep", "visualizador"},
    },
    _norm(COLEGIO): {
        "canonico": COLEGIO,
        "alcance": "colegio",
        "escribe": True,
        # Director / directivo: todo lo de su colegio (incluye Panel y Asistencia)
        "pestanas": {TAB_INICIO, TAB_MATRICULAS, TAB_ESTUDIANTES, TAB_PANEL, TAB_ASISTENCIA},
        "alias": {"colegio", "director", "establecimiento"},
    },
    _norm(MATRICULADOR): {
        "canonico": MATRICULADOR,
        "alcance": "colegio",
        "escribe": True,
        # Solo el trabajo de matrícula: NO ve Panel ni Asistencia
        "pestanas": {TAB_INICIO, TAB_MATRICULAS, TAB_ESTUDIANTES},
        "alias": {"matriculador"},
    },
    _norm(VISUALIZADOR_COLEGIO): {
        "canonico": VISUALIZADOR_COLEGIO,
        "alcance": "colegio",
        "escribe": False,
        "pestanas": {TAB_INICIO, TAB_MATRICULAS, TAB_ESTUDIANTES, TAB_PANEL, TAB_ASISTENCIA},
        "alias": {"visualizador_colegio"},
    },
    _norm(DOCENTE_JEFE): {
        "canonico": DOCENTE_JEFE,
        "alcance": "colegio",  # a futuro: acotado a curso vía id_curso
        "escribe": True,
        "pestanas": {TAB_INICIO, TAB_MATRICULAS, TAB_ESTUDIANTES},
        "alias": {"docente_jefe", "profesor_jefe"},
    },
}

# Índice inverso alias-normalizado -> clave canónica, para resolver cualquier variante.
_ALIAS_INDEX = {}
for _clave, _def in ROLES.items():
    _ALIAS_INDEX[_clave] = _clave
    for _a in _def["alias"]:
        _ALIAS_INDEX[_norm(_a)] = _clave


def _resolver(rol) -> dict | None:
    """Devuelve la definición del rol a partir de cualquier variante/capitalización."""
    clave = _ALIAS_INDEX.get(_norm(rol))
    return ROLES.get(clave) if clave else None


# ---------------------------------------------------------------------------
# API pública usada por security.py, los routers y los scripts de alta
# ---------------------------------------------------------------------------
def es_rol_valido(rol) -> bool:
    return _resolver(rol) is not None


def es_slep(rol) -> bool:
    """True si el rol es de nivel central (ve todos los establecimientos)."""
    d = _resolver(rol)
    return bool(d and d["alcance"] == "slep")


def puede_escribir(rol) -> bool:
    """True si el rol puede hacer modificaciones (no es visualizador)."""
    d = _resolver(rol)
    return bool(d and d["escribe"])


def puede_ver_pestana(rol, pestana: str) -> bool:
    d = _resolver(rol)
    return bool(d and pestana in d["pestanas"])


def pestanas_de(rol) -> list:
    d = _resolver(rol)
    return sorted(d["pestanas"]) if d else []


def canonico(rol) -> str | None:
    d = _resolver(rol)
    return d["canonico"] if d else None
