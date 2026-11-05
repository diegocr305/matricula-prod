# services/utils.py

def determinar_nivel_backend(curso_str: str, cod_tipo: int) -> str:
    texto = str(curso_str).lower() if curso_str else ""
    
    # 1. PARVULARIA: Prioridad absoluta para palabras clave de educación inicial
    palabras_parvularia = ['kinder', 'kínder', 'parvularia', 'sala cuna', 'nivel medio', 'heterogéneo', 'heterogeneo', 'transición']
    if any(palabra in texto for palabra in palabras_parvularia) or cod_tipo == 10: 
        return 'Educación Parvularia'
    
    # 2. BÁSICA
    if 'básico' in texto or 'basico' in texto or (cod_tipo and 110 <= cod_tipo <= 119): 
        return 'Educación Básica'
    
    # 3. MEDIA: (Solo caerá aquí si no es "Nivel Medio" de parvularia)
    if 'medio' in texto or 'media' in texto or (cod_tipo and cod_tipo >= 300): 
        return 'Educación Media'
    
    return 'Educación Básica'


import re


def normalizar_rut(rut) -> str:
    """Normaliza un RUT/pasaporte al formato canónico del sistema.

    - Quita puntos, guiones y espacios.
    - Pasa el dígito verificador a mayúscula (para el caso 'K').
    - Devuelve el cuerpo con guion antes del DV: '12345678-9'.

    No importa cómo lo escriba el funcionario ('12.345.678-9', '123456789',
    '12345678-9', con espacios): siempre queda '12345678-9'. Así el SELECT por
    rut_pasaporte encuentra al apoderado existente y no se crean duplicados.

    Casos borde:
    - Vacío / None -> "".
    - Menos de 2 caracteres tras limpiar -> se devuelve tal cual (no se puede
      separar cuerpo/DV de forma segura).
    """
    if not rut:
        return ""
    limpio = re.sub(r"[.\-\s]", "", str(rut)).upper()
    if len(limpio) < 2:
        return limpio
    cuerpo, dv = limpio[:-1], limpio[-1]
    return f"{cuerpo}-{dv}"


def normalizar_texto_curso(curso_str) -> str:
    """Normaliza el texto libre de 'curso' a una forma canónica única, para evitar
    duplicados en los filtros (DISTINCT curso) por diferencias de mayúsculas/espacios.

    Problema que resuelve: la carga masiva SIGE y la matrícula manual generaban el
    mismo curso con formato distinto ('8° Básico A' vs '8° básico A'), y como el
    campo 'curso' es texto libre, el selector de cursos los mostraba como dos cursos
    distintos (uno real y otro casi vacío).

    Regla canónica (coincide con el formato mayoritario que trae SIGE):
      - Colapsa espacios múltiples.
      - Capitaliza las palabras de grado conocidas: Básico, Media/Medio, Kínder,
        Prekínder, Transición, etc.
      - La letra final de curso (una sola letra) queda en MAYÚSCULA.
      - No inventa datos: si no reconoce el patrón, solo limpia espacios y deja el
        texto tal cual (sin forzar), para no corromper cursos atípicos.

    Ejemplos:
      '8° básico a'   -> '8° Básico A'
      '3° MEDIO b'    -> '3° Medio B'
      '  1°  medio C' -> '1° Medio C'
      'Pre-Kinder A'  -> 'Pre-Kinder A'  (no reconocido como patrón estándar: solo limpia)
    """
    if curso_str is None:
        return curso_str
    texto = re.sub(r"\s+", " ", str(curso_str)).strip()
    if not texto:
        return texto

    # Mapa de palabras de grado -> forma canónica (comparación sin acentos/caso).
    reemplazos = {
        "basico": "Básico",
        "básico": "Básico",
        "basica": "Básica",
        "básica": "Básica",
        "medio": "Medio",
        "media": "Media",
        "kinder": "Kínder",
        "kínder": "Kínder",
        "prekinder": "Prekínder",
        "prekínder": "Prekínder",
        "transicion": "Transición",
        "transición": "Transición",
    }

    tokens = texto.split(" ")
    out = []
    for i, tok in enumerate(tokens):
        clave = tok.lower()
        if clave in reemplazos:
            out.append(reemplazos[clave])
        elif i == len(tokens) - 1 and len(tok) == 1 and tok.isalpha():
            # Letra de curso al final: a -> A
            out.append(tok.upper())
        else:
            out.append(tok)
    return " ".join(out)
