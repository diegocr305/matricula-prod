# -*- coding: utf-8 -*-
"""
Análisis exploratorio y de riesgo de la asistencia mensual 2026 del SLEP Valparaíso.

SEGURO: trabaja SOLO con el Excel de prueba. No se conecta a ninguna base de datos
ni modifica el sistema RGM. Todo lo que produce son archivos de salida (CSV) en la
subcarpeta ./salida que puedes abrir en Excel para revisar.

Qué hace:
  1. Perfilado de calidad del dato (nulos, rangos, duplicados, cobertura por mes).
  2. Trayectoria por alumno: pivot marzo->agosto, promedio y TENDENCIA (pendiente).
  3. Índice de riesgo por REGLAS (explicable, no es un modelo de caja negra):
     combina nivel de asistencia + tendencia a la baja + persistencia de inasistencia.
  4. Resúmenes agregados por establecimiento y por nivel para el dashboard.

Uso:
    python analisis_asistencia.py
"""

from pathlib import Path
import numpy as np
import pandas as pd

# --- Rutas (relativas a este script, para que sea portable) ---
BASE = Path(__file__).resolve().parent
ARCHIVO = BASE / "matricula_slepv_2026 (1).xlsx"
SALIDA = BASE / "salida"
SALIDA.mkdir(exist_ok=True)

# Meses escolares esperados en este extracto (marzo..agosto)
MESES_ORDEN = [3, 4, 5, 6, 7, 8]
MES_GLOSA = {3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto"}

# Umbrales de asistencia (criterio Mineduc: < 85% = asistencia insuficiente)
UMBRAL_INSUFICIENTE = 0.85
UMBRAL_GRAVE = 0.70  # inasistencia grave

# --- Segmentacion de modalidades (decisiones del duenio, ver DECISIONES_ASISTENCIA.md) ---
# Jardines VTF: se analizan POR SEPARADO del resto (parvularia no es comparable con
#   basica/media). Hoy no estan en la BD del RGM; su dato se usara mas adelante.
# Adultos/Especial: se EXCLUYEN del analisis comparable (alineado con steering 08).
TIPO_VTF = "Jardines VTF"
# Patrones (en mayuscula) para detectar modalidad adultos/especial a excluir.
PATRONES_EXCLUIR = ["ADULTO", "EDUCACION INTEGRADA DE ADULTOS", "ESPECIAL"]


def segmentar(df: pd.DataFrame) -> pd.DataFrame:
    """Marca cada fila con su segmento de analisis:
       - 'excluido' : adultos / especial (no entran al analisis comparable)
       - 'vtf'      : Jardines VTF (se ven por separado)
       - 'escolar'  : el resto (basica / media regular) -> analisis principal
    """
    df = df.copy()
    glosa = df["glosa_ensenanza"].fillna("").str.upper()
    nombre = df["nombre_establecimiento"].fillna("").str.upper()
    es_excluido = False
    for pat in PATRONES_EXCLUIR:
        es_excluido = es_excluido | glosa.str.contains(pat) | nombre.str.contains(pat)
    df["segmento"] = np.where(
        es_excluido, "excluido",
        np.where(df["tipo_establecimiento"] == TIPO_VTF, "vtf", "escolar"))
    return df


def cargar():
    df = pd.read_excel(ARCHIVO)
    # Clave de alumno robusta: rut + dv como texto
    df["rut_full"] = df["rut_est"].astype("Int64").astype(str) + "-" + df["dv_est"].astype(str)
    df = segmentar(df)
    return df


# ---------------------------------------------------------------------------
# 1. PERFILADO DE CALIDAD
# ---------------------------------------------------------------------------
def perfilar(df: pd.DataFrame):
    lineas = []
    add = lineas.append
    add("=" * 70)
    add("INFORME DE CALIDAD DEL DATO - ASISTENCIA 2026")
    add("=" * 70)
    add(f"Filas totales            : {len(df):,}")
    add(f"Columnas                 : {df.shape[1]}")
    add(f"Estudiantes unicos       : {df['rut_full'].nunique():,}")
    add(f"Establecimientos (rbd)   : {df['rbd'].nunique()}")
    add(f"Meses presentes          : {sorted(df['mes_codigo'].unique())}")
    add("")

    # Nulos por columna (solo las que tienen)
    nulos = df.isna().sum()
    nulos = nulos[nulos > 0].sort_values(ascending=False)
    add("--- Columnas con valores nulos ---")
    if len(nulos) == 0:
        add("  (ninguna)")
    for col, n in nulos.items():
        add(f"  {col:<28}: {n:,} ({n/len(df)*100:.1f}%)")
    add("")

    # pct_asist fuera de rango [0,1]
    fuera = df[(df["pct_asist"] < 0) | (df["pct_asist"] > 1)]
    add(f"--- pct_asist fuera de rango [0,1]: {len(fuera)} filas ---")
    add("")

    # Duplicados: mismo alumno + mes en 2 establecimientos (cambio de colegio)
    dup = df[df.duplicated(subset=["rut_full", "mes_codigo"], keep=False)]
    dup = dup.sort_values(["rut_full", "mes_codigo"])
    add(f"--- Alumno repetido en el mismo mes (posible cambio de colegio): "
        f"{dup['rut_full'].nunique()} alumnos, {len(dup)} filas ---")
    if len(dup):
        dup[["rut_full", "mes_glosa", "rbd", "nombre_establecimiento", "pct_asist"]].to_csv(
            SALIDA / "01_duplicados_alumno_mes.csv", index=False, encoding="utf-8-sig")
        add("  -> detalle en salida/01_duplicados_alumno_mes.csv")
    add("")

    # Cobertura: cuantos meses tiene cada alumno
    cob = df.groupby("rut_full")["mes_codigo"].nunique().value_counts().sort_index()
    add("--- Cobertura: alumnos segun N de meses con registro ---")
    for n_meses, cuenta in cob.items():
        add(f"  {n_meses} mes(es): {cuenta:,} alumnos")
    add("  (menos de 6 meses suele indicar ingreso o retiro durante el ano)")
    add("")

    # Distribucion de la glosa de asistencia
    add("--- Distribucion por glosa de asistencia (filas mes-alumno) ---")
    for glosa, n in df["asistencia"].value_counts().items():
        add(f"  {glosa:<24}: {n:,} ({n/len(df)*100:.1f}%)")
    add("")
    add(f"pct_asist promedio global: {df['pct_asist'].mean()*100:.1f}%")
    add("")
    add("--- Segmentacion (decisiones del duenio) ---")
    seg = df.groupby("segmento").agg(
        filas=("pct_asist", "size"),
        alumnos=("rut_full", "nunique"),
        pct_prom=("pct_asist", "mean"))
    for s, r in seg.iterrows():
        add(f"  {s:<9}: {int(r['filas']):,} filas, {int(r['alumnos']):,} alumnos, "
            f"prom {r['pct_prom']*100:.1f}%")
    add("  escolar  = analisis principal | vtf = aparte | excluido = adultos/especial")

    texto = "\n".join(lineas)
    (SALIDA / "00_informe_calidad.txt").write_text(texto, encoding="utf-8")
    print(texto)
    return dup


# ---------------------------------------------------------------------------
# 2. TRAYECTORIA POR ALUMNO + TENDENCIA
# ---------------------------------------------------------------------------
def tendencia_pct(serie_por_mes: pd.Series) -> float:
    """Pendiente de regresion lineal simple de pct_asist vs mes.
    Negativa = la asistencia viene cayendo. Devuelve puntos % por mes."""
    s = serie_por_mes.dropna()
    if len(s) < 2:
        return np.nan
    x = s.index.values.astype(float)
    y = s.values.astype(float)
    # pendiente por minimos cuadrados (evita RankWarning de polyfit con pocos puntos)
    x = x - x.mean()
    denom = (x * x).sum()
    if denom == 0:
        return np.nan
    pend = (x * (y - y.mean())).sum() / denom
    return pend * 100.0  # a puntos porcentuales por mes


def construir_trayectoria(df: pd.DataFrame) -> pd.DataFrame:
    # Si un alumno aparece 2 veces en un mes, promediamos su pct de ese mes
    base = (df.groupby(["rut_full", "mes_codigo"], as_index=False)
              .agg(pct_asist=("pct_asist", "mean")))

    # Pivot: una columna por mes
    piv = base.pivot(index="rut_full", columns="mes_codigo", values="pct_asist")
    piv = piv.reindex(columns=MESES_ORDEN)
    piv.columns = [f"pct_{MES_GLOSA[m]}" for m in piv.columns]

    # Datos descriptivos del alumno (ultima aparicion)
    info = (df.sort_values("mes_codigo")
              .groupby("rut_full")
              .agg(nombres=("nombres", "last"),
                   a_paterno=("a_paterno", "last"),
                   a_materno=("a_materno", "last"),
                   sexo=("sexo", "last"),
                   nacionalidad=("nacionalidad_recodificada", "last"),
                   PIE=("PIE", "last"),
                   rbd=("rbd", "last"),
                   establecimiento=("nombre_establecimiento", "last"),
                   tipo_establecimiento=("tipo_establecimiento", "last"),
                   segmento=("segmento", "last"),
                   glosa_ensenanza=("glosa_ensenanza", "last"),
                   nivel=("nivel", "last"),
                   curso=("curso", "last")))

    # Metricas de trayectoria
    serie = base.set_index("mes_codigo").groupby(base["rut_full"])["pct_asist"]
    pend = serie.apply(tendencia_pct).rename("tendencia_pp_mes")

    prom = piv.mean(axis=1).rename("pct_promedio")
    n_meses = piv.notna().sum(axis=1).rename("n_meses")
    n_meses_insuf = (piv < UMBRAL_INSUFICIENTE).sum(axis=1).rename("meses_bajo_85")
    n_meses_grave = (piv < UMBRAL_GRAVE).sum(axis=1).rename("meses_bajo_70")

    out = (info.join(piv).join(prom).join(pend)
               .join(n_meses).join(n_meses_insuf).join(n_meses_grave)
               .reset_index())
    return out


# ---------------------------------------------------------------------------
# 3. INDICE DE RIESGO POR REGLAS (explicable)
# ---------------------------------------------------------------------------
def clasificar_riesgo(row) -> str:
    prom = row["pct_promedio"]
    tend = row["tendencia_pp_mes"]
    graves = row["meses_bajo_70"]
    n_meses = row["n_meses"]

    if pd.isna(prom) or n_meses == 0:
        return "Sin dato"

    # REVISAR - POSIBLE RETIRO: un solo mes de registro con 0% de asistencia.
    # No es inasistencia accionable, probablemente el alumno ya no esta vigente.
    # Se separa del semaforo para no inflar los rojos (decision del duenio).
    if n_meses == 1 and prom == 0.0:
        return "Revisar - posible retiro"

    # ROJO: situacion critica actual o persistente
    if prom < UMBRAL_GRAVE or graves >= 3:
        return "Rojo"
    # ROJO tambien si viene cayendo fuerte y ya esta bajo el umbral
    if prom < UMBRAL_INSUFICIENTE and (not pd.isna(tend) and tend <= -3):
        return "Rojo"
    # AMARILLO: bajo umbral, o cayendo de forma sostenida
    if prom < UMBRAL_INSUFICIENTE or (not pd.isna(tend) and tend <= -2):
        return "Amarillo"
    # VERDE: sano
    return "Verde"


def agregar_riesgo(tray: pd.DataFrame) -> pd.DataFrame:
    tray = tray.copy()
    tray["riesgo"] = tray.apply(clasificar_riesgo, axis=1)
    # Motivo legible (por que quedo en ese color)
    def motivo(r):
        ms = []
        if r["riesgo"] == "Sin dato":
            return "sin registros de asistencia"
        if r["riesgo"] == "Revisar - posible retiro":
            return "1 solo mes con 0% -> revisar vigencia de matricula"
        if r["pct_promedio"] < UMBRAL_GRAVE:
            ms.append(f"promedio {r['pct_promedio']*100:.0f}% (<70%)")
        elif r["pct_promedio"] < UMBRAL_INSUFICIENTE:
            ms.append(f"promedio {r['pct_promedio']*100:.0f}% (<85%)")
        if r["meses_bajo_70"] >= 3:
            ms.append(f"{int(r['meses_bajo_70'])} meses bajo 70%")
        if not pd.isna(r["tendencia_pp_mes"]) and r["tendencia_pp_mes"] <= -2:
            ms.append(f"cayendo {r['tendencia_pp_mes']:.1f} pp/mes")
        return "; ".join(ms) if ms else "asistencia sana"
    tray["motivo_riesgo"] = tray.apply(motivo, axis=1)
    return tray


# ---------------------------------------------------------------------------
# 4. AGREGADOS PARA DASHBOARD
# ---------------------------------------------------------------------------
def resumenes(df: pd.DataFrame, tray: pd.DataFrame):
    """df y tray ya vienen filtrados al segmento ESCOLAR."""
    # Ranking por establecimiento
    por_est = (df.groupby(["rbd", "nombre_establecimiento"])
                 .agg(filas=("pct_asist", "size"),
                      estudiantes=("rut_full", "nunique"),
                      pct_prom=("pct_asist", "mean"))
                 .reset_index()
                 .sort_values("pct_prom"))
    por_est["pct_prom"] = (por_est["pct_prom"] * 100).round(1)
    por_est.to_csv(SALIDA / "03_resumen_por_establecimiento.csv",
                   index=False, encoding="utf-8-sig")

    # Riesgo por establecimiento
    riesgo_est = (tray.groupby(["rbd", "establecimiento", "riesgo"])
                      .size().unstack(fill_value=0).reset_index())
    riesgo_est.to_csv(SALIDA / "04_riesgo_por_establecimiento.csv",
                      index=False, encoding="utf-8-sig")

    print("\n--- DISTRIBUCION DE RIESGO (segmento ESCOLAR, por alumno) ---")
    dist = tray["riesgo"].value_counts()
    for k in ["Rojo", "Amarillo", "Verde", "Revisar - posible retiro", "Sin dato"]:
        if k in dist:
            print(f"  {k:<26}: {dist[k]:,} alumnos ({dist[k]/len(tray)*100:.1f}%)")


def resumen_vtf(df_vtf: pd.DataFrame):
    """Jardines VTF: solo descriptivo, POR SEPARADO (parvularia no comparable)."""
    if df_vtf.empty:
        return
    r = (df_vtf.groupby(["rbd", "nombre_establecimiento"])
               .agg(estudiantes=("rut_full", "nunique"),
                    pct_prom=("pct_asist", "mean"))
               .reset_index().sort_values("pct_prom"))
    r["pct_prom"] = (r["pct_prom"] * 100).round(1)
    r.to_csv(SALIDA / "06_resumen_jardines_vtf.csv",
             index=False, encoding="utf-8-sig")
    print(f"\n--- JARDINES VTF (aparte): {df_vtf['rut_full'].nunique():,} ninos, "
          f"asistencia prom {df_vtf['pct_asist'].mean()*100:.1f}% ---")


def main():
    print("Leyendo:", ARCHIVO.name)
    df = cargar()
    perfilar(df)

    # Reparto por segmento
    df_escolar = df[df["segmento"] == "escolar"]
    df_vtf = df[df["segmento"] == "vtf"]
    df_excluido = df[df["segmento"] == "excluido"]
    print("\n--- SEGMENTACION (filas) ---")
    print(f"  escolar  : {len(df_escolar):,}  ({df_escolar['rut_full'].nunique():,} alumnos)")
    print(f"  vtf      : {len(df_vtf):,}  ({df_vtf['rut_full'].nunique():,} alumnos) -> aparte")
    print(f"  excluido : {len(df_excluido):,}  (adultos/especial) -> fuera del analisis")

    # Trayectoria + riesgo SOLO sobre el segmento escolar (el analisis comparable)
    tray = construir_trayectoria(df_escolar)
    tray = agregar_riesgo(tray)
    tray.to_csv(SALIDA / "02_trayectoria_por_alumno.csv",
                index=False, encoding="utf-8-sig")

    prioridad = tray[tray["riesgo"].isin(["Rojo", "Amarillo"])].sort_values(
        ["riesgo", "pct_promedio"])
    prioridad.to_csv(SALIDA / "05_lista_prioridad_riesgo.csv",
                     index=False, encoding="utf-8-sig")

    # Lista aparte de "posible retiro" para que el colegio revise vigencia de matricula
    retiros = tray[tray["riesgo"] == "Revisar - posible retiro"]
    retiros.to_csv(SALIDA / "07_revisar_posible_retiro.csv",
                   index=False, encoding="utf-8-sig")

    resumenes(df_escolar, tray)
    resumen_vtf(df_vtf)

    print("\nArchivos generados en:", SALIDA)
    for f in sorted(SALIDA.glob("*")):
        print("  -", f.name)


if __name__ == "__main__":
    main()
