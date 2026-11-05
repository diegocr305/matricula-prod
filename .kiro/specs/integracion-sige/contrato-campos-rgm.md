# Contrato de campos canónicos RGM ↔ Formulario ↔ SIGE

> Define los **campos que el RGM realmente captura** de la ficha del alumno y cómo se
> corresponden con las columnas del **formulario Excel del colegio** y de la **exportación
> SIGE**. Es la base para un mapeo tolerante: los colegios a veces agregan, quitan o renombran
> columnas del formulario, así que el parseo NO debe depender de posiciones fijas sino de
> **coincidencia por nombre de encabezado**. SIGE es estable (formato Mineduc).

## Por qué este contrato

El RGM NO guarda todas las columnas del formulario (el formulario tiene ~59-60 columnas; el
RGM captura un subconjunto). Lo que importa consolidar es lo que el RGM realmente persiste.
Todo lo demás del formulario (beca, tutorías, nombre social, pueblo originario, tramo RSH, nivel
educacional del apoderado, etc.) hoy NO entra al RGM y se ignora en la consolidación (puede
sumarse al RGM en el futuro si se decide).

Observación de campo (nov 2026, 3 RBD: 1520, 1502, 14678):
- **SIGE** (`.xls`-HTML): 24 columnas, IDÉNTICAS en los 3 RBD. Formato estable del Ministerio.
- **Formulario** (`.xlsx`, hoja "Nomina de estudiantes", fila 2 = encabezados): ~59-60 columnas,
  casi idénticas (plantilla oficial SLEP). El 1520 traía una columna vacía extra al final (ruido).
  Aun así, el dueño advierte que algunos colegios modifican columnas -> mapear por nombre.

## Tabla de mapeo (campo canónico → RGM → Formulario → SIGE)

Leyenda RGM: tabla.columna. "Obl" = obligatorio para crear en el RGM.

| Campo canónico | RGM (tabla.columna) | Obl | Encabezado Formulario (contiene…) | SIGE (encabezado) |
|---|---|---|---|---|
| run_cuerpo (clave de cruce) | estudiante.run_ipe (cuerpo) | sí | "RUT estudiante" | "Run" |
| run_dv | (parte de run_ipe) | — | "Dígito Verificador estudiante" | "Dígito Ver." |
| nombres | estudiante.nombres | sí | "Nombres" | "Nombres" |
| apellido_paterno | estudiante.apellido_paterno | sí | "Apellido paterno" | "Apellido Paterno" |
| apellido_materno | estudiante.apellido_materno | no | "Apellido materno" | "Apellido Materno" |
| sexo | estudiante.sexo | sí | "Sexo" | "Genero" |
| fecha_nacimiento | estudiante.fecha_nacimiento | **sí (NOT NULL)** | "Fecha Nacimiento" | "Fecha Nacimiento" |
| nacionalidad / pais_origen | estudiante.pais_origen | no | "Nacionalidad" | — (Código Etnia no sirve) |
| calle | estudiante.calle | no | "Calle" | (parte de "Dirección") |
| numero | estudiante.numero | no | "Numeración" | (parte de "Dirección") |
| sector | estudiante.sector | no | "Cerro, barrio, sector, localidad" | — |
| comuna | estudiante.comuna | no | "Comuna" | "Comuna Residencia" |
| domicilio (compuesto) | estudiante.domicilio | no | (calle+num+sector+comuna) | "Dirección" |
| correo_estudiante | (no se guarda hoy) | no | "Correo electrónico estudiante" | "Email" |
| telefono_estudiante | (no se guarda hoy) | no | "Teléfono estudiante" | "Telefono"/"Celular" |
| **MATRÍCULA** | | | | |
| cod_tipo_ensenanza | matricula.cod_tipo_ensenanza | no | "Tipo de Enseñanza" (código al inicio) | "Cod Tipo Enseñanza" |
| cod_grado | matricula.cod_grado | no | (derivado de "Curso") | "Cod Grado" |
| curso (texto) | matricula.curso | sí | "Curso" | "Desc Grado" + "Letra Curso" |
| letra_curso | matricula.letra_curso | no | (última letra de "Curso") | "Letra Curso" |
| nivel_ensenanza | matricula.nivel_ensenanza | sí | (derivado) | (derivado de Desc Grado) |
| numero_correlativo | matricula.numero_correlativo | sí (auto) | "Nº Matrícula" | (no viene; se asigna) |
| fecha_matricula | matricula.fecha_matricula | sí | "Fecha de Matrícula" | "Fecha Incorporación Curso" |
| estado | matricula.estado | sí | (derivado de "¿Se retira…?") | (derivado de "Fecha Retiro") |
| fecha_retiro | matricula.fecha_retiro | no | "Fecha de retiro" | "Fecha Retiro" (1900-01-01 = sin retiro) |
| motivo_retiro | matricula.motivo_retiro | no | "Motivo de retiro" | — |
| observaciones | matricula.observaciones | no | "Observaciones motivo de retiro" / libre | — |
| **APODERADO TITULAR** | | | | |
| apod_tit_nombre | apoderado.nombres/apellidos | no | "Nombre completo del Apoderado Titular" | — |
| apod_tit_rut | apoderado.rut_pasaporte | no | "RUT Apoderado Titular" + "Dígito Verificador Apoderado Titular" | — |
| apod_tit_telefono | apoderado.telefono | no | "Teléfono Apoderado Titular" | — |
| apod_tit_correo | apoderado.correo_electronico | no | "Correo Electrónico Apoderado Titular" | — |
| **APODERADO SUPLENTE** | (análogo, campos "… Suplente") | no | "… Apoderado Suplente" | — |
| **FICHA DE SALUD** | | | | |
| sistema_salud | ficha_salud.sistema_salud | no | "¿Qué tipo de previsión de salud tiene?" | — |
| letra_fonasa | ficha_salud.letra_fonasa | no | "…FONASA, indique la letra" | — |
| cesfam | ficha_salud.cesfam | no | "Indique el CESFAM…" | — |
| centro_emergencia | ficha_salud.centro_emergencia | no | "Centro de salud para atención de emergencia" | — |
| alergias | ficha_salud.alergias | no | "alergias alimentarias" | — |
| diagnostico_medico | ficha_salud.diagnostico_medico | no | "¿Tiene algún diagnóstico médico certificado?" | — |
| medico_tratante | ficha_salud.medico_tratante | no | "nombre del/la médico tratante" | — |
| medicamento | ficha_salud.medicamento | no | "tome regularmente algún medicamento" | — |
| nee | ficha_salud.nee | no | "¿Tiene necesidades educativas especiales?" | — |
| nee_tipo | ficha_salud.nee_tipo | no | "necesidades educativas especiales, ¿cuál/tipo?" | — |

## Reglas de mapeo tolerante (para colegios que mueven columnas)

1. **Nunca por posición fija.** Resolver cada campo buscando su encabezado por **substring
   normalizado** (minúsculas, sin acentos, sin signos) contra una lista de alias por campo.
   Ej. el campo `calle` matchea un encabezado que contenga "calle"; `comuna` el que contenga
   "comuna" pero NO "código comuna".
2. **SIGE por posición es aceptable** (formato estable), pero igual conviene resolver por nombre
   para robustez futura.
3. **Clave de cruce = cuerpo del RUT** (sin DV): el formulario trae RUT como número (float de
   Excel, ej. `24301212.0` → quitar `.0` ANTES de limpiar separadores), SIGE como texto. Los
   extranjeros traen IPE/RUN distinto entre fuentes → cruzar por cuerpo evita falsos duplicados.
4. **fecha_nacimiento es el bloqueante**: si un alumno es NUEVO y no trae fecha de nacimiento,
   no se puede crear en `estudiante` (NOT NULL) → clasificar REVISAR, no fallar.
5. **No reescribir catálogos sucios** (`catalogo_grado`): mapear grado/curso con cuidado; el
   texto de SIGE ("7° básico") y del formulario ("7° Básico A") se normaliza con
   `normalizar_texto_curso` (ver fix de cursos).
6. **Retiro**: en SIGE `Fecha Retiro` = `1900-01-01`/vacío significa SIN retiro. En el formulario
   el retiro es la columna "¿Se retira…?" = "Sí". Regla del dueño: retiro real = SIGE (oficial);
   validar contra Excel y con el colegio los que solo aparecen en una fuente.

## Alias por campo (para el resolvedor por nombre) — formulario
Lista inicial (substring, normalizado). Ampliable cuando aparezca un colegio con otro texto:
- run_cuerpo: ["rut estudiante"]
- run_dv: ["digito verificador estudiante", "dv estudiante"]
- nombres: ["nombres"] (excluir "nombre social", "nombre completo")
- apellido_paterno: ["apellido paterno"]
- apellido_materno: ["apellido materno"]
- sexo: ["sexo"]
- fecha_nacimiento: ["fecha nacimiento", "fecha de nacimiento"]
- nacionalidad: ["nacionalidad"]
- calle: ["calle"]
- numero: ["numeracion", "numero"]
- sector: ["cerro", "sector", "localidad", "barrio"]
- comuna: ["comuna"] (excluir "codigo comuna")
- tipo_ensenanza: ["tipo de ensenanza", "tipo ensenanza"]
- curso: ["curso"] (excluir "repite", "cursar")
- fecha_matricula: ["fecha de matricula", "fecha matricula"]
- se_retira: ["se retira"]
- fecha_retiro: ["fecha de retiro", "fecha retiro"]
- motivo_retiro: ["motivo de retiro"] (excluir "observaciones motivo")
- apod_tit_nombre: ["nombre completo del apoderado titular"]
- apod_tit_rut: ["rut apoderado titular"]
- apod_tit_dv: ["digito verificador apoderado titular"]
- apod_tit_tel: ["telefono apoderado titular"]
- apod_tit_correo: ["correo electronico apoderado titular"]
- (suplente: idem con "suplente")
- prevision: ["tipo de prevision", "prevision de salud"]
- letra_fonasa: ["fonasa, indique la letra", "letra fonasa"]
- cesfam: ["cesfam"]
- centro_emergencia: ["centro de salud para atencion de emergencia", "centro de emergencia"]
- alergias: ["alergias"]
- diagnostico: ["diagnostico medico"]
- medico_tratante: ["medico tratante"]
- medicamento: ["medicamento"]
- nee: ["necesidades educativas especiales"] (el primero; los "si tiene…" son nee_tipo)
- nee_tipo: ["necesidades educativas especiales" + "cual"/"tipo"/"establecimiento"]

## Alias por campo — SIGE (encabezados fijos)
run="Run", dv="Dígito Ver.", nombres="Nombres", ap_pat="Apellido Paterno",
ap_mat="Apellido Materno", sexo="Genero", fecha_nac="Fecha Nacimiento",
cod_tipo="Cod Tipo Enseñanza", cod_grado="Cod Grado", desc_grado="Desc Grado",
letra="Letra Curso", direccion="Dirección", comuna="Comuna Residencia",
fecha_incorp="Fecha Incorporación Curso", fecha_retiro="Fecha Retiro", rbd="RBD", anio="Año".
