# Anexo — Mapeo RGM ↔ CEDS/NDS y funciones de verificación

> Referencia de calidad de datos para el futuro libro de clases digital. **No** es el esquema a
> implementar ahora: el MVP usa las tablas `matriculas.*` del RGM + staging `sige_*`. Este anexo
> traza cómo se corresponde el RGM con el estándar y qué funciones de verificación aplican, para
> preparar interoperabilidad futura.

## Fuentes (en `csv pruebas/libro-digital/`)
- `Descripción de Funciones de Verificación - Hoja 1.csv` — 99 funciones de verificación
  (secciones: integridad 43, matrícula 13, asistencia/subvenciones 15, salidas 2, etc.).
- `Funciones de Verificación - Diccionario de datos - Diccionario.csv` — matriz que cruza
  tabla/columna CEDS con cada función (qué datos necesita cada control).
- `NDS-Reference-v7_1.xlsx - NDS Tables.csv` — 916 tablas del modelo NDS/CEDS v7.1 con descripción.
- `reference - tables.csv` — catálogos `Ref*` (códigos y definiciones; ej. categorías de ausencia).
- `CEDS-V7_1-with-Extend (2).xlsx` — modelo CEDS v7.1 extendido (referencia general).
- `LibroDeClasesDigital_v02.svg` (T-SQL reconstruido) — subconjunto del modelo dibujado.

> El SVG/T-SQL es una **reconstrucción parcial** del diagrama; el modelo documentado completo
> (NDS v7.1) incluye tablas que no están en el dibujo (`Assessment`, `Document`, `PersonHealth`,
> `PersonAllergy`, etc.). Las fechas de los archivos son 2019–2022: sirven de referencia, no
> confirman los criterios vigentes para autorizar un libro digital hoy.

## 1. Mapeo de entidades (RGM → CEDS/NDS)

| Entidad RGM (`matriculas`) | Entidad CEDS/NDS | Comentario |
|---|---|---|
| `estudiante` | `Person` (+ `PersonIdentifier`, `PersonBirthplace`, `PersonAddress`) | El estudiante es una `Person` con rol de alumno vía `OrganizationPersonRole` |
| `apoderado` | `Person` + `PersonRelationship` | El apoderado es otra `Person`; el vínculo es `PersonRelationship` (custodia, contacto, prioridad) |
| `establecimiento` | `Organization` + `K12School` (+ `OrganizationIdentifier`) | RBD ≈ `OrganizationIdentifier` |
| `matricula` | `OrganizationPersonRole` + `K12StudentEnrollment` | La matrícula es el rol persona-organización con detalle de enrollment |
| `catalogo_grado` | `RefGradeLevel` | Catálogo de grado |
| `catalogo_tipo_ensenanza` | (nivel/modalidad) | Sin equivalente 1:1; mapear por tabla de referencia local |
| `ficha_salud` | `PersonHealth`, `PersonAllergy` | No está en el SVG, sí en el modelo documentado |
| `auditoria_matricula` | (trazabilidad) | CEDS no define auditoría; es control interno |

## 2. Mapeo de campos — estudiante → Person

| RGM `estudiante` | CEDS/NDS | Nota |
|---|---|---|
| `run_ipe` | `PersonIdentifier.Identifier` (+ `RefPersonIdentificationSystemId`) | RUN/IPE como identificador tipado |
| `nombres` | `Person.FirstName` / `MiddleName` | |
| `apellido_paterno`, `apellido_materno` | `Person.LastName` (+ generación) | CEDS no separa paterno/materno |
| `fecha_nacimiento` | `Person.Birthdate` | NOT NULL en RGM; bloqueante para altas |
| `sexo` | `Person.RefSexId` | catálogo `Ref` |
| `calle/numero/sector/comuna`, `domicilio`, `latitud/longitud` | `PersonAddress.*` (`StreetNumberAndName`, `City`, `Latitude`, `Longitude`) | georreferencia |
| `pais_origen`, `documento_extranjero` | `PersonBirthplace.RefCountryId`, verificación IPE | relevante para migrantes (fn28A/fn28B) |

## 3. Mapeo de campos — matricula → K12StudentEnrollment

| RGM `matricula` | CEDS/NDS | Nota |
|---|---|---|
| (vínculo estudiante-establecimiento) | `OrganizationPersonRole` (`EntryDate`, `ExitDate`) | |
| `fecha_matricula` | `OrganizationPersonRole.EntryDate` | |
| `fecha_retiro` | `OrganizationPersonRole.ExitDate` + `K12StudentEnrollment.RefExitOrWithdrawalTypeId` | |
| `cod_grado` | `K12StudentEnrollment.RefEntryGradeLevelId` | |
| `estado` / `estado_renovacion` | `K12StudentEnrollment.RefEnrollmentStatusId` / `RefEndOfTermStatusId` | mapear estados RGM → `RefEnrollmentStatus` |
| `motivo_retiro` | `RefExitOrWithdrawalStatusId` + documento | fn2CA/fn2CB |
| `es_excedente`, `es_alumno_practica` | banderas específicas (resoluciones) | fn2BA (excedente), fn29* (práctica) |

## 4. Funciones de verificación aplicables al MVP (matrícula y salidas)

| Función | Sección | Condición que verifica | Dónde la cubre el módulo |
|---|---|---|---|
| **fn2FA** | 5.1 Estructura | matriculados − bajas = inscritos en libros | Reporte: `cuadre_fn2FA` por RBD/curso |
| **fn2EA** | 5.2 Contenido mínimo | los alumnos tienen todos sus datos obligatorios | Validación de obligatorios (Req. 3) |
| **fn2DA** | 5.3 Altas | alumnos nuevos con matrícula definitiva poseen documento | Marcar `REVISAR` si falta documento |
| **fn2DB** | 5.3 Altas | matrícula bajo decreto 152 art. 60 tiene documento escaneado | Observación de calidad |
| **fn2CA** | 5.4 Bajas | existe fecha, motivo y declaración jurada / verificador de identidad | Clasif. `RETIRO` + observación |
| **fn2CB** | 5.4 Bajas | retirados definitivos tienen documento e incidente de entrega | Observación de calidad |
| **fn0FA** | 7.0 Salidas | cada estudiante tiene ≥1 persona autorizada para retirarlo | `PersonRelationship` (futuro) |
| **fn0FB** | 7.0 Salidas | retiro con documento escaneado o verificador de identidad | Observación de calidad |
| fn28A/fn28B | 5.8 Migrantes | IPE + documento de convalidación | Validación específica migrantes |
| fn2AA/fn2BA | 5.6/5.5 | resolución de intercambio/excedente cargada | `es_excedente` + documento |
| fn29A-C | 5.7 Práctica | condiciones de estudiantes en práctica | `es_alumno_practica` |

> Las funciones generan **observaciones de calidad** (`motivos_validacion`), no bloquean la
> trazabilidad en staging. El cumplimiento documental completo corresponde al futuro libro digital.

## 5. Funciones de asistencia (etapa 2, referencia)
Las 15 funciones de la sección "6.2 Contenido mínimo / control mensual de asistencia o
subvenciones" (fn6*) aplican cuando se implemente asistencia. Puntos ya anticipados por el diseño:
- fn6D1: "no se declara asistencia de un estudiante dado de baja" → el modelo debe impedir
  asistencia de alumnos retirados.
- fn6B0: "todas las correcciones… con fecha, hora, motivo, identidad y visación" → versionado de
  rectificaciones.
- Separar `NO_TRABAJADO`/`NO_MATRICULADO`/`SIN_REGISTRO` de `AUSENTE` (ya en Req. 10 y maestro).
- Catálogo `RefAbsentAttendanceCategory` / `RefPresentAttendanceCategory` (de `reference - tables.csv`)
  para tipificar ausencias/presencias si se adopta el estándar.

## 6. Brechas conocidas RGM vs estándar
- RGM separa apellido paterno/materno; CEDS usa `LastName` único → mapeo configurable.
- RGM no modela `PersonRelationship` formal (apoderado está como FK en `estudiante`) → para
  fn0FA ("persona autorizada para retirar") haría falta una relación tipada en el futuro.
- RGM no tiene gestión documental tipo `Document`/incidente de entrega (fn2CB/fn0FB) → futuro.
- Catálogos locales (`catalogo_grado`, `catalogo_tipo_ensenanza`) están sucios (steering 11) → no
  reescribir en la conciliación; mapear aparte y revisado.
