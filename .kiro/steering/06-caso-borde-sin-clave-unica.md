# Caso borde: apoderado SIN Clave Única (firma manual / papel)

Estado: **PENDIENTE DE DECISIÓN E IMPLEMENTACIÓN**. Documento de análisis, no cableado aún.

## El problema
El flujo de renovación 2027 (piloto) asume que el apoderado firma en **SIMPLE con Clave
Única**. Pero no todos la tienen: adultos mayores, apoderados extranjeros recién llegados,
personas sin acceso digital o sin celular. Sin una alternativa, esos alumnos **no podrían
completar su renovación** y quedarían atascados en `estado_renovacion = 'Por renovar'`.

La necesidad concreta (según el dueño): las escuelas tendrán **fichas impresas** para
autorizar los documentos (religión, acta de compromiso, autorización de entrevistas, uso de
imágenes). El apoderado firma en papel, y el funcionario debe **adjuntar el documento
escaneado manualmente** al sistema para dejar la matrícula como válida/firmada.

## Lo que YA existe y se puede reutilizar
- Columna `matricula.metodo_firma` (VARCHAR 30): hoy se usa `'clave_unica_simple'` para la
  firma digital. Se puede agregar un valor `'manual_papel'` para este caso.
- Columna `matricula.estado_renovacion`: `Por renovar` | `Pendiente firma` | `Firmada` |
  `No renueva` | `Egresado` (CHECK en `apply_renovacion_migration.py`).
- Patrón de **subida de archivos** ya probado en el sistema:
  - `POST /matriculas/{id}/documento-resolucion` (sobrecupo) y
    `POST /estudiante/{rut}/documento-tutor`, ambos usan `services/storage_service.py`
    (guardado local o S3 según `STORAGE_PROVIDER`) con `validar_tamano_archivo` (máx 5 MB).
  - Columnas `matricula.ruta_documento_resolucion` y `apoderado.ruta_documento_tutor` son el
    precedente de "ruta a un archivo adjunto".
- La pantalla `ConfirmarRenovacion.tsx` ya recolecta las respuestas del apoderado (religión,
  acta, entrevista, imágenes) y actualiza datos de estudiante/apoderado.

## Alternativas propuestas (de menor a mayor esfuerzo)

### Opción A — Adjuntar ficha firmada en papel (RECOMENDADA)
Reutiliza el patrón de documento adjunto ya existente.
1. En la pantalla de confirmación, ofrecer al funcionario dos caminos:
   **"Firma digital (Clave Única)"** → flujo actual con QR/SIMPLE.
   **"Firma manual (papel)"** → para quien no tiene Clave Única.
2. En el camino manual: el funcionario descarga/imprime la ficha de autorización (se puede
   reutilizar el PDF que ya genera `pdf_service`), el apoderado la firma físicamente, y el
   funcionario **sube el escaneo** (PDF/JPG).
3. Backend: nueva columna `matricula.ruta_documento_firma_manual` (VARCHAR 500) + endpoint
   `POST /matriculas/{id}/documento-firma-manual` (idéntico patrón a documento-resolucion,
   usando storage_service). Al subir con éxito:
   - `estado_renovacion = 'Firmada'`, `metodo_firma = 'manual_papel'`.
   - Guardar las respuestas (religión/acta/entrevista/imágenes) que el funcionario capturó
     del papel en las columnas ya existentes.
4. Migración idempotente `apply_*.py` para la columna nueva (patrón del proyecto).
- **Ventaja:** mínimo desarrollo, reutiliza storage + estados existentes, queda respaldo
  legal escaneado. **Costo:** el funcionario tipea las opciones del papel a mano.

### Opción B — Registrar firma manual SIN adjunto (solo declaración del funcionario)
El funcionario declara "firmado en papel, documento archivado en el establecimiento" y marca
la matrícula como `Firmada` con `metodo_firma='manual_papel'`, sin subir archivo.
- **Ventaja:** más rápido para el funcionario. **Riesgo:** no queda respaldo digital; el
  papel vive solo en el colegio (auditoría más débil). Aceptable si legal lo permite.

### Opción C — Nuevo estado intermedio "Firma manual pendiente de carga"
Agregar a `estado_renovacion` un valor extra (ej. `'Firma manual'`) para distinguir en el
panel las que se firmaron en papel de las digitales. Combina con A o B.
- **Ventaja:** trazabilidad clara (cuántas digitales vs papel). **Costo:** ampliar el CHECK
  y los badges del frontend.

## Decisiones abiertas (para el dueño)
1. ¿Se exige adjuntar el escaneo (Opción A) o basta la declaración del funcionario (B)?
2. ¿La ficha en papel la genera el sistema (reusar PDF de `pdf_service`) o el colegio usa su
   propio formato impreso?
3. ¿Se necesita distinguir en reportes "firma digital" vs "firma manual"? (define si se hace
   la Opción C).
4. Validez legal: confirmar con el área jurídica del SLEP si una firma en papel escaneada
   tiene la misma validez que la Clave Única para estos documentos. Esto **manda** sobre la
   decisión técnica.
5. ¿Quién puede usar el camino manual? (sugerido: solo rol Colegio con el apoderado presente,
   nunca a distancia, para evitar abuso).

## Recomendación resumida
Ir por **Opción A + un valor de estado propio (C liviano)**: subir el escaneo de la ficha
firmada, marcar `metodo_firma='manual_papel'` y `estado_renovacion='Firmada'`, con badge
diferenciado en la grilla. Reutiliza todo lo existente y deja respaldo auditable. Confirmar
antes el punto 4 (validez legal), que es el que realmente habilita esta vía.
