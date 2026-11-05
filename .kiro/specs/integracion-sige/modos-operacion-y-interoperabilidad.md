# Anexo — Modos de operación RGM ↔ SIGE e interoperabilidad por Web Services

> Complementa `design.md`, `requirements.md` y el steering 16. Precisa **tres modos** de
> operación según exista o no el convenio de interoperabilidad con Mineduc, y documenta el
> contrato de los Web Services del convenio (FUTURO). No cambia lo ya escrito; lo organiza.

## Contexto: tres fuentes, una meta

Hoy conviven tres registros de la misma matrícula:

| Fuente | La llena | La ve | Estado actual |
|---|---|---|---|
| **Excel formulario** | El colegio | SLEP | A eliminar: se reemplaza por el RGM |
| **SIGE** | El colegio (manual) | Mineduc | Fuente oficial/legal. **Sin interoperabilidad hoy** |
| **RGM** | El colegio (meta) | SLEP | Fuente de gestión; destino único de carga |

**Meta:** el colegio deja de llenar el Excel y carga directo en el RGM. Mientras SIGE no sea
interoperable, hay que **verificar que RGM y SIGE cuadren** porque SIGE sigue siendo el registro
que mira el Ministerio (subvención, oficialidad). El RGM nunca "corrige" SIGE automáticamente sin
convenio; genera el informe para que el colegio lo refleje en SIGE.

## Los tres modos de operación

| Modo | Mecanismo | Dirección | ¿Disponible hoy? | Dónde vive |
|---|---|---|---|---|
| **1 — Carga por archivo** | Export manual SIGE → RGM (staging → conciliación → aprobación → aplicación) | SIGE → RGM | ✅ Sí | `design.md` + steering 16 (fases 1-3) |
| **2 — Espejo de control por archivo** | Comparar export SIGE ↔ RGM; informe de descuadres. RGM NO escribe en SIGE | RGM ↔ SIGE (solo lectura) | ✅ Sí | este anexo §1 |
| **3 — Interoperabilidad por Web Services** | Semilla + validar alumno + ingresar asistencia/curso/enseñanza | RGM ↔ SIGE (lectura y escritura) | ❌ No (requiere convenio) | este anexo §2 |

El Modo 2 es el **sustituto manual** de la validación bidireccional del Modo 3, para el período
sin convenio. El script `backend/produccion/08_informe_discrepancias_2026.py` es el embrión del
Modo 2 (hoy compara Excel↔SIGE; la evolución es RGM↔SIGE).

---

## 1. Modo 2 — Espejo de control por archivo (disponible hoy)

Objetivo: dado un **export de SIGE** (archivo) y la **matrícula del RGM** de un RBD/año, producir
un informe de descuadres accionable. **No** escribe en SIGE ni (en este modo) en el RGM.

### Cruce
Por **cuerpo del RUT** (sin DV), igual que los scripts 07/08, porque el DV y los identificadores
de extranjeros (IPE vs RUN) no son confiables entre fuentes.

### Clasificaciones del espejo (RGM ↔ SIGE)
| Clasificación | Significado | Acción esperada |
|---|---|---|
| `CUADRADO` | En ambos, mismo curso y estado | Nada |
| `SOLO_EN_RGM` | En RGM, falta en SIGE | El colegio debe cargarlo en SIGE |
| `SOLO_EN_SIGE` | En SIGE, falta en RGM | Falta ingresarlo al RGM (o revisar) |
| `DIFERENCIA_CURSO` | En ambos, curso/grado distinto | Revisar cuál es correcto; corregir en la fuente equivocada |
| `DIFERENCIA_ESTADO` | Uno activo, el otro retirado | Revisar retiro/traslado |
| `IDENTIDAD_INCIERTA` | RUN mapea a más de un alumno o datos inconsistentes | Revisión manual |

> Nota de alineación con el spec: estas clasificaciones son **de control bidireccional** y
> conviven con las de carga SIGE→RGM del `design.md` (`NUEVO/COINCIDENTE/CAMBIO_CURSO/RETIRO/
> CONFLICTO/REVISAR`). Si se implementa el espejo sobre las mismas tablas `sige_*`, ampliar el
> CHECK de `sige_conciliacion.clasificacion` con estos valores y un campo `modo`
> (`CARGA` | `ESPEJO`).

### Salida
Informe (Excel/pantalla) por RBD con el conteo por clasificación y el detalle. Para la transición
puede ser **tripartito** (Excel formulario / SIGE / RGM) mientras el Excel siga existiendo, y
pasar a **bipartito** (SIGE / RGM) cuando el Excel se elimine.

### Regla de autoridad (decisión del dueño, confirmada)
- Para **gestión**, manda el RGM (es lo más fresco que cargó el colegio).
- Para **efectos legales/subvención**, el colegio debe reflejarlo en SIGE.
- El RGM **no corrige SIGE automáticamente** en este modo: solo informa qué falta cargar allá.

---

## 2. Modo 3 — Interoperabilidad por Web Services (FUTURO, requiere convenio)

> **Fuera del MVP.** Solo con convenio firmado, documentación oficial, credenciales
> institucionales y ambiente de pruebas de Mineduc. **No versionar secretos ni credenciales.**
> El objetivo del convenio es eliminar el doble ingreso: el usuario trabaja solo en el RGM y el
> sistema sincroniza/valida con SIGE en segundo plano.

Modelo **bidireccional** vía Servicios Web:

### 2a. RGM → SIGE (carga / escritura en el Ministerio)
- **Ingreso de Asistencia SIGE**: transmite la asistencia diaria consolidada a nivel de
  curso/grado para el cálculo de subvenciones.
- **Ingreso de Curso SIGE**: registra en SIGE los cursos y secciones creados en el RGM para el
  año escolar.
- **Ingreso de Tipos de Enseñanza SIGE**: crea en SIGE las modalidades/tipos de enseñanza
  configurados en el RGM.

### 2b. SIGE → RGM (consulta / validación)
- **Obtención de Semilla**: el RGM solicita a SIGE el token/parámetro de seguridad (semilla) para
  autenticar la sesión antes de invocar cualquier otro servicio.
- **Validación de Alumno SIGE**: el RGM envía el identificador (RUN/IPE) y SIGE confirma si los
  datos personales básicos coinciden con la base oficial, durante la matrícula.
- **Validación de Asistencia**: el RGM consulta el estado de procesamiento del lote de asistencia
  previamente enviado.

### Flujo de autenticación típico
```
1. RGM -> SIGE : Obtención de Semilla  => token/semilla
2. RGM firma/usa la semilla para autenticar
3. RGM -> SIGE : servicio objetivo (validar alumno / ingresar asistencia / curso / enseñanza)
4. RGM <- SIGE : respuesta (confirmación / estado de lote)
```

### Encaje con el módulo
- Es el `SigeOfficialConnector` ya previsto (Fase 6 del steering 16): **reemplaza el archivo del
  Modo 1 por servicios**, usando la MISMA canalización de conciliación. No se reescribe el dominio
  ni el motor de diferencias.
- La **Validación de Alumno** fortalece el paso de validación del Modo 1/2 (hoy se valida RUN+DV
  localmente; con convenio se valida contra la base oficial).
- La **Ingreso de Asistencia/Curso/Enseñanza** es lo que hoy NO se puede hacer: cuando exista,
  el RGM pasa de "espejo que informa" (Modo 2) a "fuente que escribe en SIGE" (Modo 3).

### Pendientes antes de implementar el Modo 3
- Convenio firmado + credenciales institucionales (secretos en `.env`, nunca en git).
- Documentación oficial de los WSDL/endpoints, formato de la semilla y del firmado.
- Confirmar con Mineduc el alcance por RBD, la frecuencia permitida y si la asistencia es diaria.
- Ambiente de pruebas para comparar equivalencia archivo (Modo 1/2) ↔ API (Modo 3) sin regresiones.

---

## 3. Resumen de la transición
1. **Hoy:** colegio llena Excel + SIGE (doble/triple digitación). RGM carga por archivo (Modo 1)
   y permite el espejo de control (Modo 2) para detectar descuadres.
2. **Transición:** colegio deja el Excel y carga solo en el RGM. El Modo 2 verifica contra el
   export de SIGE; el colegio corrige manualmente en SIGE lo que el informe marque.
3. **Con convenio:** Modo 3 elimina el doble ingreso — el RGM valida y transmite a SIGE por Web
   Services automáticamente. El Modo 2 (espejo por archivo) queda como respaldo/contingencia.
