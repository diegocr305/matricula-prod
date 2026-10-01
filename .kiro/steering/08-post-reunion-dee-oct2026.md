# Post-reunión Dirección Ejecutiva — Octubre 2026
## Notas, decisiones y backlog

Reunión exitosa con el Director Ejecutivo (Miguel Solís Olivera) y Jefe de Gabinete
(Nicolás Jerez Capdeville). Se presentó el RGM Digital y se recibieron las siguientes
instrucciones y observaciones.

---

## DECISIONES INMEDIATAS

### 1. Filtros / exclusiones de colegios
- **Sacar de los reportes y semáforo:** Escuela de Adultos, Adulto Especial, General
  Básica (adulto y especial).
- **Requiere validación con Inspector General** antes de aplicar.
- Afecta: semáforo de calidad del dato, dashboard, grilla de matrículas.
- → **Implementar filtro en backend** (parámetro `excluir_modalidad` o lista de RBDs
  excluidos). No eliminar los datos, solo no mostrarlos en vistas de análisis.

### 2. Perfiles de acceso nuevos
- **Directores:** responsables del proceso en su colegio. Acceso a su establecimiento
  (ya existe como rol `Colegio`).
- **Otro directivo del colegio** (subdir., inspector): puede apoyar el proceso.
  Ya existe la tabla `acceso_establecimiento` con multi-funcionario por colegio.
- **Profesores jefes:** acceso para **ayuda del proceso** (no para registrar matrículas).
  → Nuevo rol pendiente de diseñar: `Docente_Jefe` (solo lectura de su curso).
- **Por curso/aula:** perfiles a profesores por aula.
  → Requiere agregar `id_curso` a `acceso_establecimiento` (hoy solo tiene `id_establecimiento`).

---

## BACKLOG PRIORIZADO (orden sugerido)

### 🔴 URGENTE — Antes de la puesta en marcha

**A. Certificado de Matrícula / Alumno Regular** (instrucción UATP por correo)
Datos mínimos que debe tener (según mail de la UATP):
1. Nombre completo del estudiante, RUN y fecha de nacimiento.
2. Nombre del establecimiento y Reconocimiento Oficial del Mineduc.
3. Curso, nivel cursado y año académico.
4. Fecha de emisión y período al que corresponde la matrícula.
5. Código de verificación para autenticidad (ya existe en el sistema: `VLP-{id_mat}-{hash}`).
6. **Timbre del director y firma** → en la versión digital: logo del colegio + nombre del
   director y cargo.

Pendiente:
- Consultar con **Hugo Díaz o Sandra Barca (SEREMI)** el mínimo legal del certificado
  (circular número 1).
- Agregar **logo del Ministerio de Educación oficial** al certificado.
- Agregar **logo de la DEP** en el footer del certificado (y del sistema).
- Revisar que el certificado funcione en período **no lectivo** (fecha fuera del año escolar).

**B. Carta Gantt y plan de capacitación**
Estructura propuesta (pendiente de fechas):
1. Validación con directores (piloto: Liceo Bicentenario Marítimo).
2. Capacitación funcionarios piloto (directores + otro directivo).
3. Puesta en marcha piloto.
4. Monitoreo diario (todos los días durante el proceso).
5. Escalar a los demás colegios por fases.

**C. Interoperabilidad con SIGE**
- Elaborar **oficio al SEREMI de Educación** para la interoperabilidad con SIGE.
- Objetivo: que los datos del RGM Digital se sincronicen o alimenten a SIGE
  formalmente, no solo como carga manual.

### 🟡 MEDIANO PLAZO

**D. Filtros avanzados** (solicitud para el futuro)
- El director quiere filtros más avanzados en reportes/grillas.
- Pendiente definir cuáles: por tipo de enseñanza, por modalidad (excluir adultos/especial),
  por nivel, por estado de renovación, por completitud de datos.

**E. Mejora del semáforo / dashboard**
- Excluir modalidades de adultos y especial (ver punto 1 arriba).
- Filtro por tipo de enseñanza en el dashboard (básica, media, adultos, especial).

### 🟢 LARGO PLAZO

**F. Perfiles por curso/aula para profesores jefes**
- Diseñar rol `Docente_Jefe` con acceso solo a su curso.
- Agregar `id_curso` como columna en `acceso_establecimiento`.
- Uso: el profesor jefe puede ver/ayudar el proceso de renovación de su curso.

---

## CONTEXTO ADICIONAL (personas clave)

- **Hugo Díaz** o **Sandra Barca (SEREMI):** consultar circular N°1 sobre mínimo legal
  del certificado de matrícula.
- **Inspector General:** validar exclusión de colegios de adultos/especial.
- **Directores de liceos grandes (ej. de media):** involucrar en la validación del proceso.
- **UATP** (Unidad de Análisis Técnico Pedagógico): enviaron requisitos del certificado
  por correo (ver arriba, sección A).

---

## PENDIENTES TÉCNICOS CONCRETOS (en orden)

1. **Agregar logo Ministerio de Educación oficial** al PDF del certificado.
2. **Agregar logo DEP** en footer del sistema web.
3. **Actualizar certificado PDF** con los datos mínimos según mail UATP.
4. **Filtro para excluir modalidades adultos/especial** del semáforo y dashboard.
5. **Carta Gantt** (documento, no código).
6. **Oficio SEREMI** para interoperabilidad SIGE (documento, no código).
7. **Rol `Docente_Jefe`** con acceso por curso (diseño + implementación).
