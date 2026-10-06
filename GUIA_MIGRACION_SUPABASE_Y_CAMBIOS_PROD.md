# Guía de Migración Supabase y Resumen de Cambios Integrados

Este documento detalla exhaustivamente todos los cambios introducidos en la rama **`feature/integracion-prod-mejoras`** sobre la base del repositorio de producción de Diego (`prod/main`), así como el script SQL consolidado e instrucciones necesarias para aplicar las migraciones en **Supabase**.

---

## 1. Resumen de la Integración

### Estado de las Ramas
* **Rama base:** `prod/main` (commit `86f8730` - incluye integración de firma digital con SIMPLE, Clave Única, Edge Function `sync-matricula`, tabla `firma_matricula` y QR en frontend).
* **Rama de trabajo:** `feature/integracion-prod-mejoras` (commit `4b561bc`).
* **Regla estricta aplicada:** **Cero regresión**. Nada de lo implementado por Diego fue eliminado ni modificado negativamente. Todas las nuevas funciones de trazabilidad, jerarquía escolar, confidencialidad y optimización conviven de forma modular y compatible con el flujo de firma digital.

---

## 2. Script SQL de Migración para Supabase

En producción, Supabase utiliza el esquema `matriculas` (fijado mediante la variable de entorno `DB_SCHEMA=matriculas`).

Ejecuta el siguiente script en el **SQL Editor de Supabase**:

```sql
-- =============================================================================
-- MIGRACIÓN CONSOLIDADA: TRAZABILIDAD, CONFIDENCIALIDAD Y ADJUNTOS
-- Esquema objetivo: matriculas
-- =============================================================================

SET search_path TO matriculas, public;

-- -----------------------------------------------------------------------------
-- 1. TABLA: encuesta_retiro
-- Almacena las justificaciones privadas y socioemocionales de retiro/traslado,
-- manteniéndolas desacopladas y confidenciales de las observaciones públicas.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matriculas.encuesta_retiro (
    id_encuesta SERIAL PRIMARY KEY,
    id_matricula INT NOT NULL REFERENCES matriculas.matricula(id_matricula) ON DELETE CASCADE,
    id_estudiante INT REFERENCES matriculas.estudiante(id_estudiante),
    id_establecimiento INT REFERENCES matriculas.establecimiento(id_establecimiento),
    fecha_respuesta TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    respuestas_confidenciales TEXT
);

CREATE INDEX IF NOT EXISTS idx_encuesta_retiro_matricula 
    ON matriculas.encuesta_retiro(id_matricula);

CREATE INDEX IF NOT EXISTS idx_encuesta_retiro_estudiante 
    ON matriculas.encuesta_retiro(id_estudiante);

-- -----------------------------------------------------------------------------
-- 2. COLUMNAS ADICIONALES EN TABLA: matricula
-- Soporte para trazabilidad de traslados, motivos de retiro/cambio de curso y adjuntos.
-- -----------------------------------------------------------------------------
ALTER TABLE matriculas.matricula 
    ADD COLUMN IF NOT EXISTS ruta_documento_traslado VARCHAR(500) NULL,
    ADD COLUMN IF NOT EXISTS motivo_cambio_curso TEXT NULL,
    ADD COLUMN IF NOT EXISTS motivo_retiro TEXT NULL,
    ADD COLUMN IF NOT EXISTS fecha_retiro DATE NULL,
    ADD COLUMN IF NOT EXISTS observaciones TEXT NULL,
    ADD COLUMN IF NOT EXISTS es_excedente BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS numero_resolucion_excedente VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS fecha_resolucion_excedente DATE NULL,
    ADD COLUMN IF NOT EXISTS ruta_documento_resolucion VARCHAR(500) NULL;

-- -----------------------------------------------------------------------------
-- 3. COLUMNAS ADICIONALES EN TABLA: estudiante
-- Fecha de actualización de ficha y campos de georreferenciación.
-- -----------------------------------------------------------------------------
ALTER TABLE matriculas.estudiante 
    ADD COLUMN IF NOT EXISTS fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS calle VARCHAR(200) NULL,
    ADD COLUMN IF NOT EXISTS numero VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS sector VARCHAR(150) NULL,
    ADD COLUMN IF NOT EXISTS comuna VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS geo_precision VARCHAR(50) NULL;

-- -----------------------------------------------------------------------------
-- 4. COLUMNAS ADICIONALES EN TABLA: apoderado
-- Acreditación judicial para apoderados que no son progenitores directos.
-- -----------------------------------------------------------------------------
ALTER TABLE matriculas.apoderado 
    ADD COLUMN IF NOT EXISTS ruta_documento_tutor VARCHAR(500) NULL;

-- -----------------------------------------------------------------------------
-- 5. TABLA: ficha_salud (asegurar su existencia)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matriculas.ficha_salud (
    id_ficha SERIAL PRIMARY KEY,
    id_estudiante INT UNIQUE NOT NULL REFERENCES matriculas.estudiante(id_estudiante) ON DELETE CASCADE,
    sistema_salud VARCHAR(100),
    letra_fonasa VARCHAR(10),
    cesfam VARCHAR(200),
    centro_emergencia VARCHAR(200),
    alergias TEXT,
    diagnostico_medico TEXT,
    medico_tratante VARCHAR(200),
    medicamento TEXT,
    nee BOOLEAN DEFAULT FALSE,
    nee_tipo VARCHAR(200),
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ficha_salud_estudiante 
    ON matriculas.ficha_salud(id_estudiante);

-- -----------------------------------------------------------------------------
-- 6. ÍNDICES DE RENDIMIENTO Y OPTIMIZACIÓN
-- Aceleran filtros en Inbox, grillas operativas y joins frecuentes.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_matricula_est_anio_curso 
    ON matriculas.matricula (id_establecimiento, anio_escolar, curso);

CREATE INDEX IF NOT EXISTS idx_matricula_estado 
    ON matriculas.matricula (estado);

CREATE INDEX IF NOT EXISTS idx_matricula_estudiante 
    ON matriculas.matricula (id_estudiante);

CREATE INDEX IF NOT EXISTS idx_estudiante_apoderado 
    ON matriculas.estudiante (id_apoderado_principal);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha 
    ON matriculas.auditoria_matricula (fecha_accion DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_matricula 
    ON matriculas.auditoria_matricula (id_matricula);
```

---

## 3. Configuración de Storage en Supabase

Si utilizas **Supabase Storage** como proveedor S3:

1. **Bucket:** Crear el bucket `matriculas-documentos` (si no existe) o el nombre definido en `S3_BUCKET_NAME`.
2. **Carpetas internas gestionadas:**
   * `resoluciones/`: Archivos PDF/imagen de sobrecupos/excedentes.
   * `tutores/`: Decretos o resoluciones judiciales de acreditación de tutores legales.
   * `traslados/`: Certificados de retiro o traslado del establecimiento de origen.
3. **Políticas RLS de Storage (Supabase):**
   * Lectura/Escritura mediante service role o mediante las credenciales S3 configuradas en el backend (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT_URL`).
   * Tamaño máximo por archivo permitido: **5 MB**.

---

## 4. Desglose Detallado de Implementaciones en el Código

### A. Jerarquía de Grados y Control de Regresión Escolar (`frontend-matriculas/src/utils/gradeHierarchy.ts`)
* **Jerarquía Escolar Chilena:** Estructura completa de niveles (NT1, NT2, 1° Básico a 8° Básico, 1° Medio a 4° Medio) tanto para Formación General como Técnico-Profesional.
* **Validación de Transiciones:**
  * **Regresión Bloqueante (`tipo: 'peligro'`):** Si se intenta matricular a un estudiante en un curso estrictamente inferior al que cursó el año anterior (ej. estaba en 6° Básico e intentan inscribirlo en 5° Básico), el sistema emite una alerta roja y **bloquea el botón "Siguiente Paso"**.
  * **Alerta Repitente (`tipo: 'repitente'`):** Si se inscribe en el mismo grado respecto a su matrícula previa, detecta la repitencia y alerta al usuario sin bloquear.
  * **Salto Anormal (`tipo: 'advertencia'`):** Detecta avances de más de 1 grado para revisión administrativa.

### B. Trazabilidad de Traspasos Inter-escolares (`backend/services/matricula_service.py`)
* Al matricular a un alumno proveniente de otro colegio del SLEP:
  1. Detecta automáticamente si tenía una matrícula activa en otro establecimiento.
  2. Procesa el retiro formal en el colegio de origen con motivo `"Traspaso Inter-escolar"`.
  3. Deja una nota cruzada auditable en la bitácora (`"Traspaso a establecimiento RBD: ..."`).
  4. Permite adjuntar el Certificado de Retiro/Traslado en PDF o Imagen mediante el endpoint `POST /matriculas/{id}/documento-traslado`.
  5. En el colegio de origen, el alumno pasa a figurar con la etiqueta informativa **`Trasladado`** (color índigo), manteniendo la trazabilidad histórica sin inflar la matrícula activa.

### C. Estados `Promovido` y `Repitente` sin Duplicación Activa
* Las matrículas del año escolar en curso se conservan como activas (`Activa`, `Promovido`, `Repitente`).
* El cálculo estadístico en `backend/services/dashboard_service.py` y `matriculas.py` contabiliza a los alumnos promovidos y repitentes de manera unificada con `COUNT(DISTINCT id_estudiante)` por colegio/año para evitar duplicados en desgloses de cursos y niveles.

### D. Confidencialidad Estricta en Retiros (`backend/services/reporte_service.py` y `matricula_service.py`)
* Las razones socioemocionales ingresadas por el apoderado en la encuesta de retiro ya no se mezclan con las observaciones públicas de la tabla `matricula`.
* Se guardan exclusivamente en la tabla `encuesta_retiro`.
* En la bitácora de auditoría (`auditoria_matricula`), los snapshots de datos anteriores y nuevos son sanitizados para que no figuren las respuestas privadas del apoderado, registrando en su lugar: `"Retiro formalizado mediante cuestionario confidencial de apoderado."`.

### E. Directorio de Matrículas y Visualización de Motivos (`Matriculas.tsx` y `ModalDetalleMotivo.tsx`)
* En la grilla de matrículas:
  * Si el estudiante está en estado `Retirado` o `Trasladado`, aparece el botón interactivo **`Motivo Retiro`**.
  * Si el estudiante cambió de curso dentro del colegio, aparece el botón interactivo **`Motivo Traslado`**.
  * Al hacer clic, se abre el modal moderno **`ModalDetalleMotivo.tsx`**, que muestra fecha, actor, curso de origen/destino y justificación.
  * Se conserva de forma paralela la visualización del Certificado de Retiro oficial en PDF.

### F. Directorio de Estudiantes y Ficha Histórica (`Estudiantes.tsx`)
* El historial de matrículas en el drawer lateral ahora cuenta con pestañas por año escolar organizadas cronológicamente, permitiendo revisar en detalle cada período de matrícula sin saturar la vista.
* Se soporta la matrícula directa de postulantes nuevos sin historial previo (`0` registros previos) sin que lance errores de estudiante no encontrado.

### G. Seguridad Multi-Tenant y Roles (`backend/security.py` y `auth_service.py`)
* Funciones de aislamiento: `es_usuario_slep(usuario)`, `es_usuario_colegio(usuario)` y `validar_acceso_colegio(id_est, usuario)`.
* Bloqueo estricto para impedir que un usuario de colegio consulte o modifique datos de otro establecimiento distinto al asignado en su sesión.
* Comparación de roles insensible a mayúsculas/minúsculas (`colegio`, `COLEGIO`, `slep`, `admin_slep`).

### H. Prevención de Deadlocks en Capacidad de Cursos (`establecimientos_service.py`)
* `obtener_capacidad_curso(..., cur=None)` ahora acepta un cursor existente (`cur=cur`), evitando solicitar una segunda conexión del pool multihilo durante la transacción de creación de matrícula.

---

## 5. Compatibilidad Absoluta con el Trabajo de Diego

Todos los componentes creados por Diego permanecen 100% operativos:
* **Firma con SIMPLE y Clave Única:** El botón `"Registrar y Enviar a Firma"` en `NuevaMatricula.tsx`, la modal `ModalExito.tsx` con su QR de `qrcode.react`, y la redirección a SIMPLE funcionan tal cual fueron diseñados.
* **Edge Function `sync-matricula`:** Totalmente compatible; la función SQL `buscar_matricula_por_rut` no fue alterada y sigue sirviendo al webhook.
* **Tabla `firma_matricula`:** No fue tocada ni alterada en sus definiciones.

---

## 6. Procedimiento para Integrar a `main`

Cuando el equipo decida incorporar estos cambios a producción:

1. **Aplicar la migración SQL en Supabase:**
   Ejecutar el script del punto 2 en Supabase SQL Editor.
2. **Revisar la rama local:**
   ```bash
   git checkout feature/integracion-prod-mejoras
   ```
3. **Verificar compilación:**
   ```bash
   cd frontend-matriculas
   npm run build
   ```
4. **Hacer merge hacia la rama deseada (o crear un Pull Request):**
   ```bash
   git checkout main
   git merge feature/integracion-prod-mejoras
   # O subir la rama de feature para abrir un PR en GitHub:
   # git push origin feature/integracion-prod-mejoras
   ```
