"""
importar_registro_2026.py
Importa direcciones y apoderados desde el Excel 'registro_general_matricula_2026.xlsx'
a la base, SIN pisar datos buenos existentes.

Fuente: csv pruebas/registro_general_matricula_2026 (1).xlsx (direcciones ya separadas
en calle/numeracion/sector/comuna y apoderados titular+suplente con rut/telefono/correo).

Reglas de "NO PISAR DATOS BUENOS":
  - Dirección del estudiante: se rellena calle/numero/sector/comuna SOLO si el estudiante
    NO tiene ya una 'calle' estructurada en la base.
  - Apoderado titular: se crea/vincula SOLO si el estudiante NO tiene id_apoderado_principal.
  - Apoderado suplente: se crea/vincula SOLO si el estudiante NO tiene id_apoderado_suplente.
  - El RUT del apoderado se normaliza y se reutiliza si ya existe (no se duplica).

ESTRATEGIA DE RENDIMIENTO (clave): la base está en Supabase (EE.UU.), ~140 ms por round-trip.
Hacer una query por fila (~27k ops) tardaría más de 1 hora y choca con el statement_timeout
del pooler. En su lugar:
  1. Se cargan en memoria TODOS los estudiantes y apoderados existentes (2 queries).
  2. Se procesa el Excel en memoria.
  3. Se insertan apoderados nuevos y se actualizan estudiantes en BLOQUE con execute_values
     (pocas sentencias grandes en vez de miles chicas).

Matching: estudiante por run_ipe normalizado (sin puntos/guion) == rut_est+dv_est del Excel.

Uso:
    python importar_registro_2026.py            # DRY-RUN (no escribe), imprime impacto
    python importar_registro_2026.py --apply    # aplica los cambios

Idempotente: re-ejecutarlo no duplica ni cambia lo ya cargado (solo rellena vacíos).
Requiere: pandas, openpyxl.
"""
import sys
import os
import re
import argparse

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_db_connection
from services.utils import normalizar_rut
from services.estudiante_service import componer_domicilio
from psycopg2.extras import execute_values

RUTA_EXCEL_DEFAULT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "csv pruebas",
    "registro_general_matricula_2026 (1).xlsx",
)


def limpiar(v) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    if s.lower() in ("nan", "none", "null", "s/i", "sin informacion", "sin información"):
        return ""
    return s


def rut_estudiante(cuerpo, dv) -> str:
    c = re.sub(r"[.\-\s]", "", limpiar(cuerpo)).upper()
    d = re.sub(r"[.\-\s]", "", limpiar(dv)).upper()
    return (c + d)


def rut_apoderado(cuerpo, dv) -> str:
    """RUT canónico o '' si no es válido (descarta basura tipo 'NO')."""
    c = limpiar(cuerpo)
    d = limpiar(dv)
    if not c:
        return ""
    cuerpo_limpio = re.sub(r"[.\-\s]", "", c)
    if not cuerpo_limpio.isdigit() or not (7 <= len(cuerpo_limpio) <= 9):
        return ""
    return normalizar_rut(f"{c}{d}" if d else c)[:20]


def limpiar_telefono(v) -> str:
    s = limpiar(v)
    if not s:
        return ""
    if ("e" in s.lower() or "." in s) and re.match(r"^-?\d+(\.\d+)?([eE][+-]?\d+)?$", s):
        try:
            s = str(int(float(s)))
        except (ValueError, OverflowError):
            pass
    return re.sub(r"\D", "", s)[:20]


def nombre_valido(nombre_completo: str) -> bool:
    s = limpiar(nombre_completo)
    if len(s) < 3:
        return False
    if s.upper() in ("NO", "SI", "S/I", "N/A", "NN", "NO APLICA", "SIN INFORMACION"):
        return False
    return True


def separar_nombre(nombre_completo: str):
    s = limpiar(nombre_completo)
    # Formato con coma: "APELLIDO APELLIDO, NOMBRES" (así vienen los titulares del Excel).
    if "," in s:
        izq, der = s.split(",", 1)
        apellidos = [p for p in izq.split() if p]
        nombres = der.strip()
        pat = apellidos[0] if apellidos else "Titular"
        mat = apellidos[1] if len(apellidos) > 1 else None
        return (nombres[:100] or "Apoderado", pat[:100], (mat[:100] if mat else None))
    # Formato normal: "NOMBRES APELLIDO APELLIDO".
    partes = [p for p in s.split() if p]
    if not partes:
        return ("Apoderado", "Titular", None)
    if len(partes) == 1:
        return (partes[0][:100], "Titular", None)
    if len(partes) == 2:
        return (partes[0][:100], partes[1][:100], None)
    return (" ".join(partes[:-2])[:100], partes[-2][:100], partes[-1][:100])


def procesar(ruta_excel: str, aplicar: bool = False):
    import pandas as pd

    print(f"Leyendo Excel: {ruta_excel}", flush=True)
    df = pd.read_excel(ruta_excel, dtype=str)
    print(f"Filas en Excel: {len(df)}", flush=True)

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SET statement_timeout = 0;")
        conn.commit()
    except Exception:
        conn.rollback()

    try:
        # --- Cargar TODO a memoria (2 queries) ---
        print("Cargando estudiantes y apoderados existentes...", flush=True)
        cur.execute("""
            SELECT upper(regexp_replace(run_ipe,'[.\\-\\s]','','g')),
                   id_estudiante, calle, id_apoderado_principal, id_apoderado_suplente
            FROM estudiante
        """)
        base = {r[0]: {"id": r[1], "calle": r[2], "ppal": r[3], "supl": r[4]} for r in cur.fetchall()}
        print(f"  estudiantes: {len(base)}", flush=True)

        cur.execute("SELECT rut_pasaporte, id_apoderado FROM apoderado")
        apod_existentes = {r[0]: r[1] for r in cur.fetchall()}
        print(f"  apoderados existentes: {len(apod_existentes)}", flush=True)

        stats = {"sin_match": 0, "dir_rellenada": 0, "dir_omitida": 0, "dir_sin_datos": 0,
                 "ppal_nuevo": 0, "ppal_omitido": 0, "ppal_sin_datos": 0,
                 "supl_nuevo": 0, "supl_omitido": 0, "supl_sin_datos": 0}

        # Acumuladores para escritura en bloque
        apod_a_insertar = {}   # rut -> (rut, nombres, pat, mat, dom, tel, correo, relacion)
        dir_updates = []       # (calle, numero, sector, comuna, domicilio, id_est)
        vinc_ppal = []         # (rut_apod, id_est)
        vinc_supl = []         # (rut_apod, id_est)

        def registrar_apod(rut, nom_completo, tel_col, cor_col, relacion):
            """Agrega apoderado a insertar si no existe ni en base ni ya acumulado."""
            if rut not in apod_existentes and rut not in apod_a_insertar:
                n, p, m = separar_nombre(nom_completo)
                tel = limpiar_telefono(tel_col) or None
                cor = (limpiar(cor_col)[:100] or None)
                apod_a_insertar[rut] = (rut, n, p, m, "Sin registrar", tel, cor, relacion)

        for _, row in df.iterrows():
            run = rut_estudiante(row.get("rut_est"), row.get("dv_est"))
            est = base.get(run)
            if not est:
                stats["sin_match"] += 1
                continue

            # 1) DIRECCION
            calle = limpiar(row.get("calle"))
            numero = limpiar(row.get("numeracion"))
            sector = limpiar(row.get("cerro_barrio_sector_localidad"))
            comuna = limpiar(row.get("comuna"))
            if calle or numero:
                if limpiar(est["calle"]):
                    stats["dir_omitida"] += 1
                else:
                    dom = componer_domicilio(calle or None, numero or None, sector or None, comuna or None)
                    dir_updates.append((calle or None, numero or None, sector or None, comuna or None, dom, est["id"]))
                    stats["dir_rellenada"] += 1
            else:
                stats["dir_sin_datos"] += 1

            # 2) APODERADO TITULAR
            rut_t = rut_apoderado(row.get("rut_apoderado_titular"), row.get("dv_apoderado_titular"))
            nom_t = limpiar(row.get("nombre_completo_apoderado_titular"))
            if est["ppal"]:
                stats["ppal_omitido"] += 1
            elif rut_t and nombre_valido(nom_t):
                registrar_apod(rut_t, nom_t, row.get("telefono_apoderado_titular"),
                               row.get("correo_electronico_apoderado_titular"), "Apoderado Titular")
                vinc_ppal.append((rut_t, est["id"]))
                stats["ppal_nuevo"] += 1
            else:
                stats["ppal_sin_datos"] += 1

            # 3) APODERADO SUPLENTE
            rut_s = rut_apoderado(row.get("rut_apoderado_suplente"), row.get("dv_apoderado_suplente"))
            nom_s = limpiar(row.get("nombre_completo_apoderado_suplente"))
            if est["supl"]:
                stats["supl_omitido"] += 1
            elif rut_s and nombre_valido(nom_s):
                registrar_apod(rut_s, nom_s, row.get("telefono_apoderado_suplente"),
                               row.get("correo_electronico_apoderado_suplente"), "Apoderado Suplente")
                vinc_supl.append((rut_s, est["id"]))
                stats["supl_nuevo"] += 1
            else:
                stats["supl_sin_datos"] += 1

        print(f"\nApoderados nuevos a insertar: {len(apod_a_insertar)}", flush=True)
        print(f"Direcciones a rellenar: {len(dir_updates)}", flush=True)
        print(f"Vínculos titular: {len(vinc_ppal)} | suplente: {len(vinc_supl)}", flush=True)

        if not aplicar:
            conn.rollback()
            _reporte(stats, aplicado=False)
            return

        # --- ESCRITURA EN CHUNKS CON COMMIT ENTRE CADA UNO ---
        # Una sola sentencia gigante choca con la latencia/timeout del pooler.
        # Insertamos en trozos de CHUNK filas, commiteando entre cada trozo, con
        # progreso visible. Idempotente (ON CONFLICT / WHERE ... IS NULL).
        CHUNK = 1000

        def en_chunks(lista):
            for i in range(0, len(lista), CHUNK):
                yield lista[i:i + CHUNK]

        # a) Insertar apoderados nuevos.
        if apod_a_insertar:
            filas = list(apod_a_insertar.values())
            total = len(filas)
            print(f"Insertando {total} apoderados en chunks de {CHUNK}...", flush=True)
            hecho = 0
            for ch in en_chunks(filas):
                execute_values(cur, """
                    INSERT INTO apoderado (rut_pasaporte, nombres, apellido_paterno, apellido_materno,
                                           domicilio, telefono, correo_electronico, relacion_estudiante)
                    VALUES %s
                    ON CONFLICT (rut_pasaporte) DO NOTHING
                """, ch, page_size=CHUNK)
                conn.commit()
                hecho += len(ch)
                print(f"  apoderados: {hecho}/{total}", flush=True)
            cur.execute("SELECT rut_pasaporte, id_apoderado FROM apoderado")
            apod_existentes = {r[0]: r[1] for r in cur.fetchall()}

        # b) Rellenar direcciones.
        if dir_updates:
            print(f"Actualizando {len(dir_updates)} direcciones...", flush=True)
            for ch in en_chunks(dir_updates):
                execute_values(cur, """
                    UPDATE estudiante AS e SET
                        calle = d.calle, numero = d.numero, sector = d.sector,
                        comuna = d.comuna, domicilio = d.domicilio
                    FROM (VALUES %s) AS d(calle, numero, sector, comuna, domicilio, id_est)
                    WHERE e.id_estudiante = d.id_est AND e.calle IS NULL
                """, ch, page_size=CHUNK)
                conn.commit()

        # c) Vincular titular.
        pares_ppal = [(apod_existentes[r], idest) for (r, idest) in vinc_ppal if r in apod_existentes]
        if pares_ppal:
            total = len(pares_ppal)
            print(f"Vinculando {total} apoderados titulares...", flush=True)
            hecho = 0
            for ch in en_chunks(pares_ppal):
                execute_values(cur, """
                    UPDATE estudiante AS e SET id_apoderado_principal = v.id_apod
                    FROM (VALUES %s) AS v(id_apod, id_est)
                    WHERE e.id_estudiante = v.id_est AND e.id_apoderado_principal IS NULL
                """, ch, page_size=CHUNK)
                conn.commit()
                hecho += len(ch)
                print(f"  titulares: {hecho}/{total}", flush=True)

        # d) Vincular suplente.
        pares_supl = [(apod_existentes[r], idest) for (r, idest) in vinc_supl if r in apod_existentes]
        if pares_supl:
            total = len(pares_supl)
            print(f"Vinculando {total} apoderados suplentes...", flush=True)
            hecho = 0
            for ch in en_chunks(pares_supl):
                execute_values(cur, """
                    UPDATE estudiante AS e SET id_apoderado_suplente = v.id_apod
                    FROM (VALUES %s) AS v(id_apod, id_est)
                    WHERE e.id_estudiante = v.id_est AND e.id_apoderado_suplente IS NULL
                """, ch, page_size=CHUNK)
                conn.commit()
                hecho += len(ch)
                print(f"  suplentes: {hecho}/{total}", flush=True)

        print("\n>>> CAMBIOS APLICADOS (commit).", flush=True)
        _reporte(stats, aplicado=True)

    except Exception as e:
        conn.rollback()
        print(f"ERROR (rollback): {type(e).__name__}: {e}", flush=True)
        raise
    finally:
        cur.close()
        conn.close()


def _reporte(stats, aplicado):
    print("\n=== IMPACTO ===", flush=True)
    print(f"Filas sin match en base:        {stats['sin_match']}")
    print("-- Direccion estudiante --")
    print(f"  Rellenadas (estaban vacias):  {stats['dir_rellenada']}")
    print(f"  Omitidas (ya tenian calle):   {stats['dir_omitida']}")
    print(f"  Sin datos en Excel:           {stats['dir_sin_datos']}")
    print("-- Apoderado titular --")
    print(f"  Nuevos vinculados:            {stats['ppal_nuevo']}")
    print(f"  Omitidos (ya tenian):         {stats['ppal_omitido']}")
    print(f"  Sin datos validos en Excel:   {stats['ppal_sin_datos']}")
    print("-- Apoderado suplente --")
    print(f"  Nuevos vinculados:            {stats['supl_nuevo']}")
    print(f"  Omitidos (ya tenian):         {stats['supl_omitido']}")
    print(f"  Sin datos validos en Excel:   {stats['supl_sin_datos']}")
    print(">>> DRY-RUN: nada escrito." if not aplicado else ">>> Aplicado.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--excel", default=RUTA_EXCEL_DEFAULT)
    args = ap.parse_args()
    procesar(args.excel, aplicar=args.apply)
